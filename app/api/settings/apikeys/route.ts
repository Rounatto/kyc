import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";
import { logSecurityEvent } from "@/lib/logger";
import crypto from "crypto";

// 📥 GET : Récupérer la liste des clés API de l'entreprise
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const guard = enforceRole(session, ["COMPANY_ADMIN"]);
        if (!guard.isValid) return guard.response!;

        const keys = await prisma.apiKey.findMany({
            where: { companyId: guard.companyId! },
            // ⚠️ SÉCURITÉ : On ne sélectionne délibérément PAS le champ `key`. 
            // On ne renvoie que les métadonnées au frontend.
            select: { id: true, name: true, createdAt: true, lastUsedAt: true, createdBy: true },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ keys });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch API keys." }, { status: 500 });
    }
}

// 📤 POST : Générer une nouvelle clé API
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const guard = enforceRole(session, ["COMPANY_ADMIN"]);
        if (!guard.isValid) return guard.response!;

        const userId = (session?.user as any)?.id;
        const companyId = (session?.user as any)?.companyId;

        if (!userId || !companyId) {
            return NextResponse.json({ error: "Session invalide. Veuillez vous reconnecter." }, { status: 401 });
        }

        const body = await req.json();
        const keyName = body.name || "Default API Key";

        const randomHex = crypto.randomBytes(32).toString("hex");
        const rawApiKey = `tv_live_${randomHex}`;

        const newKey = await prisma.apiKey.create({
            data: {
                name: keyName,
                key: rawApiKey,
                companyId: companyId,
                createdBy: userId
            }
        });

        // Piste d'Audit
        await logSecurityEvent({
            action: "API_KEY_CREATED",
            details: `A new API key named '${keyName}' was generated for the workspace.`,
            companyId: companyId,
            agentId: userId
        });

        // 💡 NOUVEAU : Notification SYSTEM en temps réel
        await prisma.notification.create({
            data: {
                type: "SYSTEM",
                title: "New API Key Generated",
                message: `An API key named '${keyName}' was just created by an administrator.`,
                companyId: companyId
            }
        });

        return NextResponse.json({ 
            message: "API Key generated successfully.",
            keyData: {
                id: newKey.id,
                name: newKey.name,
                keyValue: rawApiKey, 
                createdAt: newKey.createdAt
            }
        }, { status: 201 });

    } catch (error: any) {
        console.error("❌ POST API KEY ERROR:", error);
        return NextResponse.json({ error: error.message || "Failed to generate API Key." }, { status: 500 });
    }
}

// 🗑️ DELETE : Révoquer (Supprimer) une clé API
export async function DELETE(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const guard = enforceRole(session, ["COMPANY_ADMIN"]);
        if (!guard.isValid) return guard.response!;

        const body = await req.json();
        const keyId = body.keyId;

        const targetKey = await prisma.apiKey.findUnique({ where: { id: keyId } });
        if (!targetKey || targetKey.companyId !== guard.companyId) {
            return NextResponse.json({ error: "API Key not found." }, { status: 404 });
        }

        await prisma.apiKey.delete({ where: { id: keyId } });

        await logSecurityEvent({
            action: "API_KEY_REVOKED",
            details: `API key '${targetKey.name}' was permanently revoked.`,
            companyId: guard.companyId!,
            agentId: guard.userId!
        });

        return NextResponse.json({ message: "API Key revoked successfully." });
    } catch (error) {
        return NextResponse.json({ error: "Failed to revoke API Key." }, { status: 500 });
    }
}