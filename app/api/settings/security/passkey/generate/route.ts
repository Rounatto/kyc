import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route"; // 💡 LE GARDIEN PHASE 0

const rpName = "TrustVerify KYC B2B"; // 🏢 Touche Pro

export async function GET() {
    try {
        // 🔒 Sécurité : On s'assure que la session est valide avec authOptions
        const session = await getServerSession(authOptions);
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

        const userIDBuffer = new TextEncoder().encode(user.id);

        // 💡 SÉCURITÉ : Faille de Claude n°5 corrigée
        const rpID = process.env.WEBAUTHN_RPID || "localhost";

        const options = await generateRegistrationOptions({
            rpName,
            rpID,
            userID: userIDBuffer,
            userName: user.email,
            userDisplayName: user.fullName,
            attestationType: "none",
            excludeCredentials,
            authenticatorSelection: {
                residentKey: "preferred",
                // 💡 SÉCURITÉ MILITAIRE : On FORCE Windows/Apple à demander le PIN ou la biométrie !
                userVerification: "required", 
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