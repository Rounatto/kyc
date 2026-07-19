// ============================================================================
// 🔔 PRÉFÉRENCES DE NOTIFICATIONS EMAIL (par utilisateur, pas par entreprise)
// ============================================================================
// Lit/écrit les 3 flags booléens du modèle User qui contrôlent QUELS emails
// automatiques cet utilisateur reçoit (succès KYC, alertes, résumé
// hebdomadaire) — utilisé par le composant NotifSetting.tsx et consommé par
// sendAgentNotificationEmail (lib/mail.ts) et le cron weekly-report. Ne pas
// confondre avec le centre de notifications in-app (modèle Notification,
// voir app/api/notifications) : ici on ne configure QUE les emails.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const userId = (session.user as any).id;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { emailNotifSuccess: true, emailNotifAlerts: true, emailNotifWeekly: true }
        });

        return NextResponse.json(user);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch preferences" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const userId = (session.user as any).id;
        const body = await req.json();

        // Allowlist stricte : on ne recopie QUE les 3 champs attendus depuis le
        // body, un par un et typés — impossible d'injecter la mise à jour d'un
        // autre champ du modèle User via ce endpoint (contrairement à un
        // `data: body` qui accepterait n'importe quel champ envoyé).
        const updateData: any = {};
        if (typeof body.emailNotifSuccess === "boolean") updateData.emailNotifSuccess = body.emailNotifSuccess;
        if (typeof body.emailNotifAlerts === "boolean") updateData.emailNotifAlerts = body.emailNotifAlerts;
        if (typeof body.emailNotifWeekly === "boolean") updateData.emailNotifWeekly = body.emailNotifWeekly;

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: { emailNotifSuccess: true, emailNotifAlerts: true, emailNotifWeekly: true }
        });

        return NextResponse.json(updatedUser);
    } catch (error) {
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
}