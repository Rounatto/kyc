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
//
// Cette route écoute trois événements, et c'est volontaire :
//   - checkout.session.completed    → premier paiement : on débloque le plan
//                                     ET on mémorise les identifiants Stripe.
//   - customer.subscription.updated → toute modification côté Stripe (annulation
//                                     programmée, reprise, renouvellement,
//                                     échec de paiement) est répercutée en base.
//   - customer.subscription.deleted → fin réelle de l'abonnement : retour trial.
//
// Écouter les deux derniers est ce qui rend l'état de notre base fiable : sans
// eux, un client qui annule ou reprend depuis le portail Stripe (ou dont la
// carte est refusée) laisserait notre `plan` figé sur une valeur périmée.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type Stripe from "stripe";
import { stripe, readPeriodEnd } from "@/lib/stripe";

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

// Retrouve l'entreprise concernée par un objet Subscription, et dit si cet
// abonnement est bien celui qui fait autorité pour elle.
//
// La nuance est essentielle lors d'un changement de plan : on résilie l'ancien
// abonnement, ce qui fait arriver un `customer.subscription.deleted` portant sur
// un abonnement DÉJÀ remplacé. Comme les deux partagent le même customer Stripe,
// une recherche naïve retrouverait l'entreprise et la repasserait en trial —
// annulant l'upgrade que le client vient de payer. On ne traite donc un
// événement que s'il concerne l'abonnement courant (`isCurrent`), en tolérant
// le cas où l'entreprise n'en a encore aucun d'enregistré (première synchro
// d'un compte antérieur à ces colonnes).
async function findCompanyForSubscription(subscription: Stripe.Subscription) {
    const customerId =
        typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id;

    const company = await prisma.company.findFirst({
        where: {
            OR: [
                { stripeSubscriptionId: subscription.id },
                ...(customerId ? [{ stripeCustomerId: customerId }] : []),
            ],
        },
        select: {
            id: true,
            plan: true,
            cancelAtPeriodEnd: true,
            stripeSubscriptionId: true,
        },
    });

    if (!company) return null;

    const isCurrent =
        !company.stripeSubscriptionId || company.stripeSubscriptionId === subscription.id;

    return { ...company, isCurrent };
}

