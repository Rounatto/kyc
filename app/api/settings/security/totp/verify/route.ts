import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { verifySync } from "otplib";

export async function POST(req: Request) {
    try {
        // 🔒 CONFINEMENT PHASE 0 : Identité garantie
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized access." }, { status: 401 });
        }

        const body = await req.json();
        const { token, secret } = body;

        if (!token || !secret || token.length !== 6) {
            return NextResponse.json({ error: "Invalid verification parameters." }, { status: 400 });
        }

        // 1. VÉRIFICATION CRYPTOGRAPHIQUE (Le cœur du réacteur)
        // On laisse otplib faire les mathématiques temporelles complexes (HMAC-SHA1)
        const { valid: isValid } = verifySync({ token, secret });

        if (!isValid) {
            // L'erreur classique : l'utilisateur a tapé un code expiré ou s'est trompé
            return NextResponse.json({ 
                error: "Invalid or expired code. Please try the new code on your app." 
            }, { status: 400 });
        }

        // 2. LE SCELLEMENT DANS LA BASE DE DONNÉES
        // C'est validé ! On peut maintenant écrire le secret dans la table User et activer le flag
        await prisma.user.update({
            where: { email: session.user.email },
            data: {
                totpEnabled: true,
                totpSecret: secret // 💡 Ce secret servira au prochain Login !
            }
        });

        // Piste d'audit (Excellente pratique B2B)
        console.log(`🛡️ 2FA Successfully enabled for user: ${session.user.email}`);

        return NextResponse.json({ 
            message: "Two-Factor Authentication has been successfully enabled." 
        }, { status: 200 });

    } catch (error) {
        console.error("TOTP Verification Error:", error);
        return NextResponse.json({ error: "Internal server error during verification." }, { status: 500 });
    }
}