// ============================================================================
// 📱 2FA TOTP — ÉTAPE 1/2 : GÉNÉRATION DU SECRET + QR CODE
// ============================================================================
// Fonctionne en tandem avec ./verify/route.ts (étape 2/2). Cette route génère
// un nouveau secret TOTP et son QR code à CHAQUE appel, mais NE L'ENREGISTRE
// PAS en base — voir le commentaire "ARCHITECTURE STATELESS" plus bas : tant
// que l'utilisateur n'a pas prouvé (à l'étape 2) qu'il a bien scanné le QR et
// que son app génère les bons codes, on ne veut pas activer une 2FA qu'il ne
// pourrait pas honorer (ce qui le verrouillerait hors de son compte).
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { generateSecret, generateURI } from "otplib";
import QRCode from "qrcode";

export async function POST() {
    try {
        // 🔒 CONFINEMENT PHASE 0 : Identité garantie
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized access. Valid session required." }, { status: 401 });
        }

        // 1. Génération du secret cryptographique (20 octets, standard RFC 6238)
        const secret = generateSecret({ length: 20 });

        // 2. Formatage de l'URI (Ce que Google Authenticator lit en scannant)
        // On inclut le nom de l'application et l'email pour que ce soit propre dans le téléphone de l'utilisateur
        const appName = "TrustVerify B2B";
        const otpauthUrl = generateURI({
            issuer: appName,
            label: session.user.email,
            secret,
        });

        // 3. Transformation mathématique de l'URI en image scannable (QR Code base64)
        const qrCodeUrl = await QRCode.toDataURL(otpauthUrl, {
            width: 300,
            margin: 2,
            color: {
                dark: '#0f172a',  // Un bleu très foncé pour un look pro
                light: '#ffffff'
            }
        });

        // 💡 ARCHITECTURE STATELESS : On envoie le secret au client, 
        // MAIS on ne le sauvegarde pas encore en BDD pour éviter de le bloquer s'il annule.
        return NextResponse.json({ secret, qrCodeUrl }, { status: 200 });

    } catch (error) {
        console.error("TOTP Generation Error:", error);
        return NextResponse.json({ error: "Failed to generate 2FA secure tokens." }, { status: 500 });
    }
}