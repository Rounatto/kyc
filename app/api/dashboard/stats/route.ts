import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next"; // 💡 LE GARDIEN

export async function GET(req: Request) {
    try {
        // 🔒 CONFINEMENT PHASE 0 : VERROUILLAGE DES STATISTIQUES
        const session = await getServerSession();
        if (!session?.user?.email) {
            console.error("🔴 Sécurité : Tentative d'accès anonyme bloquée sur GET /dashboard/stats");
            return NextResponse.json({ error: "Unauthorized access. Valid session required." }, { status: 401 });
        }

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

        // 1. Récupération des KPIs
        const [total, verified, rejected, pending, highRisk] = await Promise.all([
            prisma.verificationRequest.count({ where: { submittedAt: { gte: startDate } } }),
            prisma.verificationRequest.count({ where: { status: "verified", submittedAt: { gte: startDate } } }),
            prisma.verificationRequest.count({ where: { status: "rejected", submittedAt: { gte: startDate } } }),
            prisma.verificationRequest.count({ where: { status: "pending", submittedAt: { gte: startDate } } }),
            prisma.verificationRequest.count({ where: { riskLevel: "High", submittedAt: { gte: startDate } } }),
        ]);

        const [prevTotal, prevVerified, prevHighRisk] = await Promise.all([
            prisma.verificationRequest.count({ where: { submittedAt: { gte: prevStartDate, lt: startDate } } }),
            prisma.verificationRequest.count({ where: { status: "verified", submittedAt: { gte: prevStartDate, lt: startDate } } }),
            prisma.verificationRequest.count({ where: { riskLevel: "High", submittedAt: { gte: prevStartDate, lt: startDate } } }),
        ]);

        const calcDelta = (curr: number, prev: number) => {
            if (prev === 0) return curr > 0 ? 100 : 0;
            return (((curr - prev) / prev) * 100);
        };

        // 2. Calcul du VRAI Avg Processing Time
        const resolvedRequests = await prisma.verificationRequest.findMany({
            where: {
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

        // 💡 OPTIMISATION : Suppression de la boucle N+1 pour le Chart
        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        // On fait 2 requêtes globales au lieu de 14 petites requêtes
        const recentApproved = await prisma.verificationRequest.findMany({
            where: { status: "verified", updatedAt: { gte: sevenDaysAgo } },
            select: { updatedAt: true }
        });

        const recentHighRisk = await prisma.verificationRequest.findMany({
            where: { riskLevel: "High", submittedAt: { gte: sevenDaysAgo } },
            select: { submittedAt: true }
        });

        // On regroupe les données par jour en Javascript (infiniment plus rapide)
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