// ============================================================================
// 🔔 CENTRE DE NOTIFICATIONS IN-APP (cloche du dashboard)
// ============================================================================
// Ne pas confondre avec settings/notifications (préférences email par
// utilisateur) : ici on lit/marque comme lues les notifications du modèle
// `Notification`, scopées par ENTREPRISE (pas par utilisateur individuel) —
// tous les agents d'une même entreprise voient les mêmes notifications
// (alertes high-risk, facturation, clés API créées...). Consommé par
// NotificationContext côté frontend, probablement via polling périodique.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";

// 📥 GET : Récupérer les 15 dernières notifications du Workspace
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
        if (!guard.isValid) return guard.response!;

        const notifications = await prisma.notification.findMany({
            where: { companyId: guard.companyId! },
            orderBy: { createdAt: 'desc' },
            take: 15
        });

        return NextResponse.json({ notifications });
    } catch (error) {
        console.error("❌ GET NOTIFICATIONS ERROR:", error);
        return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
    }
}

// 📤 PATCH : Marquer comme lu (Une seule ou Toutes)
export async function PATCH(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
        if (!guard.isValid) return guard.response!;

        const body = await req.json();

        if (body.markAll) {
            // 💡 Fonctionnalité Enterprise : Tout marquer comme lu
            await prisma.notification.updateMany({
                where: { companyId: guard.companyId!, isRead: false },
                data: { isRead: true }
            });
        } else if (body.id) {
            // Marquer une notification spécifique
            await prisma.notification.update({
                where: { id: body.id, companyId: guard.companyId! },
                data: { isRead: true }
            });
        } else {
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("❌ PATCH NOTIFICATIONS ERROR:", error);
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
}