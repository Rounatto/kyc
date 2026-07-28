// ============================================================================
// 🆕 [PHASE B] 🔓 MOT DE PASSE OUBLIÉ — ÉTAPE 1/2 : ENVOI DU LIEN
// ============================================================================
// Fonctionne en tandem avec app/api/auth/reset-password (étape 2/2), sur le
// même principe que register → verify-register : cette route ne modifie AUCUN
// mot de passe. Elle se contente de générer un jeton à usage unique et de
// l'envoyer par email. Le changement réel n'a lieu qu'à l'étape 2, une fois le
// jeton présenté.
//
// Pourquoi cette fonctionnalité est indispensable : sans elle, un utilisateur
// qui oublie son mot de passe est DÉFINITIVEMENT verrouillé dehors — la seule
// issue serait une intervention manuelle en base de données.
//
// 🔒 LES 4 PRINCIPES DE SÉCURITÉ APPLIQUÉS ICI (détaillés dans le code) :
//   1. Réponse TOUJOURS identique, que l'email existe ou non (anti-énumération)
//   2. Seule l'empreinte SHA-256 du jeton est stockée (jamais le jeton lui-même)
//   3. Fenêtre de validité très courte (30 min) et usage unique
//   4. Rate limiting strict, puisque chaque appel envoie un vrai email
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import crypto from "crypto";
import { sendPasswordResetEmail } from "@/lib/mail";
import { enforceRateLimit, getClientIp, passwordResetLimiter } from "@/lib/ratelimit";

// Durée de validité du lien. Volontairement courte : plus la fenêtre est
// longue, plus longtemps un email intercepté reste exploitable par un attaquant.
// 30 minutes laisse largement le temps d'ouvrir sa boîte mail sans exposer le
// compte pendant des heures.
const TOKEN_LIFETIME_MS = 30 * 60 * 1000;

const forgotPasswordSchema = z.object({
    email: z.string().email("Format d'email invalide").toLowerCase().trim(),
});

// ⚠️ RÉPONSE UNIQUE, RENVOYÉE DANS TOUS LES CAS DE FIGURE.
//
// C'est LE point de sécurité central de cette route. Si on répondait "cet email
// n'existe pas" quand le compte est inconnu, on offrirait un outil gratuit pour
// tester des milliers d'adresses et dresser la liste de nos clients — une
// information à valeur commerciale, et le préalable classique à une campagne de
// phishing ciblé. C'est exactement le défaut que présente encore
// /api/auth/passkey/generate-login (item 8 de la roadmap Phase B).
//
// La formulation ("Si un compte existe...") est volontairement au conditionnel :
// elle est honnête envers l'utilisateur légitime sans rien confirmer à un
// attaquant.
const GENERIC_RESPONSE = {
    message: "Si un compte est associé à cette adresse, un lien de réinitialisation vient d'être envoyé.",
};

