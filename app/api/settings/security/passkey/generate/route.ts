import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";

const rpName = "TrustVerify KYC";
const rpID = "localhost"; // En production, ce sera 'trustverify.com'

export async function GET() {
    try {
        const session = await getServerSession();
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            include: { passkeys: true }
        });

        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

        const excludeCredentials = user.passkeys.map(passkey => ({
            id: passkey.credentialID,
            type: "public-key" as const,
            transports: passkey.transports ? (passkey.transports.split(',') as any[]) : undefined,
        }));

        // 💡 LA CORRECTION EST ICI : On transforme le String en données binaires (Uint8Array)
        const userIDBuffer = new TextEncoder().encode(user.id);

        const options = await generateRegistrationOptions({
            rpName,
            rpID,
            userID: userIDBuffer, // 👈 On passe la donnée binaire ici
            userName: user.email,
            userDisplayName: user.fullName,
            attestationType: "none",
            excludeCredentials,
            authenticatorSelection: {
                residentKey: "preferred",
                userVerification: "preferred", 
            },
        });

        await prisma.user.update({
            where: { id: user.id },
            data: { currentChallenge: options.challenge },
        });

        return NextResponse.json(options);
    } catch (error: any) {
        console.error("Passkey Generate Error:", error);
        return NextResponse.json({ error: "Failed to generate passkey challenge" }, { status: 500 });
    }
}