export async function POST(req: Request) {
    // Le payload BRUT (pas parsé en JSON) est nécessaire ici : la vérification
    // de signature Stripe recalcule un HMAC sur les octets exacts envoyés —
    // un `req.json()` reformatterait le texte et casserait la signature.
    const payload = await req.text();
    const signature = req.headers.get("stripe-signature") as string;

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(payload, signature, endpointSecret);
    } catch (err: any) {
        console.error(`❌ Webhook signature verification failed.`, err.message);
        return NextResponse.json({ error: "Webhook Error" }, { status: 400 });
    }

    try {
        // ------------------------------------------------------------------
        // 1. PREMIER PAIEMENT RÉUSSI → on débloque le plan
        // ------------------------------------------------------------------
        if (event.type === "checkout.session.completed") {
            const session = event.data.object as Stripe.Checkout.Session;

            const companyId = session.client_reference_id;
            const plan = session.metadata?.planId;

            if (companyId && plan) {
                const subscriptionId =
                    typeof session.subscription === "string"
                        ? session.subscription
                        : session.subscription?.id ?? null;
                const customerId =
                    typeof session.customer === "string"
                        ? session.customer
                        : session.customer?.id ?? null;

                // On lit la VRAIE date de fin de période chez Stripe plutôt que
                // d'inventer "aujourd'hui + 30 jours" comme avant : cette date
                // pilote l'auto-downgrade et l'affichage "accès jusqu'au ...",
                // elle doit correspondre à ce que le client voit sur sa facture.
                let periodEnd: Date | null = null;
                if (subscriptionId) {
                    try {
                        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                        periodEnd = readPeriodEnd(subscription);
                    } catch (err) {
                        console.error("⚠️ Could not retrieve subscription period end:", err);
                    }
                }

                if (!periodEnd) {
                    // Repli si Stripe est injoignable : on ne laisse jamais
                    // `currentPeriodEnd` vide, sinon l'écran facturation
                    // afficherait "Invalid Date".
                    periodEnd = new Date();
                    periodEnd.setDate(periodEnd.getDate() + 30);
                }

                await prisma.company.update({
                    where: { id: companyId },
                    data: {
                        plan,
                        currentPeriodEnd: periodEnd,
                        cancelAtPeriodEnd: false,
                        stripeSubscriptionId: subscriptionId,
                        stripeCustomerId: customerId,
                    },
                });

                // 🧹 Changement de plan : l'ancien abonnement Stripe doit être
                // résilié, sinon le client paierait les deux en parallèle. On le
                // fait APRÈS avoir enregistré le nouveau, pour ne jamais laisser
                // l'entreprise sans abonnement référencé si cet appel échoue.
                const previousSubscriptionId = session.metadata?.previousSubscriptionId;
                if (previousSubscriptionId && previousSubscriptionId !== subscriptionId) {
                    try {
                        await stripe.subscriptions.cancel(previousSubscriptionId);
                        console.log(`🧹 Canceled previous subscription ${previousSubscriptionId}`);
                    } catch (err: any) {
                        // Déjà résilié ou inexistant : rien à faire.
                        if (err?.code !== "resource_missing") {
                            console.error("⚠️ Could not cancel previous subscription:", err);
                        }
                    }
                }

                await prisma.notification.create({
                    data: {
                        type: "SUCCESS",
                        title: "Billing Upgrade Confirmed",
                        message: `Your workspace is now on the ${plan} plan.`,
                        companyId,
                    },
                });

                console.log(`✅ SUCCESS: Company ${companyId} upgraded to ${plan}`);
            }
        }

        // ------------------------------------------------------------------
        // 2. ABONNEMENT MODIFIÉ CHEZ STRIPE → on resynchronise notre base
        // ------------------------------------------------------------------
        // Couvre l'annulation programmée, la reprise, le renouvellement mensuel
        // (nouvelle `current_period_end`) et le passage en `past_due`/`unpaid`.
        else if (event.type === "customer.subscription.updated") {
            const subscription = event.data.object as Stripe.Subscription;
            const company = await findCompanyForSubscription(subscription);

            if (company && !company.isCurrent) {
                console.log(
                    `↩️ IGNORED: update on stale subscription ${subscription.id} (company ${company.id} is on ${company.stripeSubscriptionId})`
                );
            } else if (company) {
                const periodEnd = readPeriodEnd(subscription);
                // Un abonnement `canceled`/`incomplete_expired` ne donne plus
                // droit à rien : on repasse en trial immédiatement. Les statuts
                // `past_due`/`unpaid` gardent l'accès (Stripe retente le
                // paiement plusieurs jours avant d'abandonner).
                const isDead =
                    subscription.status === "canceled" ||
                    subscription.status === "incomplete_expired";

                await prisma.company.update({
                    where: { id: company.id },
                    data: {
                        cancelAtPeriodEnd: subscription.cancel_at_period_end,
                        stripeSubscriptionId: subscription.id,
                        ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
                        ...(isDead ? { plan: "trial", currentPeriodEnd: null } : {}),
                    },
                });

                // On ne notifie que sur un vrai changement d'intention du client
                // (annuler / reprendre), pas à chaque renouvellement mensuel —
                // sinon la cloche se remplit de bruit tous les mois.
                if (company.cancelAtPeriodEnd !== subscription.cancel_at_period_end) {
                    await prisma.notification.create({
                        data: {
                            type: "BILLING",
                            title: subscription.cancel_at_period_end
                                ? "Subscription Cancellation Scheduled"
                                : "Subscription Resumed",
                            message: subscription.cancel_at_period_end
                                ? "Your subscription will cancel at the end of the current billing period."
                                : "Your subscription is active again and will renew automatically.",
                            companyId: company.id,
                        },
                    });
                }

                console.log(
                    `🔄 SYNC: Company ${company.id} subscription updated (status=${subscription.status}, cancelAtPeriodEnd=${subscription.cancel_at_period_end})`
                );
            }
        }

        // ------------------------------------------------------------------
        // 3. ABONNEMENT TERMINÉ → retour au plan trial
        // ------------------------------------------------------------------
        else if (event.type === "customer.subscription.deleted") {
            const subscription = event.data.object as Stripe.Subscription;
            const company = await findCompanyForSubscription(subscription);

            // Un `deleted` sur un abonnement obsolète (celui qu'on vient de
            // remplacer lors d'un changement de plan) ne doit surtout pas
            // déclencher un retour au trial.
            if (company && !company.isCurrent) {
                console.log(
                    `↩️ IGNORED: deletion of stale subscription ${subscription.id} (company ${company.id} is on ${company.stripeSubscriptionId})`
                );
            } else if (company) {
                await prisma.company.update({
                    where: { id: company.id },
                    data: {
                        plan: "trial",
                        cancelAtPeriodEnd: false,
                        currentPeriodEnd: null,
                        stripeSubscriptionId: null,
                    },
                });

                await prisma.notification.create({
                    data: {
                        type: "BILLING",
                        title: "Plan Downgraded to Trial",
                        message:
                            "Your subscription ended and the workspace was downgraded to the trial plan.",
                        companyId: company.id,
                    },
                });

                console.log(`⬇️ DOWNGRADE: Company ${company.id} returned to trial`);
            }
        }
    } catch (error) {
        // On renvoie 500 pour que Stripe REJOUE l'événement plus tard : avaler
        // l'erreur avec un 200 laisserait notre base durablement désynchronisée
        // (un paiement réussi jamais débloqué, par exemple).
        console.error("❌ Webhook handler error:", error);
        return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
    }

    return NextResponse.json({ received: true }, { status: 200 });
}