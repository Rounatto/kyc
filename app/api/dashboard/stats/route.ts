// ============================================================================
// 📊 STATISTIQUES DU DASHBOARD (KPIs, tendances, graphique 7 jours)
// ============================================================================
// Alimente les cartes KPI + le graphique du dashboard. `range` (7d/30d/90d/all)
// détermine la fenêtre analysée ET une fenêtre "précédente" de même durée juste
// avant, pour calculer un delta en % (`calcDelta`) affiché à côté de chaque KPI
// (ex: "+12% vs période précédente").
//
// ⚠️ Performance : ce fichier enchaîne PLUSIEURS allers-retours DB séquentiels
// (2 Promise.all + 1 findMany + 2 findMany supplémentaires pour le graphique) —
// pas catastrophique ici car tout est déjà parallélisé au maximum par groupe,
// mais un agrégat SQL unique (raw query / groupBy) serait plus efficace que
// tant de requêtes à isoler manuellement par date.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        // 🛡️ VERROU RBAC : Seuls l'Admin et l'Agent peuvent voir les stats
        const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
        if (!guard.isValid) return guard.response!;

        // 💡 MUR B2B : Extraction sécurisée de l'ID de l'entreprise par le Gardien
        const companyId = guard.companyId!;

        const { searchParams } = new URL(req.url);
        const range = searchParams.get("range") || "30d";

        let days = 30;
        if (range === "7d") days = 7;
        else if (range === "90d") days = 90;
        else if (range === "all") days = 3650; 

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Fenêtre "précédente" de même durée, juste avant `startDate` — sert
        // uniquement de référence pour calculer les deltas en % plus bas.
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

        // % d'évolution entre les 2 fenêtres. Cas particulier : si la période
        // précédente était à 0, on affiche +100% plutôt qu'une division par
        // zéro (Infinity/NaN) dès qu'il y a la moindre activité cette période.
        const calcDelta = (curr: number, prev: number) => {
            if (prev === 0) return curr > 0 ? 100 : 0;
            return (((curr - prev) / prev) * 100);
        };

        // 2. Calcul du VRAI temps de traitement moyen (pas une estimation) :
        // on prend chaque dossier résolu et on mesure l'écart réel entre sa
        // soumission et sa résolution, moyenné sur tous les dossiers.
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

        // 3. Données du graphique 7 jours (TOUJOURS 7 jours, indépendamment du
        // `range` choisi par l'utilisateur pour les KPIs au-dessus) : on
        // récupère les dossiers résolus/à risque des 7 derniers jours en 2
        // requêtes, puis on les regroupe en mémoire par jour ci-dessous
        // (plutôt que de faire 7 requêtes DB, une par jour).
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

        // Construit les 7 derniers jours dans l'ordre chronologique et compte,
        // pour chaque jour, combien de dossiers approuvés/à risque il contient.
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