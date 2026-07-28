// ============================================================================
// 📝 INSCRIPTION — ÉTAPE 1/2 : VALIDATION + ENVOI DU CODE OTP
// ============================================================================
// Cette route NE CRÉE AUCUN COMPTE. Elle valide juste que l'email et le nom
// d'entreprise sont disponibles, puis envoie un code à 6 chiffres par email.
// La création réelle du Workspace + de l'administrateur se fait dans
// app/api/auth/verify-register (étape 2/2), une fois ce code confirmé.
//
// ✅ [PHASE B — RÉSOLU] Deux protections ajoutées :
//   1. Rate limiting (par IP et par email) : chaque appel à cette route
//      DÉCLENCHE UN VRAI ENVOI D'EMAIL. Sans limite, on pouvait inonder la
//      boîte mail de n'importe qui en appelant la route en boucle — du
//      harcèlement, aux frais du quota Gmail et de la réputation du domaine.
//   2. Génération de l'OTP par crypto.randomInt (voir plus bas).
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { sendVerificationOtpEmail } from "@/lib/mail";
// 🆕 [PHASE B] Générateur de nombres aléatoires cryptographique (module Node natif).
import crypto from "crypto";
// 🆕 [PHASE B] Limitation du nombre de requêtes (Upstash Redis).
import { enforceRateLimit, getClientIp, otpRequestLimiter } from "@/lib/ratelimit";

// Schéma Zod strict pour la production
const registerSchema = z.object({
    email: z.string().email("Format d'email invalide").toLowerCase().trim(),
    password: z.string().min(12, "Le mot de passe doit faire au moins 12 caractères"),
    fullName: z.string().min(2, "Le nom doit faire au moins 2 caractères").trim(),
    companyName: z.string().min(2, "Le nom de l'entreprise doit faire au moins 2 caractères").trim(),
});

