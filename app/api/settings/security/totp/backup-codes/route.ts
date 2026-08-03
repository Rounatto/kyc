// ============================================================================
// 🆕 [PHASE B] 🔑 CODES DE SECOURS — COMPTAGE (GET) ET RÉGÉNÉRATION (POST)
// ============================================================================
// GET  : combien de codes restent utilisables. Sert à afficher un compteur et
//        un avertissement dans les Settings quand la réserve s'épuise.
// POST : génère une NOUVELLE série de 10 codes, qui remplace intégralement
//        l'ancienne.
//
// LE MANQUE QUE ÇA COMBLE : les codes n'étaient générés qu'à l'activation du
// 2FA. Une fois les 10 consommés — ou la feuille perdue — l'utilisateur n'avait
// plus aucun recours. C'est exactement le problème que ces codes existent pour
// éviter, simplement déplacé un peu plus loin.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { logSecurityEvent } from "@/lib/logger";
import { enforceRateLimit, twoFactorManageLimiter } from "@/lib/ratelimit";
import {
    generateBackupCodes,
    hashBackupCodes,
    countRemainingBackupCodes,
} from "@/lib/backup-codes";

const regenerateSchema = z.object({
    password: z.string().min(1, "Password is required"),
});

// ----------------------------------------------------------------------------
// GET — COMBIEN DE CODES RESTENT
// ----------------------------------------------------------------------------
// 💡 On ne renvoie qu'un NOMBRE, jamais les codes eux-mêmes : la base n'en
// contient que des empreintes HMAC, le serveur en est donc de toute façon
// incapable. Cette route ne peut structurellement rien divulguer.
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { backupCodes: true, totpEnabled: true },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        return NextResponse.json({
            remaining: countRemainingBackupCodes(user.backupCodes),
            totpEnabled: user.totpEnabled,
        });
    } catch (error) {
        console.error("[BACKUP-CODES] GET error:", error);
        return NextResponse.json({ error: "Failed to read backup codes status." }, { status: 500 });
    }
}

// ----------------------------------------------------------------------------
// POST — RÉGÉNÉRER LA SÉRIE
// ----------------------------------------------------------------------------
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 🔒 Limitation : cette route vérifie un mot de passe, elle est donc une
        // cible de brute-force depuis une session ouverte.
        const rateLimited = await enforceRateLimit(twoFactorManageLimiter, session.user.email);
        if (rateLimited) return rateLimited;

        const body = await req.json();
        const validation = regenerateSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error.issues[0].message }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        if (!user.totpEnabled) {
            return NextResponse.json(
                { error: "Two-factor authentication is not enabled on this account." },
                { status: 400 }
            );
        }

        // ====================================================================
        // 🔒 RE-AUTHENTIFICATION — LE POINT CENTRAL DE CETTE ROUTE
        // ====================================================================
        // Pourquoi exiger le mot de passe alors que la session est déjà valide :
        // générer une série de codes revient à se fabriquer DIX clés de secours
        // permanentes. Quelqu'un profitant d'une session ouverte (poste non
        // verrouillé, appareil volé) pourrait les noter et conserver un accès au
        // compte même après un changement de mot de passe — la victime n'aurait
        // aucun moyen de s'en apercevoir.
        //
        // ⚠️ LIMITE CONNUE — COMPTES GOOGLE : un utilisateur inscrit via OAuth
        // n'a pas de mot de passe (`password` est null). Il ne peut donc pas
        // régénérer ses codes. Le message l'oriente vers "Mot de passe oublié",
        // qui permet précisément d'en DÉFINIR un premier sur un compte Google.
        // Une alternative serait d'accepter un code TOTP valide à la place, mais
        // ça n'aiderait pas celui qui a justement perdu son téléphone.
        if (!user.password) {
            return NextResponse.json({
                error: "Your account uses Google Sign-In. Set a password first via \"Forgot password?\" to manage two-factor authentication."
            }, { status: 400 });
        }

        const isPasswordValid = await bcrypt.compare(validation.data.password, user.password);
        if (!isPasswordValid) {
            if (user.companyId) {
                await logSecurityEvent({
                    action: "LOGIN_FAILED",
                    details: "Backup code regeneration attempt failed: incorrect password.",
                    companyId: user.companyId,
                    agentId: user.id,
                });
            }
            return NextResponse.json({ error: "Incorrect password." }, { status: 400 });
        }

        // ====================================================================
        // GÉNÉRATION DE LA NOUVELLE SÉRIE
        // ====================================================================
        // ⚠️ REMPLACEMENT TOTAL, jamais un ajout. Les anciens codes deviennent
        // instantanément inutilisables — c'est voulu : si l'utilisateur régénère,
        // c'est souvent qu'il craint que sa liste ait été vue ou perdue. Ajouter
        // à l'existant laisserait les codes compromis en circulation.
        const plainBackupCodes = generateBackupCodes();

        let hashedBackupCodes: string;
        try {
            hashedBackupCodes = hashBackupCodes(plainBackupCodes);
        } catch (cryptoError) {
            console.error("[BACKUP-CODES] Échec du hachage :", cryptoError);
            return NextResponse.json({
                error: "Server encryption is not configured. Please contact your administrator."
            }, { status: 500 });
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { backupCodes: hashedBackupCodes },
        });

        // 📜 AUDIT TRAIL : régénérer ses codes de secours est un événement de
        // sécurité notable. La trace permet de reconstituer la chronologie si
        // un compte est compromis plus tard.
        if (user.companyId) {
            await logSecurityEvent({
                action: "BACKUP_CODES_REGENERATED",
                details: "User regenerated their 2FA backup codes. All previous codes were invalidated.",
                companyId: user.companyId,
                agentId: user.id,
            });
        }

        return NextResponse.json({
            message: "New backup codes generated. Your previous codes no longer work.",
            // ⚠️ Seule et unique apparition de ces codes en clair, comme à
            // l'activation : la base n'en garde que des empreintes.
            backupCodes: plainBackupCodes,
        });

    } catch (error) {
        console.error("[BACKUP-CODES] POST error:", error);
        return NextResponse.json({ error: "Failed to regenerate backup codes." }, { status: 500 });
    }
}