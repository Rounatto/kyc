// ============================================================================
// 🪝 WEBHOOK STRIPE — SEULE ROUTE AUTORISÉE À DÉBLOQUER UN PLAN PAYANT
// ============================================================================
// Contrairement aux autres routes, celle-ci n'a AUCUNE session utilisateur —
// l'appelant est Stripe lui-même, pas un navigateur. La sécurité repose donc
// entièrement sur `stripe.webhooks.constructEvent`, qui vérifie la signature
// cryptographique HMAC envoyée par Stripe dans le header `stripe-signature`.
// Sans cette vérification, n'importe qui pourrait POSTer un faux événement
// "checkout.session.completed" et débloquer un plan payant gratuitement —
// c'est pour ça qu'un `endpointSecret` manquant/faux fait échouer TOUTE la
// route (fail-closed), pas juste un warning.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
    apiVersion: "2026-06-24.dahlia",
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

export async function POST(req: Request) {
    // Le payload BRUT (pas parsé en JSON) est nécessaire ici : la vérification
    // de signature Stripe recalcule un HMAC sur les octets exacts envoyés —
    // un `req.json()` reformatterait le texte et casserait la signature.
    const payload = await req.text();
    const signature = req.headers.get("stripe-signature") as string;

    let event;

    try {
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
            // Simplification : on fixe nous-mêmes "30 jours à partir de
            // maintenant" plutôt que de lire la vraie date de fin de période
            // renvoyée par l'objet Subscription de Stripe (qui gère les mois
            // à 28/29/31 jours, les fuseaux, les renouvellements...). Suffisant
            // pour un MVP, mais dérive légèrement de la facturation réelle Stripe.
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