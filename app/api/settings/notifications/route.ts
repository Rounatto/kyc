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

        // Sécurisation : on ne met à jour que les champs autorisés
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