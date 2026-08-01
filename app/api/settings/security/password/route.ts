// ============================================================================
// 🔑 CHANGEMENT DE MOT DE PASSE (depuis les Settings, utilisateur déjà connecté)
// ============================================================================
// ⚠️ Ne pas confondre avec app/api/auth/reset-password : cette route-ci sert à
// un utilisateur CONNECTÉ qui connaît son mot de passe actuel et veut en
// changer. L'autre sert à quelqu'un qui l'a OUBLIÉ et prouve son identité via
// un lien reçu par email. Deux flux, deux preuves d'identité différentes.
//
// ✅ [PHASE B] Corrections apportées : session résolue avec authOptions,
// rate limiting, coût bcrypt aligné sur le reste du projet (12 tours),
// invalidation des liens de réinitialisation en cours, et journalisation
// dans la piste d'audit.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
// 🆕 [PHASE B] Import ajouté — voir la note sur getServerSession plus bas.
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import bcrypt from "bcryptjs";
// 🆕 [PHASE B] Limitation des tentatives (Upstash Redis).
import { enforceRateLimit, passwordChangeLimiter } from "@/lib/ratelimit";
// 🆕 [PHASE B] Journalisation des événements de sécurité.
import { logSecurityEvent } from "@/lib/logger";

// 🆕 [PHASE B] Coût de hachage bcrypt, aligné sur le reste du projet.
//
// ⚠️ CE FICHIER UTILISAIT 10 TOURS alors que register, reset-password et
// l'invitation d'agent en utilisent 12. Chaque tour DOUBLE le temps de calcul :
// 10 tours est donc 4 fois plus rapide à casser par force brute que 12.
//
// La conséquence était contre-intuitive et dangereuse : un utilisateur qui
// changeait son mot de passe se retrouvait avec une protection PLUS FAIBLE
// qu'à son inscription. Une incohérence de ce type devient toujours le maillon
// faible — un attaquant s'attaque au hash le moins coûteux, pas au plus solide.
const BCRYPT_ROUNDS = 12;

