// ============================================================================
// 🔐 WEBAUTHN — GÉNÉRATION DU CHALLENGE DE CONNEXION (1/2)
// ============================================================================
// Première moitié du flux passkey côté LOGIN (l'autre moitié, l'enregistrement
// d'une nouvelle clé, se fait dans app/api/settings/security/passkey/*).
// Principe WebAuthn : le serveur génère un "challenge" aléatoire à usage
// unique, l'appareil de l'utilisateur (Face ID, empreinte, clé USB...) le
// signe avec sa clé privée, et NextAuth (voir [...nextauth]/route.ts,
// scénario 1) vérifie cette signature avec la clé publique enregistrée.
// Le challenge est stocké en DB (`user.currentChallenge`) pour être comparé
// au moment de la vérification.
import { NextResponse } from "next/server";
import { generateAuthenticationOptions, type AuthenticatorTransportFuture } from "@simplewebauthn/server";
import prisma from "@/lib/prisma";
// 🆕 [PHASE B] Limitation du nombre de requêtes (Upstash Redis).
import { enforceRateLimit, getClientIp, passkeyLoginLimiter } from "@/lib/ratelimit";

export async function POST(req: Request) {
    try {
        // ====================================================================
        // 🆕 [PHASE B] LIMITE PAR ADRESSE IP
        // ====================================================================
        // Cette route est le principal vecteur d'ÉNUMÉRATION DE COMPTES du
        // projet : elle répond 404 quand l'email est inconnu, et 200 avec un
        // challenge quand il existe. Un script peut donc tester des milliers
        // d'adresses pour dresser la liste de tes clients — une information à
        // valeur commerciale, et un préalable classique au phishing ciblé.
        //
        // ⚠️ Cette limite RALENTIT fortement l'énumération (10 essais/minute au
        // lieu de milliers), mais ne la SUPPRIME pas : la différence de réponse
        // entre email connu et inconnu reste observable. La correction complète
        // (réponses uniformes, avec un faux challenge plausible pour les emails
        // inconnus) est l'item 8 de la Phase B, à traiter séparément.
        //
        // 💡 Pas de limite par email ici, contrairement aux routes OTP : ce
        // serait contre-productif. Un attaquant teste justement des emails
        // DIFFÉRENTS à chaque requête, un compteur par email ne verrait donc
        // jamais rien passer. C'est bien l'IP qui est le bon axe de blocage.
        const clientIp = getClientIp(req);
        const ipLimited = await enforceRateLimit(passkeyLoginLimiter, clientIp);
        if (ipLimited) return ipLimited;

        const { email } = await req.json();
        if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

        // ⚠️ Énumération de comptes : la réponse 404 ci-dessous diffère selon que
        // l'email existe ou non, ce qui permet à un attaquant de deviner quels
        // emails sont enregistrés. Voir roadmap Phase B (anti-énumération).

        // 1. On cherche l'utilisateur et ses clés
        const user = await prisma.user.findUnique({
            where: { email },
            include: { passkeys: true }
        });

        if (!user || user.passkeys.length === 0) {
            return NextResponse.json({ error: "No passkeys registered for this account" }, { status: 404 });
        }

        // 2. On indique à l'appareil quelles clés sont autorisées
        const allowCredentials = user.passkeys.map(passkey => ({
            id: passkey.credentialID,
            type: "public-key" as const,
            transports: passkey.transports ? (passkey.transports.split(',') as AuthenticatorTransportFuture[]) : undefined,
        }));

        // 3. On génère le défi de connexion
        const options = await generateAuthenticationOptions({
            // 💡 SÉCURITÉ : Faille de Claude n°5 corrigée (Plus de localhost en dur)
            rpID: process.env.WEBAUTHN_RPID || "localhost", 
            allowCredentials,
            // 💡 SÉCURITÉ : On FORCE l'appareil à demander le PIN ou l'empreinte (Norme Militaire)
            userVerification: "required", 
        });

        // 4. On sauvegarde le défi en BDD
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: { currentChallenge: options.challenge },
        });

        return NextResponse.json(options);
    } catch (error: any) {
        console.error("Passkey Generate Login Error:", error);
        return NextResponse.json({ error: "Failed to generate login challenge" }, { status: 500 });
    }
}