export async function POST(req: Request) {
    try {
        // ====================================================================
        // BARRAGE 1/2 — LIMITE PAR ADRESSE IP
        // ====================================================================
        // En tout premier, avant de lire le corps de la requête : une requête
        // destinée à être rejetée ne doit consommer aucune ressource.
        const clientIp = getClientIp(req);
        const ipLimited = await enforceRateLimit(passwordResetLimiter, `ip:${clientIp}`);
        if (ipLimited) return ipLimited;

        const body = await req.json();
        const validationResult = forgotPasswordSchema.safeParse(body);

        // 💡 Même en cas d'email malformé, on renvoie la réponse générique.
        // Un message d'erreur différent ("format invalide" vs le message
        // générique) donnerait déjà une information exploitable sur le
        // traitement effectué. On reste opaque de bout en bout.
        if (!validationResult.success) {
            return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
        }

        const { email } = validationResult.data;

        // ====================================================================
        // BARRAGE 2/2 — LIMITE PAR EMAIL (anti-harcèlement)
        // ====================================================================
        // Un attaquant disposant de nombreuses IP (proxies) resterait sous le
        // seuil sur chacune d'elles tout en envoyant des dizaines d'emails à UNE
        // MÊME victime. Cette limite plafonne les envois par destinataire,
        // quelle que soit l'origine des requêtes.
        //
        // 💡 On utilise l'email normalisé par Zod (.toLowerCase().trim()) : sinon
        // "A@Mail.com" et "a@mail.com" compteraient séparément et l'attaquant
        // doublerait son quota juste en changeant la casse.
        const emailLimited = await enforceRateLimit(passwordResetLimiter, `email:${email}`);
        if (emailLimited) return emailLimited;

        const user = await prisma.user.findUnique({ where: { email } });

        // 🔒 Compte inconnu : on s'arrête ici, mais avec EXACTEMENT la même
        // réponse que pour un compte existant. Rien dans le corps ni dans le
        // code HTTP ne permet de faire la différence.
        //
        // ⚠️ Limite honnête à connaître : le TEMPS de réponse, lui, diffère
        // légèrement (un compte existant déclenche des écritures en base et un
        // envoi d'email, donc quelques centaines de millisecondes de plus). Une
        // mesure fine pourrait théoriquement exploiter cet écart. Le rate
        // limiting rend l'attaque très peu praticable, mais la fuite existe.
        if (!user) {
            return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
        }

        // 💡 CAS DES COMPTES GOOGLE (user.password === null)
        //
        // Un utilisateur inscrit via Google n'a jamais eu de mot de passe. On
        // pourrait refuser la réinitialisation... mais il ne recevrait alors
        // AUCUN email et resterait dans le flou complet.
        //
        // Choix retenu : on autorise, ce qui revient à lui DÉFINIR un mot de
        // passe. C'est le comportement de la plupart des plateformes.
        //
        // ⚠️ Compromis assumé : quelqu'un contrôlant la boîte mail de la victime
        // pourrait ainsi se créer un accès par mot de passe. Deux éléments
        // limitent la portée de ce risque : (1) le contrôle de la boîte mail est
        // déjà une compromission majeure en soi, et (2) si la 2FA est active,
        // le login exigera TOUJOURS le code de l'authenticator — l'accès à
        // l'email ne suffit donc pas à prendre le compte.

        // 🧹 On invalide les demandes précédentes non utilisées de cet
        // utilisateur. Objectif : garantir qu'un SEUL lien est valide à la fois.
        // Sans ça, un utilisateur cliquant 3 fois sur "Forgot password" laisserait
        // 3 liens actifs en circulation, donc 3 occasions d'interception.
        await prisma.passwordResetToken.deleteMany({
            where: { userId: user.id, usedAt: null },
        });

        // ====================================================================
        // 🔑 GÉNÉRATION DU JETON — LE CŒUR DE LA SÉCURITÉ
        // ====================================================================
        // `rawToken` : 32 octets aléatoires cryptographiques, convertis en 64
        // caractères hexadécimaux. C'est cette valeur qui part dans l'email, et
        // elle N'EST JAMAIS ÉCRITE EN BASE.
        //
        // 256 bits d'entropie : impossible à deviner ou à parcourir par force
        // brute, même avec des ressources illimitées.
        const rawToken = crypto.randomBytes(32).toString("hex");

        // `tokenHash` : l'empreinte SHA-256 du jeton. C'est UNIQUEMENT ceci
        // qu'on stocke.
        //
        // Pourquoi : ce jeton vaut un mot de passe temporaire. Si on le stockait
        // en clair, une fuite de la base permettrait de réinitialiser tous les
        // comptes ayant une demande en cours. Même principe que pour
        // `User.password` : on ne garde qu'une empreinte, et on compare les
        // empreintes.
        //
        // 💡 Pourquoi SHA-256 et pas bcrypt (contrairement aux mots de passe) :
        //   1. bcrypt est volontairement LENT pour protéger des mots de passe
        //      humains, souvent faibles et devinables. Ici, 256 bits d'aléa
        //      rendent le jeton indevinable de toute façon — la lenteur
        //      n'apporterait rien.
        //   2. Surtout : bcrypt utilise un sel aléatoire, donc le même jeton
        //      produit un hash DIFFÉRENT à chaque fois. On ne pourrait jamais
        //      faire un findUnique({ where: { tokenHash } }) à l'étape 2 — il
        //      faudrait charger tous les jetons et les comparer un par un.
        //      SHA-256 est déterministe : même jeton, même empreinte, recherche
        //      directe par index.
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

        await prisma.passwordResetToken.create({
            data: {
                tokenHash,
                userId: user.id,
                expiresAt: new Date(Date.now() + TOKEN_LIFETIME_MS),
            },
        });

        // Le lien contient le jeton BRUT — c'est la seule fois où il existe en
        // dehors de la mémoire du serveur.
        //
        // ⚠️ Faire transiter un secret dans une URL n'est pas idéal en soi (il
        // peut se retrouver dans l'historique du navigateur, les logs d'un proxy,
        // ou l'en-tête Referer). C'est néanmoins le standard universel de ce
        // flux (GitHub, Stripe et les autres font pareil), et les garde-fous
        // sont la durée de vie courte et l'usage unique.
        const resetLink = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${rawToken}`;

        try {
            await sendPasswordResetEmail(user.email, user.fullName, resetLink);
        } catch (mailError) {
            // 🔒 On journalise l'échec côté serveur, mais on renvoie quand même
            // la réponse générique. Répondre "l'envoi a échoué" confirmerait
            // implicitement que le compte existe — ce serait ruiner la protection
            // anti-énumération pour un simple message d'erreur.
            console.error("[FORGOT-PASSWORD] Échec de l'envoi de l'email :", mailError);
        }

        return NextResponse.json(GENERIC_RESPONSE, { status: 200 });

    } catch (error) {
        console.error("🔒 [CRITICAL] Forgot-Password API Failure:", error);
        // Même en cas d'erreur inattendue, on ne révèle rien : réponse générique.
        return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
    }
}