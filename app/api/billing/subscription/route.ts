// ============================================================================
// 📉 GESTION D'ABONNEMENT — ANNULATION ET REPRISE
// ============================================================================
// Deux actions seulement, et surtout PAS d'upgrade : passer à un plan payant
// reste réservé à billing/checkout + webhooks/stripe, pour qu'aucun client ne
// puisse s'auto-attribuer un plan sans paiement. Un payload "UPGRADE" envoyé
// ici tombe donc sur le "Invalid action" en bas.
//
//   - CANCEL : programme l'arrêt en fin de période. L'accès est conservé
//              jusqu'à `currentPeriodEnd`, puis l'auto-downgrade de
//              billing/quota (ou le webhook Stripe) repasse en trial.
//   - RESUME : annule l'annulation. C'était la brique manquante — sans elle,
//              un client qui cliquait "Cancel" par erreur n'avait AUCUN moyen
//              de revenir en arrière : le bandeau "Subscription Canceled"
//              restait affiché pour toujours et le bouton de son plan restait
//              grisé sur "Current Plan", donc même un rachat était impossible.
//
// Les deux actions propagent la décision à Stripe quand l'entreprise a un
// `stripeSubscriptionId` (sinon Stripe continuerait de facturer un client qui
// se croit désabonné). Quand cet identifiant est absent — entreprises créées
// avant l'ajout de ces colonnes, ou environnement de dev sans clé Stripe — on
// bascule sur un repli "base seule" pour que l'écran reste cohérent.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";
import { logSecurityEvent } from "@/lib/logger";
import { stripe, isStripeConfigured, readPeriodEnd } from "@/lib/stripe";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        // 🛡️ La facturation est une prérogative d'administrateur : un
        // COMPANY_AGENT pouvait jusqu'ici annuler l'abonnement de toute
        // l'entreprise, puisque la route se contentait de vérifier qu'une
        // session existait.
        const guard = enforceRole(session, ["COMPANY_ADMIN"]);
        if (!guard.isValid) return guard.response!;
        const { companyId, userId } = guard;

        const body = await req.json().catch(() => ({}));
        const { action } = body ?? {};

        if (action !== "CANCEL" && action !== "RESUME") {
            return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }

        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: {
                plan: true,
                cancelAtPeriodEnd: true,
                currentPeriodEnd: true,
                stripeSubscriptionId: true,
            },
        });

        if (!company) {
            return NextResponse.json({ error: "Company not found" }, { status: 404 });
        }

        // Un plan trial n'a rien à annuler ni à reprendre. Sans ce garde-fou,
        // "RESUME" sur un compte trial afficherait un succès trompeur.
        if (company.plan === "trial") {
            return NextResponse.json(
                { error: "No active subscription to modify. Choose a plan to subscribe." },
                { status: 400 }
            );
        }

        const cancelAtPeriodEnd = action === "CANCEL";

        // Idempotence : recliquer sur "Resume" alors que l'abonnement est déjà
        // actif ne doit pas produire d'erreur, juste renvoyer l'état courant.
        if (company.cancelAtPeriodEnd === cancelAtPeriodEnd) {
            return NextResponse.json({
                message: cancelAtPeriodEnd
                    ? "Subscription is already scheduled to cancel"
                    : "Subscription is already active",
                plan: company.plan,
                cancelAtPeriodEnd: company.cancelAtPeriodEnd,
                currentPeriodEnd: company.currentPeriodEnd,
            });
        }

        let periodEnd = company.currentPeriodEnd;

        // --- Propagation vers Stripe ------------------------------------
        if (company.stripeSubscriptionId && isStripeConfigured()) {
            try {
                const updated = await stripe.subscriptions.update(company.stripeSubscriptionId, {
                    cancel_at_period_end: cancelAtPeriodEnd,
                });
                periodEnd = readPeriodEnd(updated) ?? periodEnd;
            } catch (err: any) {
                // `resource_missing` = l'abonnement n'existe plus chez Stripe
                // (supprimé à la main, ou base de test réinitialisée). Bloquer
                // l'utilisateur dans ce cas serait absurde : on le laisse
                // reprendre la main en base, quitte à ce que Stripe resynchronise
                // plus tard via webhook.
                if (err?.code === "resource_missing") {
                    console.warn(
                        `⚠️ Stripe subscription ${company.stripeSubscriptionId} missing, falling back to DB-only update.`
                    );
                } else {
                    // Toute autre erreur (réseau, clé invalide, carte refusée)
                    // doit remonter : écrire en base un état que Stripe ignore
                    // créerait exactement le décalage qu'on cherche à supprimer.
                    console.error("Stripe subscription update failed:", err);
                    return NextResponse.json(
                        {
                            error: cancelAtPeriodEnd
                                ? "Could not cancel with our payment provider. Please try again."
                                : "Could not resume with our payment provider. Please try again.",
                        },
                        { status: 502 }
                    );
                }
            }
        }

        // --- Écriture en base -------------------------------------------
        // Reprendre un abonnement dont la période est déjà expirée n'a pas de
        // sens (l'accès est terminé) : on repousse d'un mois pour laisser
        // l'écran cohérent, le webhook Stripe corrigera avec la vraie date.
        if (!cancelAtPeriodEnd && (!periodEnd || periodEnd < new Date())) {
            const fallback = new Date();
            fallback.setDate(fallback.getDate() + 30);
            periodEnd = fallback;
        }

        await prisma.company.update({
            where: { id: companyId },
            data: { cancelAtPeriodEnd, currentPeriodEnd: periodEnd },
        });

        await prisma.notification.create({
            data: {
                type: "BILLING",
                title: cancelAtPeriodEnd
                    ? "Subscription Cancellation Scheduled"
                    : "Subscription Resumed",
                message: cancelAtPeriodEnd
                    ? "Your subscription will cancel at the end of the current billing period."
                    : "Your subscription is active again and will renew automatically.",
                companyId: companyId!,
            },
        });

        // Trace de conformité : qui a touché à la facturation, et quand.
        await logSecurityEvent({
            action: cancelAtPeriodEnd ? "SUBSCRIPTION_CANCELED" : "SUBSCRIPTION_RESUMED",
            details: `Plan ${company.plan} — cancelAtPeriodEnd set to ${cancelAtPeriodEnd}`,
            companyId: companyId!,
            agentId: userId,
        });

        return NextResponse.json({
            message: cancelAtPeriodEnd
                ? "Subscription set to cancel at period end"
                : "Subscription resumed",
            plan: company.plan,
            cancelAtPeriodEnd,
            currentPeriodEnd: periodEnd,
        });
    } catch (error) {
        console.error("Subscription Error:", error);
        return NextResponse.json({ error: "Failed to process subscription" }, { status: 500 });
    }
}