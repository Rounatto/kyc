// ============================================================================
// 📱 2FA TOTP — ÉTAPE 2/2 : VÉRIFICATION + ACTIVATION DÉFINITIVE
// ============================================================================
// Reçoit le `secret` généré par ../generate (renvoyé au client, pas encore en
// DB) + le code à 6 chiffres que l'utilisateur vient de lire dans son app
// authenticator. Si le code correspond, on considère que l'utilisateur a bien
// configuré son app correctement, et SEULEMENT MAINTENANT on écrit le secret
// en base + on active le flag `totpEnabled`.
//
// ✅ [PHASE B — RÉSOLU] Le secret n'est plus écrit en clair : il passe par
// encrypt() (AES-256-GCM, voir lib/crypto.ts) avant d'atteindre la base. Un
// dump de la table User ne révèle donc plus de quoi générer les codes 2FA.
// ⚠️ La ligne `console.log` ci-dessous n'est PAS la piste d'audit officielle
// (celle-ci passe par lib/logger.ts → table AuditLog) : c'est juste un log
// console, invisible dans l'écran "Audit Trail" de l'app.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { verifySync } from "otplib";
// 🆕 [PHASE B] Module de chiffrement au repos.
import { encrypt } from "@/lib/crypto";

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
        // 💡 Note : on vérifie avec le secret EN CLAIR reçu du client — le
        // chiffrement n'intervient qu'au moment de l'écriture en base, juste
        // en dessous. otplib ne saurait pas quoi faire d'une valeur chiffrée.
        const { valid: isValid } = verifySync({ token, secret });

        if (!isValid) {
            // L'erreur classique : l'utilisateur a tapé un code expiré ou s'est trompé
            return NextResponse.json({ 
                error: "Invalid or expired code. Please try the new code on your app." 
            }, { status: 400 });
        }

        // 🆕 [PHASE B] 2. CHIFFREMENT AVANT LE SCELLEMENT EN BASE
        // Le code saisi est valide : l'utilisateur a bien scanné le QR et son
        // app génère les bons codes. On peut activer la 2FA.
        //
        // Le secret est chiffré ICI, juste avant l'écriture. À partir de
        // maintenant, la colonne `totpSecret` contient une chaîne du type
        // "enc:v1:a3f2...:8b1c...:d94e..." et non plus le secret lisible.
        //
        // Si le chiffrement échoue (ENCRYPTION_KEY absente ou malformée), on
        // n'écrit RIEN et on renvoie une erreur : mieux vaut refuser d'activer
        // la 2FA que de l'activer avec un secret non protégé, ou pire, écrire
        // une valeur corrompue qui bloquerait l'utilisateur au prochain login.
        let encryptedSecret: string;
        try {
            encryptedSecret = encrypt(secret);
        } catch (cryptoError) {
            console.error("[2FA] Échec du chiffrement du secret TOTP :", cryptoError);
            return NextResponse.json({
                error: "Server encryption is not configured. Please contact your administrator."
            }, { status: 500 });
        }

        // 3. LE SCELLEMENT DANS LA BASE DE DONNÉES
        await prisma.user.update({
            where: { email: session.user.email },
            data: {
                totpEnabled: true,
                totpSecret: encryptedSecret // 🆕 [PHASE B] chiffré, plus en clair
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