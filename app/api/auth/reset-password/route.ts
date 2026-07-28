// ============================================================================
// 🆕 [PHASE B] 🔓 MOT DE PASSE OUBLIÉ — ÉTAPE 2/2 : CHANGEMENT EFFECTIF
// ============================================================================
// Pendant de app/api/auth/forgot-password (étape 1/2), qui a généré un jeton
// et l'a envoyé par email sans rien modifier. C'est ICI, et seulement ici, que
// le mot de passe change réellement — une fois le jeton présenté et validé.
//
// Rappel du mécanisme : l'email contient le jeton BRUT, la base ne contient que
// son empreinte SHA-256. On re-hache donc le jeton reçu et on cherche
// l'empreinte correspondante. Une fuite de la base ne donnerait que des
// empreintes, inexploitables pour réinitialiser quoi que ce soit.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import crypto from "crypto";
import { enforceRateLimit, getClientIp, passwordResetSubmitLimiter } from "@/lib/ratelimit";

const resetPasswordSchema = z.object({
    token: z.string().min(32, "Lien de réinitialisation invalide."),
    // Même exigence que app/api/register : la politique de mot de passe doit
    // être identique partout, sinon ce flux deviendrait une porte dérobée pour
    // contourner les règles imposées à l'inscription.
    password: z.string().min(12, "Le mot de passe doit faire au moins 12 caractères"),
});

// ⚠️ MESSAGE D'ERREUR UNIQUE POUR TOUS LES CAS D'ÉCHEC DU JETON.
//
// On ne distingue volontairement pas "jeton inexistant", "jeton expiré" et
// "jeton déjà utilisé". Ces trois informations n'apporteraient rien à un
// utilisateur légitime (dans tous les cas, il doit redemander un lien) mais
// renseigneraient un attaquant sur l'état exact du système.
const INVALID_TOKEN_MESSAGE = "Ce lien de réinitialisation est invalide, expiré ou a déjà été utilisé. Veuillez en demander un nouveau.";

export async function POST(req: Request) {
    try {
        // ====================================================================
        // LIMITE PAR ADRESSE IP
        // ====================================================================
        // 💡 Le jeton fait 256 bits : il est de toute façon impossible à
        // deviner par force brute. Cette limite ne protège donc pas le secret
        // lui-même — elle borne simplement les abus (soumissions massives qui
        // feraient travailler bcrypt, volontairement coûteux en CPU).
        const clientIp = getClientIp(req);
        const ipLimited = await enforceRateLimit(passwordResetSubmitLimiter, clientIp);
        if (ipLimited) return ipLimited;

        const body = await req.json();
        const validationResult = resetPasswordSchema.safeParse(body);

        if (!validationResult.success) {
            const errorMessages = validationResult.error.issues.map((err) => err.message).join(", ");
            return NextResponse.json({ error: errorMessages }, { status: 400 });
        }

        const { token, password } = validationResult.data;

        // ====================================================================
        // 🔑 RETROUVER LE JETON — LE MÊME CALCUL QU'À L'ÉTAPE 1
        // ====================================================================
        // On re-hache le jeton reçu avec exactement le même algorithme qu'à la
        // génération. SHA-256 étant déterministe, un jeton valide produit
        // forcément l'empreinte déjà présente en base — d'où la recherche
        // directe par index, instantanée.
        //
        // 💡 C'est précisément ce que bcrypt ne permettrait PAS : son sel
        // aléatoire donnerait une empreinte différente à chaque calcul, et il
        // faudrait charger tous les jetons de la base pour les comparer un par un.
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

        const resetToken = await prisma.passwordResetToken.findUnique({
            where: { tokenHash },
            include: { user: true },
        });

        // Trois vérifications successives, un seul message d'erreur commun.
        if (!resetToken) {
            return NextResponse.json({ error: INVALID_TOKEN_MESSAGE }, { status: 400 });
        }

        // 🔒 USAGE UNIQUE. On avait choisi de MARQUER le jeton comme utilisé
        // plutôt que de le supprimer (voir schema.prisma) : ça permet de
        // détecter une tentative de rejeu. Quelqu'un qui réutilise un lien déjà
        // consommé est un signal suspect — potentiellement un email compromis
        // ou un lien intercepté.
        if (resetToken.usedAt) {
            console.warn(
                `[RESET-PASSWORD] Tentative de réutilisation d'un jeton déjà consommé (userId: ${resetToken.userId})`
            );
            return NextResponse.json({ error: INVALID_TOKEN_MESSAGE }, { status: 400 });
        }

        if (new Date() > resetToken.expiresAt) {
            return NextResponse.json({ error: INVALID_TOKEN_MESSAGE }, { status: 400 });
        }

        // Hachage du nouveau mot de passe. 12 tours, comme partout ailleurs
        // dans le projet (register, invitation d'agent) — la cohérence compte :
        // un flux plus permissif deviendrait le maillon faible.
        const hashedPassword = await bcrypt.hash(password, 12);

        // ====================================================================
        // ✍️ ÉCRITURE ATOMIQUE
        // ====================================================================
        // Les trois opérations doivent réussir ou échouer ENSEMBLE. Sans
        // transaction, une panne entre la mise à jour du mot de passe et la
        // consommation du jeton laisserait un lien encore valide alors que le
        // mot de passe a déjà changé — donc réutilisable pour le changer à
        // nouveau.
        await prisma.$transaction(async (tx) => {
            // 1. Le nouveau mot de passe
            await tx.user.update({
                where: { id: resetToken.userId },
                data: { password: hashedPassword },
            });

            // 2. Le jeton est consommé
            await tx.passwordResetToken.update({
                where: { id: resetToken.id },
                data: { usedAt: new Date() },
            });

            // 3. Toutes les autres demandes en cours de cet utilisateur sont
            // invalidées. Scénario concret : quelqu'un demande un lien, puis un
            // second. Sans ce nettoyage, le premier resterait valide et pourrait
            // servir à changer le mot de passe une nouvelle fois — après coup.
            await tx.passwordResetToken.deleteMany({
                where: { userId: resetToken.userId, usedAt: null },
            });

            // 📜 AUDIT TRAIL : le changement de mot de passe est un événement de
            // sécurité majeur, il doit laisser une trace consultable.
            // 💡 Le test sur companyId reprend le pattern déjà utilisé partout
            // dans le projet : ce champ est obligatoire sur AuditLog, mais
            // nullable sur User (compte orphelin ou en cours de rattachement).
            if (resetToken.user.companyId) {
                await (tx as any).auditLog.create({
                    data: {
                        action: "PASSWORD_RESET",
                        details: "Mot de passe réinitialisé via un lien de récupération envoyé par email.",
                        companyId: resetToken.user.companyId,
                        agentId: resetToken.userId,
                    },
                });
            }
        });

        // ⚠️ LIMITE CONNUE ET ASSUMÉE : les sessions déjà ouvertes ne sont PAS
        // invalidées par ce changement. Avec la stratégie JWT, les tokens émis
        // restent valides jusqu'à leur expiration naturelle — un attaquant
        // disposant déjà d'une session active y resterait malgré la
        // réinitialisation. C'est la même racine que l'item M2 de la roadmap
        // (révocation de session cosmétique) et cela se corrigera avec lui,
        // en passant à des sessions stockées en base.

        return NextResponse.json({
            message: "Votre mot de passe a été réinitialisé. Vous pouvez maintenant vous connecter.",
        }, { status: 200 });

    } catch (error) {
        console.error("🔒 [CRITICAL] Reset-Password API Failure:", error);
        return NextResponse.json({ error: "Une erreur interne est survenue." }, { status: 500 });
    }
}