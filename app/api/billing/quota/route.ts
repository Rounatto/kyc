// ============================================================================
// 📈 QUOTA D'USAGE (vérifications KYC/mois selon le plan de l'entreprise)
// ============================================================================
// Appelé par le frontend pour savoir si l'entreprise a atteint sa limite
// mensuelle de dossiers KYC (et donc si le bouton "Nouvelle Vérification"
// doit être bloqué). Fait aussi 2 choses en plus d'une simple lecture :
//   - Auto-downgrade : si un abonnement annulé (cancelAtPeriodEnd) a dépassé
//     sa date de fin, on repasse silencieusement l'entreprise en plan "trial"
//     ICI, à la prochaine consultation (pas de cron dédié pour ça).
//   - Alerte quota : si la limite est atteinte, crée une notification —
//     mais au plus une par 24h (`recentAlert`) pour ne pas spammer.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getPlanLimit } from "@/lib/stripe";

export async function GET() {
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
            select: {
                plan: true,
                currentPeriodEnd: true,
                cancelAtPeriodEnd: true,
                stripeSubscriptionId: true
            }
        });

        if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

        // 💡 LE RETROGRADAGE AUTOMATIQUE (Auto-Downgrade)
        const now = new Date();
        if (company.cancelAtPeriodEnd && company.currentPeriodEnd && now > company.currentPeriodEnd) {
            await prisma.company.update({
                where: { id: user.companyId },
                data: { plan: "trial", cancelAtPeriodEnd: false, currentPeriodEnd: null }
            });
            await prisma.notification.create({
                data: {
                    type: "BILLING",
                    title: "Plan Downgraded to Trial",
                    message: "Your subscription ended and the workspace was downgraded to the trial plan.",
                    companyId: user.companyId
                }
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

        // Palier par plan, lu depuis le catalogue partagé (lib/stripe.ts) pour
        // que la limite affichée ici et celle facturée restent la même valeur.
        // "enterprise" utilise un plafond très haut plutôt qu'un vrai
        // "illimité" — suffisant en pratique mais pas explicite.
        const limit = getPlanLimit(plan);

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

        // `status` évite au frontend de recalculer la même logique dans chaque
        // composant (badge du header, onglet facturation) et surtout d'oublier
        // un cas : un plan payant annulé reste PAYANT jusqu'à la fin de période,
        // c'est ce que "canceling" exprime.
        //   trial     → aucun abonnement
        //   active    → abonnement payant qui se renouvellera
        //   canceling → abonnement payant, arrêt programmé, accès conservé
        const status =
            plan === "trial" ? "trial" : company.cancelAtPeriodEnd ? "canceling" : "active";

        return NextResponse.json({
            plan,
            current: currentUsage,
            limit,
            isLocked,
            cancelAtPeriodEnd: company.cancelAtPeriodEnd,
            status,
            // Permet à l'UI de proposer "Reprendre l'abonnement" plutôt qu'un
            // nouveau paiement, et de savoir si Stripe pilote réellement ce compte.
            hasSubscription: Boolean(company.stripeSubscriptionId),
            currentPeriodEnd: company.currentPeriodEnd?.toISOString() ?? null,
            resetDate: nextReset.toISOString()
        });
    } catch (error) {
        console.error("Quota Check Error:", error);
        return NextResponse.json({ error: "Failed to check quota" }, { status: 500 });
    }
}