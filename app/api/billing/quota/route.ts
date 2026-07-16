import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const user = await prisma.user.findUnique({
            where: { id: (session.user as any).id },
            select: { companyId: true }
        });

        if (!user?.companyId) return NextResponse.json({ error: "No company attached" }, { status: 400 });

        let company = await prisma.company.findUnique({
            where: { id: user.companyId },
            select: { plan: true, currentPeriodEnd: true, cancelAtPeriodEnd: true }
        });

        if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

        // 💡 LE RETROGRADAGE AUTOMATIQUE (Auto-Downgrade)
        const now = new Date();
        if (company.cancelAtPeriodEnd && company.currentPeriodEnd && now > company.currentPeriodEnd) {
            await prisma.company.update({
                where: { id: user.companyId },
                data: { plan: "trial", cancelAtPeriodEnd: false, currentPeriodEnd: null }
            });
            company.plan = "trial";
            company.cancelAtPeriodEnd = false;
            company.currentPeriodEnd = null;
        }

        const plan = company.plan;
        
        // On compte les requêtes du mois civil en cours
        const startOfMonth = new Date();
        startOfMonth.setDate(1); 
        startOfMonth.setHours(0, 0, 0, 0); 

        const currentUsage = await prisma.verificationRequest.count({
            where: { 
                companyId: user.companyId,
                submittedAt: { gte: startOfMonth } 
            }
        });

        let limit = 5; 
        if (plan === "starter") limit = 50;
        if (plan === "growth") limit = 500;
        if (plan === "enterprise") limit = 999999;

        const isLocked = currentUsage >= limit;

        if (isLocked) {
            const recentAlert = await prisma.notification.findFirst({
                where: { 
                    companyId: user.companyId, 
                    type: "BILLING",
                    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
                }
            });

            if (!recentAlert) {
                await prisma.notification.create({
                    data: {
                        type: "BILLING",
                        title: "Action Required: Quota Reached",
                        message: `You have reached your limit of ${limit} verifications. Upgrade to continue.`,
                        companyId: user.companyId
                    }
                });
            }
        }

        // Si le client a un abonnement en cours, sa fin de mois est son currentPeriodEnd.
        // Sinon, c'est le 1er du mois prochain.
        const nextReset = company.currentPeriodEnd ? company.currentPeriodEnd : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);

        return NextResponse.json({
            plan,
            current: currentUsage,
            limit,
            isLocked,
            cancelAtPeriodEnd: company.cancelAtPeriodEnd,
            resetDate: nextReset.toISOString()
        });
    } catch (error) {
        console.error("Quota Check Error:", error);
        return NextResponse.json({ error: "Failed to check quota" }, { status: 500 });
    }
}