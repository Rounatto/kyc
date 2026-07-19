// ============================================================================
// 📜 LECTURE DU REGISTRE D'AUDIT (écran "Audit Trail" des Settings)
// ============================================================================
// Réservé aux COMPANY_ADMIN (contrairement aux dossiers KYC, consultables par
// les AGENT aussi) — la piste d'audit complète de l'entreprise est une donnée
// sensible de gouvernance. Les lignes elles-mêmes sont écrites ailleurs (voir
// lib/logger.ts et les `auditLogs: { create: ... }` dans customers/route.ts,
// customers/[id]/route.ts, settings/team, settings/apikeys...) — cette route
// ne fait que les lire, jamais les modifier (le registre doit rester immuable).
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        
        // 🛡️ VERROU RBAC : Seul l'Administrateur peut lire le registre d'audit
        const guard = enforceRole(session, ["COMPANY_ADMIN"]);
        if (!guard.isValid) return guard.response!;

        const { companyId } = guard;

        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get("limit") || "50");

        // On récupère les logs liés à l'entreprise, en incluant le nom de l'agent qui a fait l'action
        const logs = await prisma.auditLog.findMany({
            where: { companyId: companyId! },
            orderBy: { timestamp: 'desc' },
            take: limit,
            include: {
                agent: {
                    select: { fullName: true, email: true, role: true }
                }
            }
        });

        return NextResponse.json({ logs });

    } catch (error: any) {
        console.error("Audit Logs GET Error:", error);
        return NextResponse.json({ error: "Failed to fetch audit logs." }, { status: 500 });
    }
}