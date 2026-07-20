// ============================================================================
// 💳 CRÉATION D'UNE SESSION DE PAIEMENT STRIPE (SOUSCRIPTION / CHANGEMENT DE PLAN)
// ============================================================================
// Ne débloque RIEN directement : cette route ne fait que créer une page de
// paiement hébergée par Stripe et renvoie son URL au frontend, qui redirige
// l'utilisateur dessus. Le déblocage réel du plan se fait uniquement quand
// Stripe confirme le paiement via app/api/webhooks/stripe (événement
// `checkout.session.completed`) — jamais directement depuis cette route,
// pour ne jamais faire confiance à un simple retour de redirection navigateur.
//
// `client_reference_id: companyId` est le fil qui relie cette session à
// l'entreprise : c'est ce champ que le webhook relira pour savoir QUI upgrader.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";
import { stripe, PLAN_CATALOG, isPaidPlan } from "@/lib/stripe";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        // 🛡️ Engager une dépense récurrente pour l'entreprise est une action
        // d'administrateur, pas d'agent KYC.
        const guard = enforceRole(session, ["COMPANY_ADMIN"]);
        if (!guard.isValid) return guard.response!;
        const { companyId } = guard;

        const body = await req.json().catch(() => ({}));
        const { plan } = body ?? {};

        // Le montant est lu dans le catalogue serveur à partir d'un simple
        // identifiant de plan : le client ne transmet jamais de prix.
        if (typeof plan !== "string" || !isPaidPlan(plan)) {
            return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
        }

        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: {
                plan: true,
                cancelAtPeriodEnd: true,
                stripeCustomerId: true,
                stripeSubscriptionId: true,
            },
        });

        if (!company) {
            return NextResponse.json({ error: "Company not found" }, { status: 404 });
        }

        // 🔁 Cas central du bug corrigé ici : l'entreprise est déjà sur ce plan,
        // mais l'a programmé en annulation. Repasser par un paiement créerait un
        // SECOND abonnement Stripe (double facturation) alors que le premier est
        // encore actif. La bonne opération est une reprise, pas un achat.
        if (company.plan === plan && company.cancelAtPeriodEnd) {
            return NextResponse.json(
                {
                    error: "Your current subscription is scheduled to cancel. Resume it instead of paying again.",
                    shouldResume: true,
                },
                { status: 409 }
            );
        }

        if (company.plan === plan) {
            return NextResponse.json({ error: "You are already on this plan." }, { status: 400 });
        }

        const { amount, label } = PLAN_CATALOG[plan];

        const user = await prisma.user.findUnique({
            where: { id: guard.userId },
            select: { email: true },
        });

        const checkoutSession = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            // On réutilise le client Stripe existant quand on en connaît un :
            // sinon chaque souscription créerait un nouveau customer, et
            // l'historique de facturation du client serait éparpillé.
            ...(company.stripeCustomerId
                ? { customer: company.stripeCustomerId }
                : { customer_email: user?.email ?? undefined }),
            client_reference_id: companyId, // TRÈS IMPORTANT : relie la session à l'entreprise
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: { name: `TrustVerify - ${label}` },
                        unit_amount: amount,
                        recurring: { interval: "month" },
                    },
                    quantity: 1,
                },
            ],
            mode: "subscription",
            success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?payment=success`,
            cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?payment=cancelled`,
            metadata: {
                planId: plan,
                // Le webhook s'en sert pour résilier l'ancien abonnement après
                // un changement de plan, et éviter de facturer les deux.
                previousSubscriptionId: company.stripeSubscriptionId ?? "",
            },
        });

        return NextResponse.json({ url: checkoutSession.url });
    } catch (error) {
        console.error("Stripe Checkout Error:", error);
        return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
    }
}