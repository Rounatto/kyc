import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";

const rpID = "localhost";
const origin = `http://${rpID}:3000`;

export async function POST(req: Request) {
    try {
        const session = await getServerSession();
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

        let verification;
        try {
            // 💡 VÉRIFICATION CRYPTOGRAPHIQUE ABSOLUE
            verification = await verifyRegistrationResponse({
                response: body,
                expectedChallenge: user.currentChallenge,
                expectedOrigin: origin,
                expectedRPID: rpID,
            });
        } catch (error: any) {
            console.error("Verification failed:", error.message);
            return NextResponse.json({ error: "Biometric verification failed" }, { status: 400 });
        }

        if (verification.verified && verification.registrationInfo) {
            const { credentialPublicKey, credentialID, counter } = verification.registrationInfo;

            // On convertit les données pour les stocker proprement dans PostgreSQL
            const credentialIDString = Buffer.from(credentialID).toString('base64url');
            
            await prisma.passkey.create({
                data: {
                    userId: user.id,
                    credentialID: credentialIDString,
                    credentialPublicKey: Buffer.from(credentialPublicKey),
                    counter: counter,
                    transports: body.response.transports?.join(','),
                },
            });

            // On efface le défi (il est à usage unique pour contrer les hackers)
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