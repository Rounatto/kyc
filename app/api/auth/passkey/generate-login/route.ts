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
//
// ✅ [PHASE B — RÉSOLU] Énumération de comptes corrigée. Cette route répondait
// 404 quand l'email était inconnu et 200 quand il existait : un script pouvait
// donc tester des milliers d'adresses pour dresser la liste des clients de la
// plateforme — information à valeur commerciale, et préalable classique à une
// campagne de phishing ciblé. La réponse est désormais IDENTIQUE dans les deux
// cas (voir buildDecoyOptions plus bas).
//
// ✅ [PHASE B — RÉSOLU] Le challenge expire désormais (voir CHALLENGE_TTL_MS).
import { NextResponse } from "next/server";
import { generateAuthenticationOptions, type AuthenticatorTransportFuture } from "@simplewebauthn/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";
import { enforceRateLimit, getClientIp, passkeyLoginLimiter } from "@/lib/ratelimit";

// ============================================================================
// 🆕 [PHASE B] DURÉE DE VIE DU CHALLENGE
// ============================================================================
// LE PROBLÈME CORRIGÉ : `currentChallenge` ne périmait JAMAIS. Il restait
// valide en base jusqu'à ce qu'une nouvelle tentative l'écrase — parfois des
// semaines plus tard.
//
// Le scénario concret : un utilisateur clique "Passkey", le serveur écrit un
// challenge, puis l'utilisateur ABANDONNE (ferme l'onglet, annule la boîte de
// dialogue, part déjeuner). Ce challenge reste exploitable indéfiniment. Si un
// attaquant obtient une réponse signée pour lui — via un log, un cache, un
// appareil compromis — il peut la REJOUER bien plus tard et se connecter.
//
// 💡 Toute la protection anti-rejeu de WebAuthn repose sur le fait que le
// challenge soit ÉPHÉMÈRE. Sans expiration, elle ne tenait que par accident.
//
// Pourquoi 2 minutes : c'est largement suffisant pour poser un doigt sur un
// capteur ou taper un PIN sur un appareil déjà configuré. La fenêtre d'attaque
// passe d'infinie à 120 secondes.
const CHALLENGE_TTL_MS = 2 * 60 * 1000;

// ============================================================================
// 🆕 [PHASE B] FABRICATION D'UNE RÉPONSE LEURRE
// ============================================================================
// Quand l'email est inconnu (ou n'a pas de passkey), on renvoie un challenge
// parfaitement valide en apparence, associé à un identifiant de clé fictif.
// Du point de vue de l'API, la réponse est indiscernable d'une vraie.
//
// ⚠️ POURQUOI L'IDENTIFIANT FICTIF DOIT ÊTRE STABLE (et pas simplement aléatoire) :
// c'est le détail qui fait toute la différence. Un vrai compte renvoie TOUJOURS
// le même credentialID à chaque appel. Si le leurre renvoyait une valeur
// aléatoire différente à chaque fois, il suffirait d'interroger deux fois le
// même email pour les distinguer : identifiant stable = compte réel,
// identifiant changeant = compte inexistant. Toute la protection s'effondrerait.
//
// La parade : dériver l'identifiant de l'email via un HMAC avec un secret
// serveur. Résultat déterministe (même email → toujours le même identifiant,
// comme un vrai compte), mais impossible à recalculer sans connaître le secret.
function buildDecoyCredentialId(email: string): string {
    const secret = process.env.NEXTAUTH_SECRET || "fallback-decoy-secret";
    const digest = crypto.createHmac("sha256", secret).update(`passkey-decoy:${email}`).digest();
    // Les identifiants WebAuthn réels sont encodés en base64url, généralement
    // sur 16 à 64 octets. On en prend 32 pour rester dans une plage plausible.
    return digest.subarray(0, 32).toString("base64url");
}

