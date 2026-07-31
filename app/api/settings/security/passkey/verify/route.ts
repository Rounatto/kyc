// ============================================================================
// 🔐 WEBAUTHN — ENREGISTREMENT D'UNE NOUVELLE PASSKEY, ÉTAPE 2/2
// ============================================================================
// Reçoit la réponse signée par l'appareil (Face ID, empreinte, clé USB...) en
// réaction au challenge généré par ./generate, la fait valider par
// SimpleWebAuthn contre le challenge stocké (`user.currentChallenge`), puis
// persiste la clé publique + le compteur anti-rejeu dans le modèle `Passkey`.
// Ce `counter` est incrémenté à chaque connexion (voir [...nextauth]/route.ts)
// pour détecter un clonage de clé (une valeur qui ne progresse pas = suspect).
//
// ✅ [PHASE B — RÉSOLU] Le challenge expire désormais (5 min, écrites par
// ./generate) et cette route refuse tout challenge périmé.
import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST(req: Request) {
    try {
        // 🔒 Sécurité : On s'assure que la session est valide
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();

        const user = await prisma.user.findUnique({
            where: { email: session.user.email }
        });

        if (!user || !user.currentChallenge) {
            return NextResponse.json({ error: "No active registration challenge found" }, { status: 400 });
        }

        // ====================================================================
        // 🆕 [PHASE B] VÉRIFICATION DE L'EXPIRATION DU CHALLENGE
        // ====================================================================
        // Même correctif que dans le flux de connexion : sans cette vérification,
        // un challenge d'enregistrement généré puis abandonné restait valide
        // indéfiniment, et une réponse signée pour lui pouvait être rejouée bien
        // plus tard pour rattacher une clé au compte.
        //
        // 🔒 FAIL-CLOSED SUR `null` : un challenge sans date est traité comme
        // expiré (cas des challenges antérieurs à ce correctif). L'utilisateur
        // n'a qu'à relancer l'enregistrement — un inconvénient bien moindre
        // qu'une validité illimitée accordée par défaut.
        //
        // 🧹 Purge du challenge périmé au passage, pour ne pas laisser de valeur
        // morte en base et garantir un redémarrage propre.
        const challengeExpires = (user as any).challengeExpires as Date | null;
        if (!challengeExpires || new Date() > challengeExpires) {
            await prisma.user.update({
                where: { id: user.id },
                data: { currentChallenge: null, challengeExpires: null },
            });
            return NextResponse.json(
                { error: "Registration challenge expired. Please start again." },
                { status: 400 }
            );
        }

        // 💡 SÉCURITÉ : Faille de Claude n°5 corrigée (Variables d'environnement)
        const rpID = process.env.WEBAUTHN_RPID || "localhost";
        const origin = process.env.WEBAUTHN_ORIGIN || `http://${rpID}:3000`;

        let verification;
        try {
            verification = await verifyRegistrationResponse({
                response: body,
                expectedChallenge: user.currentChallenge,
                expectedOrigin: origin,
                expectedRPID: rpID,
                // 💡 SÉCURITÉ MILITAIRE : Fini la souplesse, on exige le PIN/Biométrie !
                requireUserVerification: true, 
            });
        } catch (error: any) {
            console.error("Verification failed:", error.message);
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        if (verification.verified && verification.registrationInfo) {
            const { id, publicKey, counter } = verification.registrationInfo.credential;
            
            await prisma.passkey.create({
                data: {
                    userId: user.id,
                    credentialID: id,
                    credentialPublicKey: Buffer.from(publicKey), 
                    counter: counter,
                    transports: body.response.transports?.join(','),
                },
            });

            // 🆕 [PHASE B] La date d'expiration est effacée en même temps que le
            // challenge : une donnée orpheline en base n'a aucune conséquence
            // fonctionnelle, mais elle finit toujours par tromper quelqu'un qui
            // la relit plus tard.
            await prisma.user.update({
                where: { id: user.id },
                data: { currentChallenge: null, challengeExpires: null },
            });

            return NextResponse.json({ verified: true, message: "Passkey successfully registered!" });
        }

        return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    } catch (error: any) {
        console.error("Passkey Verify Error:", error);
        return NextResponse.json({ error: "Internal server error during verification" }, { status: 500 });
    }
}