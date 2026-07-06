import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";

// Configuration de ton application (Relying Party)
const rpName = "TrustVerify KYC";
const rpID = "localhost"; // En production, ce sera 'trustverify.com'
const origin = `http://${rpID}:3000`;

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

        // On liste les clés déjà enregistrées pour dire à l'appareil de ne pas les recréer
        const excludeCredentials = user.passkeys.map(passkey => ({
            id: passkey.credentialID,
            type: "public-key" as const,
            transports: passkey.transports ? (passkey.transports.split(',') as any[]) : undefined,
        }));

        // 💡 GÉNÉRATION DU DÉFI SÉCURISÉ
        const options = await generateRegistrationOptions({
            rpName,
            rpID,
            userID: user.id,
            userName: user.email,
            userDisplayName: user.fullName,
            attestationType: "none",
            excludeCredentials,
            authenticatorSelection: {
                residentKey: "preferred",
                userVerification: "preferred", // Exige FaceID/TouchID/Code PIN
            },
        });

        // On sauvegarde le défi dans la BDD pour vérifier la réponse plus tard
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