export async function POST(req: Request) {
    try {
        // 🆕 [PHASE B] `authOptions` est désormais passé explicitement.
        //
        // Le commentaire d'origine notait cette incohérence de style — c'est en
        // réalité plus qu'un détail cosmétique. Sans cet argument, NextAuth tente
        // de retrouver sa configuration par un mécanisme implicite, dont le
        // comportement dépend du contexte d'exécution (App Router, Edge, build).
        // S'il échoue, la session est vue comme absente et la route renvoie 401 à
        // un utilisateur pourtant parfaitement connecté — une panne difficile à
        // relier à ce fichier. Toutes les autres routes du projet passent
        // authOptions ; celle-ci s'aligne.
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        // ====================================================================
        // 🆕 [PHASE B] LIMITE DE TENTATIVES
        // ====================================================================
        // Le scénario bloqué : quelqu'un accède à une session déjà ouverte (poste
        // non verrouillé, appareil volé) et veut s'approprier le compte. Il lui
        // faut le mot de passe ACTUEL, qu'il ignore. Sans limite, il pouvait le
        // deviner par essais successifs, tranquillement, depuis l'interface.
        //
        // 💡 Limité PAR UTILISATEUR (via son email) et non par IP : la route est
        // authentifiée, on sait exactement qui appelle. Une limite par IP
        // pénaliserait tous les agents d'une entreprise partageant la même
        // connexion — même raisonnement que pour /api/chat.
        const rateLimited = await enforceRateLimit(
            passwordChangeLimiter,
            session.user.email
        );
        if (rateLimited) return rateLimited;

        // 🆕 [PHASE B] `req.json()` remplace `JSON.parse(await req.text())`.
        // L'ancienne écriture lisait le corps en texte pour le parser
        // manuellement, avec un `await` superflu devant JSON.parse (qui est
        // synchrone). Même résultat, trois détours en moins.
        const { currentPassword, newPassword } = await req.json();

        if (!currentPassword || !newPassword) {
            return NextResponse.json({ error: "All fields are required" }, { status: 400 });
        }

        // 💡 LA VÉRIFICATION STRICTE (Identique à la page Register)
        const correctLength = newPassword.length >= 12;
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);

        if (!correctLength || !hasSpecialChar) {
            return NextResponse.json({ 
                error: "The new password must be at least 12 characters long and contain at least 1 special symbol." 
            }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email }
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Compte créé via Google OAuth : `password` est null (jamais défini).
        // Ce garde-fou évite un crash de bcrypt.compare() sur une valeur null
        // et renvoie un message clair plutôt qu'une 500 opaque.
        //
        // 🆕 [PHASE B] Message rendu ACTIONNABLE. "No password is set for this
        // user" décrit l'état du système sans dire à l'utilisateur quoi faire —
        // il resterait bloqué sans comprendre. Le nouveau message le renvoie vers
        // le flux "Mot de passe oublié", qui permet précisément de DÉFINIR un
        // premier mot de passe sur un compte Google (voir reset-password).
        if (!user.password) {
            return NextResponse.json({ 
                error: "Your account uses Google Sign-In and has no password yet. Use \"Forgot password?\" on the login page to set one." 
            }, { status: 400 });
        }

        const isPasswordMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordMatch) {
            // 🆕 [PHASE B] Un mot de passe actuel erroné est journalisé : c'est
            // exactement la trace qu'on veut avoir si quelqu'un tente de
            // s'approprier un compte depuis une session ouverte.
            if (user.companyId) {
                await logSecurityEvent({
                    action: "LOGIN_FAILED",
                    details: "Password change attempt failed: incorrect current password.",
                    companyId: user.companyId,
                    agentId: user.id,
                });
            }
            return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
        }

        // 🆕 [PHASE B] 12 tours au lieu de 10 (voir BCRYPT_ROUNDS plus haut).
        const hashedNewPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

        // 🆕 [PHASE B] Les deux opérations dans une transaction : le mot de passe
        // change ET les liens de réinitialisation en cours sont invalidés, ou
        // rien ne se passe. Sans cette atomicité, une panne entre les deux
        // laisserait un lien encore valide alors que le mot de passe a changé.
        await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: user.id },
                data: { password: hashedNewPassword }
            });

            // 🔒 INVALIDATION DES LIENS DE RÉINITIALISATION EN ATTENTE.
            //
            // Le scénario évité : un utilisateur demande un lien "mot de passe
            // oublié", puis se souvient finalement de son mot de passe et le
            // change ici. Sans ce nettoyage, le lien envoyé par email resterait
            // valide 30 minutes — n'importe qui l'interceptant pourrait écraser
            // le mot de passe tout juste défini.
            await tx.passwordResetToken.deleteMany({
                where: { userId: user.id, usedAt: null },
            });
        });

        // 📜 AUDIT TRAIL : un changement de mot de passe est un événement de
        // sécurité majeur. Il doit laisser une trace consultable dans l'écran
        // "Audit Trail", au même titre qu'une connexion ou une décision KYC.
        if (user.companyId) {
            await logSecurityEvent({
                action: "PASSWORD_CHANGED",
                details: "User changed their password from the security settings.",
                companyId: user.companyId,
                agentId: user.id,
            });
        }

        // ⚠️ LIMITE CONNUE : les sessions déjà ouvertes sur d'autres appareils
        // ne sont PAS invalidées par ce changement. Avec la stratégie JWT, les
        // tokens émis restent valides jusqu'à leur expiration naturelle — un
        // attaquant disposant déjà d'une session y resterait. Même racine que
        // l'item M2 de la roadmap (révocation de session cosmétique), et cela
        // se corrigera avec lui en passant aux sessions stockées en base.

        return NextResponse.json({ message: "Password updated successfully" });

    } catch (error: any) {
        console.error("Password API Error:", error);
        return NextResponse.json({ error: "Internal failure during password update" }, { status: 500 });
    }
}