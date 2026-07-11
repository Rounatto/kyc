import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac"; // 💡 NOTRE GARDIEN PHASE 3

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