// ============================================================================
// 💳 CRÉATION D'UNE SESSION DE PAIEMENT STRIPE (UPGRADE DE PLAN)
// ============================================================================
// Ne débloque RIEN directement : cette route ne fait que créer une page de
// paiement hébergée par Stripe et renvoie son URL au frontend, qui redirige
// l'utilisateur dessus. Le déblocage réel du plan se fait uniquement quand
// Stripe confirme le paiement via app/api/webhooks/stripe (événement
// `checkout.session.completed`) — jamais directement depuis cette route,
// pour ne jamais faire confiance à un simple retour de redirection navigateur.
//
// `client_reference_id: user.companyId` est le fil qui relie cette session à
// l'entreprise : c'est ce champ que le webhook relira pour savoir QUI upgrader.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
    apiVersion: "2026-06-24.dahlia",
});

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const user = await prisma.user.findUnique({
            where: { id: (session.user as any).id },
            select: { companyId: true, email: true }
        });

        if (!user?.companyId) return NextResponse.json({ error: "No company attached" }, { status: 400 });

        const body = await req.json();
        const { plan } = body;

        // Prix codés en dur ici plutôt que via des Stripe Price IDs préconfigurés
        // dans le Dashboard Stripe — simple pour un MVP, mais moins flexible
        // (changer un prix veut dire redéployer le code).
        let amount = 0;
        let planName = "";
        if (plan === "starter") { amount = 4900; planName = "Starter Plan"; } // 4900 centimes = 49.00$
        if (plan === "growth") { amount = 29900; planName = "Growth Plan"; }

        if (amount === 0) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

        // Création de la page de paiement sécurisée Stripe
        const checkoutSession = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            customer_email: user.email,
            client_reference_id: user.companyId, // TRÈS IMPORTANT : On passe l'ID de ton entreprise à Stripe
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: { name: `TrustVerify - ${planName}` },
                        unit_amount: amount,
                        recurring: { interval: "month" } // C'est un abonnement mensuel !
                    },
                    quantity: 1,
                },
            ],
            mode: "subscription",
            // Où rediriger le client après le paiement (Succès ou Annulation)
            success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?payment=success`,
            cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?payment=cancelled`,
            metadata: {
                planId: plan // On garde une trace du plan choisi
            }
        });

        // On renvoie l'URL de la page Stripe au Frontend
        return NextResponse.json({ url: checkoutSession.url });

    } catch (error) {
        console.error("Stripe Checkout Error:", error);
        return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
    }
}