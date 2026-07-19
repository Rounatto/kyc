// ============================================================================
// 📉 GESTION D'ABONNEMENT — ANNULATION UNIQUEMENT
// ============================================================================
// Volontairement minimaliste : la SEULE action supportée ici est "CANCEL"
// (programmer l'annulation en fin de période, gérée ensuite par le check
// d'auto-downgrade dans billing/quota/route.ts). L'upgrade de plan passe
// exclusivement par billing/checkout + webhooks/stripe — un payload
// "UPGRADE" envoyé ici serait simplement rejeté par le "Invalid action" en
// bas, ce qui empêche un client malveillant de s'auto-upgrader sans payer.
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
        const { action } = body;

        // 🛡️ SÉCURITÉ : L'Upgrade est désormais géré par Stripe (Checkout + Webhook).
        // Si un hacker tente d'envoyer "UPGRADE" ici, il sera rejeté par le "Invalid action" en bas.

        // ACTION 1 : CANCEL (Le client demande l'annulation de son plan)
        if (action === "CANCEL") {
            await prisma.company.update({
                where: { id: user.companyId },
                // On active la bascule d'annulation à la fin de la période
                data: { cancelAtPeriodEnd: true } 
            });

            await prisma.notification.create({
                data: {
                    type: "BILLING",
                    title: "Subscription Cancellation Scheduled",
                    message: "Your subscription will cancel at the end of the current billing period.",
                    companyId: user.companyId
                }
            });

            return NextResponse.json({ message: "Subscription set to cancel at period end" });
        }

        // Si l'action n'est pas CANCEL, on rejette la requête.
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    } catch (error) {
        console.error("Subscription Error:", error);
        return NextResponse.json({ error: "Failed to process subscription" }, { status: 500 });
    }
}