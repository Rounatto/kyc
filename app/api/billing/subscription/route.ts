import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const user = await prisma.user.findUnique({
            where: { id: (session.user as any).id },
            select: { companyId: true }
        });

        if (!user?.companyId) return NextResponse.json({ error: "No company attached" }, { status: 400 });

        const body = await req.json();
        const { action, plan } = body;

        if (action === "UPGRADE") {
            const validPlans = ["starter", "growth", "enterprise"];
            if (!validPlans.includes(plan)) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

            // Simulation Stripe : On donne 30 jours à partir d'aujourd'hui
            const thirtyDaysFromNow = new Date();
            thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

            await prisma.company.update({
                where: { id: user.companyId },
                data: { 
                    plan: plan,
                    currentPeriodEnd: thirtyDaysFromNow,
                    cancelAtPeriodEnd: false 
                }
            });

            return NextResponse.json({ message: "Subscription upgraded successfully" });
        }

        if (action === "CANCEL") {
            await prisma.company.update({
                where: { id: user.companyId },
                data: { cancelAtPeriodEnd: true }
            });

            return NextResponse.json({ message: "Subscription set to cancel at period end" });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    } catch (error) {
        console.error("Subscription Error:", error);
        return NextResponse.json({ error: "Failed to process subscription" }, { status: 500 });
    }
}