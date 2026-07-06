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
            verification = await verifyRegistrationResponse({
                response: body,
                expectedChallenge: user.currentChallenge,
                expectedOrigin: origin,
                expectedRPID: rpID,
                requireUserVerification: false, // On garde cette souplesse pour Google Password Manager
            });
        } catch (error: any) {
            console.error("Verification failed:", error.message);
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        if (verification.verified && verification.registrationInfo) {
            // 💡 LA CORRECTION EST ICI : Extraction propre selon le standard v10+
            const { id, publicKey, counter } = verification.registrationInfo.credential;
            
            await prisma.passkey.create({
                data: {
                    userId: user.id,
                    credentialID: id, // L'ID est déjà au parfait format (base64url) dans la v10
                    credentialPublicKey: Buffer.from(publicKey), // On convertit la clé publique en binaire pour Prisma
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