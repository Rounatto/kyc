import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const range = searchParams.get("range") || "30d";

        // 💡 NOUVEAU [DYNAMIQUE] : Gestion globale du filtre temporel
        let days = 30;
        if (range === "7d") days = 7;
        else if (range === "90d") days = 90;
        else if (range === "all") days = 3650; // 10 ans pour "All time"

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const prevStartDate = new Date(startDate);
        prevStartDate.setDate(prevStartDate.getDate() - days);

        // 1. Récupération des KPIs de la période actuelle (ajout des rejected)
        const [total, verified, rejected, pending, highRisk] = await Promise.all([
            prisma.verificationRequest.count({ where: { submittedAt: { gte: startDate } } }),
            prisma.verificationRequest.count({ where: { status: "verified", submittedAt: { gte: startDate } } }),
            prisma.verificationRequest.count({ where: { status: "rejected", submittedAt: { gte: startDate } } }),
            prisma.verificationRequest.count({ where: { status: "pending", submittedAt: { gte: startDate } } }),
            prisma.verificationRequest.count({ where: { riskLevel: "High", submittedAt: { gte: startDate } } }),
        ]);

        // 2. Récupération des KPIs de la période précédente (pour les tendances / flèches rouges et vertes)
        const [prevTotal, prevVerified, prevHighRisk] = await Promise.all([
            prisma.verificationRequest.count({ where: { submittedAt: { gte: prevStartDate, lt: startDate } } }),
            prisma.verificationRequest.count({ where: { status: "verified", submittedAt: { gte: prevStartDate, lt: startDate } } }),
            prisma.verificationRequest.count({ where: { riskLevel: "High", submittedAt: { gte: prevStartDate, lt: startDate } } }),
        ]);

        // 3. Fonction mathématique pour le pourcentage de variation (Delta)
        const calcDelta = (curr: number, prev: number) => {
            if (prev === 0) return curr > 0 ? 100 : 0;
            return (((curr - prev) / prev) * 100);
        };

        // 💡 NOUVEAU [DYNAMIQUE] : 4. Calcul du VRAI Avg Processing Time depuis Prisma
        // On récupère tous les dossiers résolus (vérifiés ou rejetés) de la période
        const resolvedRequests = await prisma.verificationRequest.findMany({
            where: {
                status: { in: ["verified", "rejected"] },
                updatedAt: { gte: startDate }
            },
            select: { submittedAt: true, updatedAt: true }
        });

        let totalSeconds = 0;
        resolvedRequests.forEach(req => {
            // Calcul de la différence entre l'heure de soumission et l'heure de décision
            totalSeconds += (req.updatedAt.getTime() - req.submittedAt.getTime()) / 1000;
        });
        
        // Si aucun dossier n'est résolu, on renvoie 0. Sinon la moyenne exacte à 1 décimale.
        const avgProcessingTime = resolvedRequests.length > 0 
            ? (totalSeconds / resolvedRequests.length).toFixed(1) 
            : 0;

        // 5. Construction des données du graphique (AreaChart) - Les 7 derniers jours
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

        // 6. Retour de l'objet global standardisé pour TOUTES les pages
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