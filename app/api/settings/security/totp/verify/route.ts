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
// encrypt() (AES-256-GCM, voir lib/crypto.ts) avant d'atteindre la base.
//
// 🆕 [PHASE B] GÉNÉRATION DES CODES DE SECOURS. Sans eux, perdre son téléphone
// signifiait être définitivement verrouillé dehors. Ils sont générés ICI, au
// seul moment où l'on peut les montrer à l'utilisateur, et renvoyés EN CLAIR
// dans la réponse — la seule et unique fois où ils quitteront le serveur.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { verifySync } from "otplib";
import { encrypt } from "@/lib/crypto";
// 🆕 [PHASE B] Génération et hachage des codes de secours.
import { generateBackupCodes, hashBackupCodes } from "@/lib/backup-codes";

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

        // 🆕 [PHASE B] 2. GÉNÉRATION DES CODES DE SECOURS
        //
        // ⚠️ MOMENT CRUCIAL : c'est la SEULE occasion où ces codes existeront en
        // clair hors du navigateur de l'utilisateur. La base ne recevra que des
        // empreintes HMAC — le serveur sera donc mathématiquement incapable de
        // les réafficher plus tard, exactement comme pour une clé API.
        //
        // 💡 On les génère AVANT l'écriture en base, pour que le chiffrement du
        // secret et le hachage des codes échouent ou réussissent ensemble : une
        // 2FA activée sans codes de secours ramènerait le problème qu'on corrige.
        const plainBackupCodes = generateBackupCodes();

        let encryptedSecret: string;
        let hashedBackupCodes: string;
        try {
            encryptedSecret = encrypt(secret);
            hashedBackupCodes = hashBackupCodes(plainBackupCodes);
        } catch (cryptoError) {
            console.error("[2FA] Échec du chiffrement ou du hachage :", cryptoError);
            return NextResponse.json({
                error: "Server encryption is not configured. Please contact your administrator."
            }, { status: 500 });
        }

        // 3. LE SCELLEMENT DANS LA BASE DE DONNÉES
        await prisma.user.update({
            where: { email: session.user.email },
            data: {
                totpEnabled: true,
                totpSecret: encryptedSecret,
                // 🆕 [PHASE B] Empreintes uniquement, jamais les codes lisibles.
                backupCodes: hashedBackupCodes,
            }
        });

        // Piste d'audit (Excellente pratique B2B)
        console.log(`🛡️ 2FA Successfully enabled for user: ${session.user.email}`);

        return NextResponse.json({ 
            message: "Two-Factor Authentication has been successfully enabled.",
            // 🆕 [PHASE B] LES CODES EN CLAIR, RENVOYÉS UNE SEULE FOIS.
            //
            // ⚠️ Cette réponse est la dernière occasion pour l'utilisateur de
            // les sauvegarder. Le frontend DOIT les afficher de façon insistante
            // (téléchargement, copie, confirmation explicite avant fermeture) —
            // un utilisateur qui ferme la modale sans les noter se retrouvera
            // exactement dans la situation qu'on cherche à éviter.
            backupCodes: plainBackupCodes,
        }, { status: 200 });

    } catch (error) {
        console.error("TOTP Verification Error:", error);
        return NextResponse.json({ error: "Internal server error during verification." }, { status: 500 });
    }
}