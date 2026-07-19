// ============================================================================
// 🔐 WEBAUTHN — ENREGISTREMENT D'UNE NOUVELLE PASSKEY, ÉTAPE 2/2
// ============================================================================
// Reçoit la réponse signée par l'appareil (Face ID, empreinte, clé USB...) en
// réaction au challenge généré par ./generate, la fait valider par
// SimpleWebAuthn contre le challenge stocké (`user.currentChallenge`), puis
// persiste la clé publique + le compteur anti-rejeu dans le modèle `Passkey`.
// Ce `counter` est incrémenté à chaque connexion (voir [...nextauth]/route.ts)
// pour détecter un clonage de clé (une valeur qui ne progresse pas = suspect).
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

            await prisma.user.update({
                where: { id: user.id },
                data: { currentChallenge: null },
            });

            return NextResponse.json({ verified: true, message: "Passkey successfully registered!" });
        }

        return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    } catch (error: any) {
        console.error("Passkey Verify Error:", error);
        return NextResponse.json({ error: "Internal server error during verification" }, { status: 500 });
    }
}