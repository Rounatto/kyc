import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
    apiVersion: "2026-06-24.dahlia",
});

// Clé secrète du Webhook Stripe (à mettre dans .env)
// STRIPE_WEBHOOK_SECRET=whsec_...
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

export async function POST(req: Request) {
    const payload = await req.text();
    const signature = req.headers.get("stripe-signature") as string;

    let event;

    try {
        // Stripe vérifie cryptographiquement que ce message vient bien d'eux
        event = stripe.webhooks.constructEvent(payload, signature, endpointSecret);
    } catch (err: any) {
        console.error(`❌ Webhook signature verification failed.`, err.message);
        return NextResponse.json({ error: "Webhook Error" }, { status: 400 });
    }

    // Si le paiement est un succès total
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        
        const companyId = session.client_reference_id; // On récupère l'ID de l'entreprise
        const plan = session.metadata?.planId; // On récupère le nom du plan (starter/growth)

        if (companyId && plan) {
            // On calcule 30 jours à partir d'aujourd'hui
            const thirtyDaysFromNow = new Date();
            thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

            // 💡 C'est ICI qu'on débloque le compte en base de données !
            await prisma.company.update({
                where: { id: companyId },
                data: {
                    plan: plan,
                    currentPeriodEnd: thirtyDaysFromNow,
                    cancelAtPeriodEnd: false
                }
            });

            await prisma.notification.create({
                data: {
                    type: "SUCCESS",
                    title: "Billing Upgrade Confirmed",
                    message: `Your workspace is now on the ${plan} plan.`,
                    companyId
                }
            });

            console.log(`✅ SUCCESS: Company ${companyId} upgraded to ${plan}`);
        }
    }

    return NextResponse.json({ received: true }, { status: 200 });
}