// ============================================================================
// 📊 STATISTIQUES DU DASHBOARD (KPIs, tendances, graphique 7 jours)
// ============================================================================
// Alimente les cartes KPI + le graphique du dashboard. `range` détermine la
// fenêtre analysée ET une fenêtre "précédente" de même durée juste avant, pour
// calculer un delta en % affiché à côté de chaque KPI.
//
// ⚠️ Performance : ce fichier enchaîne PLUSIEURS allers-retours DB séquentiels —
// pas catastrophique ici car tout est parallélisé par groupe, mais un agrégat
// SQL unique (groupBy) serait plus efficace que tant de requêtes à isoler
// manuellement par date.
//
// 🆕 [FIX TENDANCES] TROIS DÉFAUTS CORRIGÉS, détaillés à leur emplacement :
//   1. `pendingDelta` n'était jamais renvoyé — la carte "Pending Review"
//      affichait donc 0,0 % en permanence, quelle que soit l'évolution réelle.
//   2. "période précédente à zéro" renvoyait +100 %, un chiffre inventé.
//   3. "1y" n'était pas reconnu et retombait silencieusement sur 30 jours.
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

        // 🆕 [FIX TENDANCES — 3/3] "1y" EST DÉSORMAIS RECONNU.
        //
        // ⚠️ CE QUE ÇA CORRIGE : le <select> du dashboard proposait "Last Year",
        // mais cette valeur n'était traitée nulle part ici — elle tombait dans le
        // cas par défaut et affichait les 30 derniers jours. L'utilisateur
        // choisissait une période et en obtenait une autre, sans le moindre
        // signal. Un menu qui ne fait pas ce qu'il annonce est pire qu'un menu
        // absent : personne ne pense à vérifier.
        let days = 30;
        if (range === "7d") days = 7;
        else if (range === "90d") days = 90;
        else if (range === "1y") days = 365;
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

        // 🆕 [FIX TENDANCES — 1/3] `prevPending` AJOUTÉ.
        //
        // ⚠️ CE QUE ÇA CORRIGE : `pendingDelta` n'était tout simplement pas
        // calculé, donc jamais renvoyé. Le frontend le lisait avec un repli à 0,
        // et la carte "Pending Review" affichait "0,0 %" avec une icône neutre
        // EN PERMANENCE — y compris quand la file d'attente doublait. Le
        // commentaire du dashboard le signalait déjà comme une incohérence
        // connue ; elle est fermée ici.
        const [prevTotal, prevVerified, prevPending, prevHighRisk] = await Promise.all([
            prisma.verificationRequest.count({ where: { companyId, submittedAt: { gte: prevStartDate, lt: startDate } } }),
            prisma.verificationRequest.count({ where: { companyId, status: "verified", submittedAt: { gte: prevStartDate, lt: startDate } } }),
            prisma.verificationRequest.count({ where: { companyId, status: "pending", submittedAt: { gte: prevStartDate, lt: startDate } } }),
            prisma.verificationRequest.count({ where: { companyId, riskLevel: "High", submittedAt: { gte: prevStartDate, lt: startDate } } }),
        ]);

        // ====================================================================
        // 🆕 [FIX TENDANCES — 2/3] LA DIVISION PAR ZÉRO N'INVENTE PLUS UN CHIFFRE
        // ====================================================================
        // ❌ CE QUI EXISTAIT : `if (prev === 0) return curr > 0 ? 100 : 0;`
        //
        // ⚠️ POURQUOI C'ÉTAIT FAUX, ET PAS SEULEMENT IMPRÉCIS : passer de 0 à 1
        // dossier et passer de 0 à 400 dossiers renvoyaient tous les deux
        // "+100 %". Ce n'est pas une croissance de 100 % — c'est une croissance
        // INDÉFINIE. Partant de zéro, aucun pourcentage n'a de sens : il n'y a
        // pas de base à laquelle rapporter l'augmentation.
        //
        // ⚠️ ET LE CAS `curr === 0` ÉTAIT PIRE ENCORE : "0 dossier avant, 0
        // dossier maintenant" affichait "0,0 %" avec une icône neutre — c'est-à-
        // dire exactement le même signal que "activité stable". Une entreprise
        // sans aucune donnée voyait donc les mêmes pastilles rassurantes qu'une
        // entreprise à l'activité régulière.
        //
        // 💡 C'EST LE MÊME TRAVERS QUE `isStolenDocument` : un chiffre inventé,
        // affiché avec assurance. La correction suit le même principe appliqué
        // partout ailleurs dans ce projet — quand on ne sait pas, on le DIT au
        // lieu de produire une valeur plausible.
        //
        // ✅ ON RENVOIE `null`. Le frontend l'interprète comme "pas de base de
        // comparaison" et affiche un état distinct, ni hausse ni baisse.
        const calcDelta = (curr: number, prev: number): number | null => {
            // Aucune activité sur la période précédente : le pourcentage n'existe
            // pas mathématiquement. On ne le fabrique pas.
            if (prev === 0) return null;
            return ((curr - prev) / prev) * 100;
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
                // 🆕 [FIX TENDANCES — 1/3] Enfin renvoyé.
                pendingDelta: calcDelta(pending, prevPending),
                highRiskDelta: calcDelta(highRisk, prevHighRisk),
            },
            // 🆕 [FIX TENDANCES] LES COMPTEURS DE LA PÉRIODE PRÉCÉDENTE SONT
            // RENVOYÉS AVEC LES DELTAS.
            //
            // 💡 POURQUOI : ils permettent au frontend de distinguer deux
            // situations que le delta seul confond. `delta === null` peut
            // signifier "aucune activité du tout" ou "activité entièrement
            // nouvelle" — deux messages très différents pour l'utilisateur, et
            // seul le compteur courant permet de trancher. Sans ça, on
            // afficherait le même libellé dans les deux cas.
            previous: {
                total: prevTotal,
                verified: prevVerified,
                pending: prevPending,
                highRisk: prevHighRisk,
            },
            avgProcessingTime: Number(avgProcessingTime),
            chartData: chartData
        });

    } catch (error: any) {
        console.error("Dashboard Stats Error:", error);
        return NextResponse.json({ error: "Failed to load dashboard metrics" }, { status: 500 });
    }
}