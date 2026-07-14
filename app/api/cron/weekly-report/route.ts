import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendWeeklyReportEmail } from "@/lib/mail";

// Cette route est appelée par le robot Vercel CRON, pas par un utilisateur depuis le navigateur.
export async function GET(req: Request) {
    try {
        // 1. Trouver tous les utilisateurs qui ont activé l'option Weekly Report
        const subscribers = await prisma.user.findMany({
            where: { emailNotifWeekly: true },
            include: { company: true } // On a besoin de connaître leur entreprise
        });

        if (subscribers.length === 0) {
            return NextResponse.json({ message: "No active subscribers for weekly reports." });
        }

        // 2. Définir la fenêtre de temps (Les 7 derniers jours)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // 3. Boucler sur chaque abonné pour compiler son rapport
        for (const sub of subscribers) {
            if (!sub.companyId) continue;

            // Compilation des métriques isolées B2B avec Prisma
            const [total, approved, rejected, highRisk] = await Promise.all([
                prisma.verificationRequest.count({ 
                    where: { companyId: sub.companyId, submittedAt: { gte: sevenDaysAgo } } 
                }),
                prisma.verificationRequest.count({ 
                    where: { companyId: sub.companyId, status: "verified", submittedAt: { gte: sevenDaysAgo } } 
                }),
                prisma.verificationRequest.count({ 
                    where: { companyId: sub.companyId, status: "rejected", submittedAt: { gte: sevenDaysAgo } } 
                }),
                prisma.verificationRequest.count({ 
                    where: { companyId: sub.companyId, riskLevel: "High", submittedAt: { gte: sevenDaysAgo } } 
                })
            ]);

            // Si aucune activité cette semaine, on peut choisir de ne pas spammer
            if (total === 0) continue;

            // 4. Envoi de l'e-mail compilé
            await sendWeeklyReportEmail(sub.email, sub.fullName, {
                total,
                approved,
                rejected,
                highRisk
            });
        }

        return NextResponse.json({ success: true, processedUsers: subscribers.length });

    } catch (error) {
        console.error("❌ CRON JOB ERROR:", error);
        return NextResponse.json({ error: "Failed to generate weekly reports" }, { status: 500 });
    }
}