import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const range = searchParams.get("range") || "30d";

        const days = range === "90d" ? 90 : range === "1y" ? 365 : 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const prevStartDate = new Date(startDate);
        prevStartDate.setDate(prevStartDate.getDate() - days);

        // 1. Récupération des KPIs de la période actuelle
        const [total, verified, pending, highRisk] = await Promise.all([
            prisma.verificationRequest.count({ where: { submittedAt: { gte: startDate } } }),
            prisma.verificationRequest.count({ where: { status: "verified", submittedAt: { gte: startDate } } }),
            prisma.verificationRequest.count({ where: { status: "pending", submittedAt: { gte: startDate } } }),
            prisma.verificationRequest.count({ where: { riskLevel: "High", submittedAt: { gte: startDate } } }),
        ]);

        // 2. Récupération des KPIs de la période précédente (pour les tendances)
        const [prevTotal, prevVerified, prevPending, prevHighRisk] = await Promise.all([
            prisma.verificationRequest.count({ where: { submittedAt: { gte: prevStartDate, lt: startDate } } }),
            prisma.verificationRequest.count({ where: { status: "verified", submittedAt: { gte: prevStartDate, lt: startDate } } }),
            prisma.verificationRequest.count({ where: { status: "pending", submittedAt: { gte: prevStartDate, lt: startDate } } }),
            prisma.verificationRequest.count({ where: { riskLevel: "High", submittedAt: { gte: prevStartDate, lt: startDate } } }),
        ]);

        // 3. Fonction mathématique pour le pourcentage de variation (Delta)
        const calcDelta = (curr: number, prev: number) => {
            if (prev === 0) return curr > 0 ? 100 : 0;
            return (((curr - prev) / prev) * 100);
        };

        // 4. Construction des données du graphique (AreaChart) - Les 7 derniers jours
        const chartData = [];
        const today = new Date();
        
        for (let i = 6; i >= 0; i--) {
            const dateCursor = new Date(today);
            dateCursor.setDate(today.getDate() - i);
            dateCursor.setHours(0, 0, 0, 0);

            const nextDay = new Date(dateCursor);
            nextDay.setDate(dateCursor.getDate() + 1);

            const approvedCount = await prisma.verificationRequest.count({
                where: {
                    status: "verified",
                    updatedAt: { gte: dateCursor, lt: nextDay }
                }
            });

            const riskCount = await prisma.verificationRequest.count({
                where: {
                    riskLevel: "High",
                    submittedAt: { gte: dateCursor, lt: nextDay }
                }
            });

            const dayName = dateCursor.toLocaleDateString('en-US', { weekday: 'short' });
            
            chartData.push({
                name: dayName,
                Approved: approvedCount,
                Risk: riskCount
            });
        }

        // 5. Retour de l'objet complet attendu par le Dashboard
        return NextResponse.json({
            stats: { total, verified, pending, highRisk },
            trends: {
                totalDelta: calcDelta(total, prevTotal),
                verifiedDelta: calcDelta(verified, prevVerified),
                pendingDelta: calcDelta(pending, prevPending),
                highRiskDelta: calcDelta(highRisk, prevHighRisk)
            },
            chartData: chartData
        });
        
    } catch (error: any) {
        console.error("Dashboard Stats Error:", error);
        return NextResponse.json({ error: "Failed to load dashboard metrics" }, { status: 500 });
    }
}