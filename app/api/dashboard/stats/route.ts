import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route"; 

export async function GET(req: Request) {
    try {
        // 🔒 CONFINEMENT B2B : Le Gardien exige une entreprise valide
        const session = await getServerSession(authOptions);
        if (!session?.user?.email || !(session.user as any).companyId) {
            console.error("🔴 Sécurité : Tentative d'accès anonyme ou sans organisation bloquée sur GET /dashboard/stats");
            return NextResponse.json({ error: "Unauthorized access. Valid B2B session required." }, { status: 401 });
        }

        // 💡 MUR B2B : Extraction de l'ID de l'entreprise
        const companyId = (session.user as any).companyId;

        const { searchParams } = new URL(req.url);
        const range = searchParams.get("range") || "30d";

        let days = 30;
        if (range === "7d") days = 7;
        else if (range === "90d") days = 90;
        else if (range === "all") days = 3650; 

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const prevStartDate = new Date(startDate);
        prevStartDate.setDate(prevStartDate.getDate() - days);

        // 1. Récupération des KPIs (ISOLÉS PAR ENTREPRISE)
        const [total, verified, rejected, pending, highRisk] = await Promise.all([
            prisma.verificationRequest.count({ where: { companyId, submittedAt: { gte: startDate } } }),
            prisma.verificationRequest.count({ where: { companyId, status: "verified", submittedAt: { gte: startDate } } }),
            prisma.verificationRequest.count({ where: { companyId, status: "rejected", submittedAt: { gte: startDate } } }),
            prisma.verificationRequest.count({ where: { companyId, status: "pending", submittedAt: { gte: startDate } } }),
            prisma.verificationRequest.count({ where: { companyId, riskLevel: "High", submittedAt: { gte: startDate } } }),
        ]);

        const [prevTotal, prevVerified, prevHighRisk] = await Promise.all([
            prisma.verificationRequest.count({ where: { companyId, submittedAt: { gte: prevStartDate, lt: startDate } } }),
            prisma.verificationRequest.count({ where: { companyId, status: "verified", submittedAt: { gte: prevStartDate, lt: startDate } } }),
            prisma.verificationRequest.count({ where: { companyId, riskLevel: "High", submittedAt: { gte: prevStartDate, lt: startDate } } }),
        ]);

        const calcDelta = (curr: number, prev: number) => {
            if (prev === 0) return curr > 0 ? 100 : 0;
            return (((curr - prev) / prev) * 100);
        };

        // 2. Calcul du VRAI Avg Processing Time (ISOLÉ)
        const resolvedRequests = await prisma.verificationRequest.findMany({
            where: {
                companyId, // 💡 MUR B2B
                status: { in: ["verified", "rejected"] },
                updatedAt: { gte: startDate }
            },
            select: { submittedAt: true, updatedAt: true }
        });

        let totalSeconds = 0;
        resolvedRequests.forEach(req => {
            totalSeconds += (req.updatedAt.getTime() - req.submittedAt.getTime()) / 1000;
        });
        
        const avgProcessingTime = resolvedRequests.length > 0 
            ? (totalSeconds / resolvedRequests.length).toFixed(1) 
            : 0;

        // 3. OPTIMISATION : Données du Graphique (ISOLÉES)
        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const recentApproved = await prisma.verificationRequest.findMany({
            where: { companyId, status: "verified", updatedAt: { gte: sevenDaysAgo } },
            select: { updatedAt: true }
        });

        const recentHighRisk = await prisma.verificationRequest.findMany({
            where: { companyId, riskLevel: "High", submittedAt: { gte: sevenDaysAgo } },
            select: { submittedAt: true }
        });

        const chartData = [];
        for (let i = 6; i >= 0; i--) {
            const dateCursor = new Date(today);
            dateCursor.setDate(today.getDate() - i);
            const dayName = dateCursor.toLocaleDateString('en-US', { weekday: 'short' });

            const approvedCount = recentApproved.filter(r => r.updatedAt.toDateString() === dateCursor.toDateString()).length;
            const riskCount = recentHighRisk.filter(r => r.submittedAt.toDateString() === dateCursor.toDateString()).length;

            chartData.push({
                name: dayName,
                Approved: approvedCount,
                Risk: riskCount
            });
        }

        return NextResponse.json({
            stats: { total, verified, rejected, pending, highRisk },
            trends: {
                totalDelta: calcDelta(total, prevTotal),
                verifiedDelta: calcDelta(verified, prevVerified),
                highRiskDelta: calcDelta(highRisk, prevHighRisk)
            },
            avgProcessingTime: Number(avgProcessingTime),
            chartData: chartData
        });
        
    } catch (error: any) {
        console.error("Dashboard Stats Error:", error);
        return NextResponse.json({ error: "Failed to load dashboard metrics" }, { status: 500 });
    }
}