export async function POST(req: Request) {
    try {
        // ====================================================================
        // LIMITE PAR ADRESSE IP
        // ====================================================================
        // Complémentaire de la correction anti-énumération ci-dessous : même
        // avec des réponses indiscernables, on borne le volume de tests
        // possibles depuis une même origine.
        //
        // 💡 Pas de limite par email ici, contrairement aux routes OTP : ce
        // serait sans effet. Un attaquant qui énumère teste justement des
        // emails DIFFÉRENTS à chaque requête — un compteur par email ne
        // déclencherait jamais. C'est bien l'IP le bon axe de blocage.
        const clientIp = getClientIp(req);
        const ipLimited = await enforceRateLimit(passkeyLoginLimiter, clientIp);
        if (ipLimited) return ipLimited;

        const { email } = await req.json();
        if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

        // 1. On cherche l'utilisateur et ses clés
        const user = await prisma.user.findUnique({
            where: { email },
            include: { passkeys: true }
        });

        // ====================================================================
        // 🆕 [PHASE B] CAS "COMPTE INCONNU" — RÉPONSE LEURRE, PLUS DE 404
        // ====================================================================
        // On génère un vrai challenge cryptographique, associé à l'identifiant
        // fictif stable calculé plus haut. Le corps de la réponse et le code
        // HTTP sont identiques à ceux d'un compte existant.
        //
        // Ce qui se passe ensuite côté navigateur : l'appareil ne trouve aucune
        // clé correspondant à cet identifiant et refuse l'opération. L'utilisateur
        // voit "Biometric scan cancelled or failed" — exactement le message
        // affiché s'il avait annulé lui-même la boîte de dialogue.
        //
        // ⚠️ LIMITE HONNÊTE DE CETTE PROTECTION : elle ferme l'énumération
        // AUTOMATISÉE (scripts interrogeant l'API en masse), qui est de très
        // loin le scénario réaliste. Elle ne ferme pas une observation fine
        // dans un vrai navigateur : un compte réel déclenche l'invite
        // biométrique, un leurre échoue plus vite. Distinguer les deux demande
        // toutefois un navigateur piloté par email testé — donc lent, coûteux,
        // et fortement bridé par le rate limiting ci-dessus. Le niveau d'effort
        // requis passe de "trivial" à "impraticable à grande échelle".
        //
        // 💡 La solution qui supprimerait totalement le problème serait un flux
        // "usernameless" (clés découvrables : on ne demande plus l'email du tout,
        // le navigateur propose directement les passkeys disponibles). C'est le
        // standard le plus moderne, mais il implique de repenser l'UI de login —
        // à envisager en Phase G plutôt qu'ici.
        if (!user || user.passkeys.length === 0) {
            const decoyOptions = await generateAuthenticationOptions({
                rpID: process.env.WEBAUTHN_RPID || "localhost",
                allowCredentials: [
                    {
                        // 🔧 CHANGÉ ICI : suppression de `type: "public-key" as const`.
                        // C'est LUI qui produisait la rougeur (erreur TS 2353 :
                        // « 'type' does not exist in type { id; transports? } »).
                        //
                        // Cause racine : le type attendu par @simplewebauthn/server
                        // pour une entrée d'allowCredentials ne contient QUE `id` et
                        // `transports`. La lib rajoute elle-même `type: "public-key"`
                        // dans la réponse — le préciser à la main est donc rejeté.
                        //
                        // Concept à retenir — "excess property check" : TypeScript
                        // n'interdit les propriétés en trop QUE sur un objet littéral
                        // écrit DIRECTEMENT dans l'appel (comme ici). C'est pourquoi le
                        // même `type` superflu dans la branche "compte réel" plus bas
                        // ne rougit PAS : là, l'objet passe d'abord par une variable
                        // (`allowCredentials`), ce qui désactive ce contrôle.
                        id: buildDecoyCredentialId(email),
                        transports: ["internal"] as AuthenticatorTransportFuture[],
                    },
                ],
                userVerification: "required",
            });

            // 💡 Aucune écriture en base ici : il n'existe aucun utilisateur à
            // qui rattacher ce challenge. C'est sans conséquence, il ne sera
            // jamais vérifié — l'appareil échouera avant même d'arriver là.
            // 🆕 Corollaire : pas de date d'expiration à écrire non plus.
            return NextResponse.json(decoyOptions);
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
        // 🔧 CHANGÉ ICI : on n'affecte plus le résultat à `const updatedUser`.
        // Cette variable n'était jamais relue → diagnostic TS 6133
        // (« declared but its value is never read »), le petit soulignement grisé.
        // On ne voulait que l'EFFET DE BORD (écrire le challenge en base), pas la
        // valeur de retour : on appelle donc update() sans rien capturer.
        //
        // 🆕 [PHASE B] La date d'expiration est écrite EN MÊME TEMPS que le
        // challenge, dans la même opération. C'est important : deux écritures
        // séparées laisseraient une fenêtre — même infime — où un challenge
        // existerait sans date, donc sans limite de validité.
        await prisma.user.update({
            where: { id: user.id },
            data: {
                currentChallenge: options.challenge,
                challengeExpires: new Date(Date.now() + CHALLENGE_TTL_MS),
            },
        });

        return NextResponse.json(options);
    } catch (error: any) {
        console.error("Passkey Generate Login Error:", error);
        return NextResponse.json({ error: "Failed to generate login challenge" }, { status: 500 });
    }
}