import { NextResponse } from "next/server";
import { generateAuthenticationOptions, type AuthenticatorTransportFuture } from "@simplewebauthn/server";
import prisma from "@/lib/prisma";

const rpID = "localhost"; 

export async function POST(req: Request) {
    try {
        const { email } = await req.json(); // Le fameux POST qui reçoit l'email !
        if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

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
            rpID,
            allowCredentials,
            userVerification: "preferred",
        });

        // 4. On sauvegarde le défi en BDD
        await prisma.user.update({
            where: { id: user.id },
            data: { currentChallenge: options.challenge },
        });

        return NextResponse.json(options);
    } catch (error: any) {
        console.error("Passkey Generate Login Error:", error);
        return NextResponse.json({ error: "Failed to generate login challenge" }, { status: 500 });
    }
}