export async function POST(req: Request) {
    try {
        // ====================================================================
        // 🆕 [PHASE B] BARRAGE 1/2 — LIMITE PAR ADRESSE IP
        // ====================================================================
        // En tout premier, avant même de lire le corps de la requête : une
        // requête destinée à être rejetée ne doit consommer aucune ressource.
        //
        // 💡 Le préfixe "ip:" sur l'identifiant est important. On réutilise le
        // MÊME limiteur pour l'IP et pour l'email juste en dessous ; sans ce
        // préfixe, les deux compteurs partageraient le même espace de noms
        // dans Redis et pourraient se mélanger.
        //
        // ⚠️ 3 inscriptions par heure et par IP peut sembler strict pour un
        // bureau partagé, mais créer plusieurs entreprises depuis la même IP en
        // moins d'une heure est un scénario très rare. Pendant tes tests, tu
        // peux temporairement augmenter le seuil dans lib/ratelimit.ts.
        const clientIp = getClientIp(req);
        const ipLimited = await enforceRateLimit(otpRequestLimiter, `ip:${clientIp}`);
        if (ipLimited) return ipLimited;

        const body = await req.json();

        // 1. Validation Zod du payload
        const validationResult = registerSchema.safeParse(body);
        if (!validationResult.success) {
            const errorMessages = validationResult.error.issues.map((err) => err.message).join(", ");
            return NextResponse.json({ error: errorMessages }, { status: 400 });
        }

        const { email, companyName } = validationResult.data;

        // ====================================================================
        // 🆕 [PHASE B] BARRAGE 2/2 — LIMITE PAR EMAIL (anti-harcèlement)
        // ====================================================================
        // C'EST LA PROTECTION LA PLUS IMPORTANTE DE CETTE ROUTE. Un attaquant
        // disposant de nombreuses IP (proxies) resterait sous le seuil sur
        // chacune d'elles tout en envoyant des centaines d'emails à UNE MÊME
        // victime. Cette limite plafonne l'envoi par destinataire, quelle que
        // soit l'origine de la requête.
        //
        // 💡 On utilise `email` normalisé par Zod (.toLowerCase().trim()) et non
        // la valeur brute : sinon "A@Mail.com" et "a@mail.com" compteraient dans
        // deux compteurs distincts et l'attaquant doublerait son quota.
        const emailLimited = await enforceRateLimit(otpRequestLimiter, `email:${email}`);
        if (emailLimited) return emailLimited;

        // 2. Sécurité : Extraction du domaine de l'email (ex: @stripe.com)
        const emailDomain = email.split("@")[1];
        const forbiddenDomains = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "protonmail.com"];
        const isPublicDomain = forbiddenDomains.includes(emailDomain);

        // OPTIONNEL : Décommenter ces lignes en production stricte pour forcer les emails pros
        // if (isPublicDomain) {
        //     return NextResponse.json({ error: "Veuillez utiliser une adresse email professionnelle." }, { status: 400 });
        // }

        // 3. Antécédents : Vérification de l'existence de l'utilisateur
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return NextResponse.json({ error: "Cette adresse email est déjà enregistrée." }, { status: 400 });
        }

        // 4. VERROU ENTREPRISE CRITIQUE : Empêcher la duplication de Tenant
        const existingCompany = await prisma.company.findFirst({
            where: {
                name: {
                    equals: companyName,
                    mode: "insensitive"
                }
            }
        });

        if (existingCompany) {
            return NextResponse.json({ 
                error: `L'organisation "${companyName}" est déjà enregistrée sur la plateforme. Si vous êtes un employé de cette structure, demandez une invitation à votre administrateur.` 
            }, { status: 409 }); 
        }

        // ====================================================================
        // 🛡️ NOUVEAU FLUX PHASE 6 : GÉNÉRATION ET ENVOI DE L'OTP
        // ====================================================================

        // 🆕 [PHASE B] 5. Génération VRAIMENT cryptographique du code à 6 chiffres
        //
        // AVANT : Math.floor(100000 + Math.random() * 900000)
        // Le problème avec Math.random() : ce n'est PAS un générateur
        // cryptographique. Son moteur interne (xorshift128+ dans V8) est
        // déterministe — en observant suffisamment de valeurs produites, il est
        // mathématiquement possible de reconstituer son état interne et donc de
        // PRÉDIRE les valeurs suivantes. Pour un code de sécurité, c'est une
        // faiblesse réelle : un attaquant pourrait deviner l'OTP d'une victime
        // au lieu de le chercher au hasard.
        //
        // MAINTENANT : crypto.randomInt() puise dans l'entropie du système
        // d'exploitation, exactement comme la génération de clés de chiffrement.
        // Aucune prédiction possible, même en connaissant les valeurs passées.
        //
        // 💡 Détail : la borne haute de randomInt est EXCLUE. randomInt(100000,
        // 1000000) produit donc 100000 à 999999 — toujours exactement 6 chiffres,
        // jamais de code commençant par un zéro qui casserait l'affichage.
        const otpCode = crypto.randomInt(100000, 1000000).toString();
        
        // 6. Définition de l'expiration (10 minutes)
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        // 7. Sauvegarde dans la base de données
        // On utilise "upsert" pour écraser l'ancien code si l'utilisateur a cliqué sur "Renvoyer le code"
        await prisma.otpCode.upsert({
            where: { email },
            update: { code: otpCode, expiresAt, createdAt: new Date() },
            create: { email, code: otpCode, expiresAt }
        });

        // 8. Envoi du code par e-mail
        try {
            await sendVerificationOtpEmail(email, otpCode);
        } catch (mailError) {
            console.error("Failed to send OTP email:", mailError);
            return NextResponse.json({ error: "Le service d'email est temporairement indisponible. Veuillez réessayer." }, { status: 500 });
        }

        // 9. On retourne un statut spécifique pour dire au Frontend d'afficher la case OTP
        return NextResponse.json({ 
            message: "Un code de vérification à 6 chiffres a été envoyé à votre adresse email.",
            status: "OTP_SENT" 
        }, { status: 200 });

    } catch (error) {
        console.error("🔒 [CRITICAL] Register OTP Generation Failure:", error);
        return NextResponse.json({ error: "Une erreur interne est survenue lors de la vérification initiale." }, { status: 500 });
    }
}