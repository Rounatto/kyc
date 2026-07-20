// ============================================================================
// 💳 CLIENT STRIPE PARTAGÉ + HELPERS D'ABONNEMENT
// ============================================================================
// Avant ce fichier, chaque route billing instanciait son propre `new Stripe(...)`
// avec sa propre `apiVersion` copiée-collée : trois endroits à modifier à chaque
// montée de version, et un risque réel de divergence silencieuse entre le
// checkout et le webhook. Une seule instance ici, importée partout.

import Stripe from "stripe";

// Les plans payants et leurs tarifs, source de vérité unique côté serveur.
// Le frontend affiche ces mêmes chiffres, mais ne les envoie JAMAIS : la route
// checkout ne reçoit qu'un identifiant de plan ("starter"/"growth") et lit le
// montant ici — sinon un client pourrait se créer une session à 0,50 $.
export const PLAN_CATALOG = {
    starter: { amount: 4900, label: "Starter Plan", limit: 50 },
    growth: { amount: 29900, label: "Growth Plan", limit: 500 },
} as const;

export type PaidPlan = keyof typeof PLAN_CATALOG;

export function isPaidPlan(plan: string): plan is PaidPlan {
    return plan === "starter" || plan === "growth";
}

// Quota mensuel de vérifications par plan. Centralisé ici parce que la même
// table était dupliquée dans billing/quota et dans la logique d'affichage.
export function getPlanLimit(plan: string): number {
    if (plan === "starter") return PLAN_CATALOG.starter.limit;
    if (plan === "growth") return PLAN_CATALOG.growth.limit;
    if (plan === "enterprise") return 999999;
    return 5; // trial
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
    apiVersion: "2026-06-24.dahlia",
});

// Stripe n'est configuré que si la clé secrète existe. En développement local
// sans compte Stripe, on veut que l'app reste utilisable (annulation/reprise
// en base seule) plutôt que de planter sur un appel réseau voué à échouer.
export function isStripeConfigured(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Lit la fin de période de facturation d'un abonnement Stripe.
 *
 * Pourquoi ce n'est pas un simple `subscription.current_period_end` : depuis
 * l'API "Basil" (2025-03-31), Stripe a déplacé ce champ de l'abonnement vers
 * chacun de ses items, pour supporter les abonnements dont les lignes ont des
 * cycles différents. Nos abonnements n'ont qu'une seule ligne, mais le champ
 * racine peut disparaître selon la version d'API négociée — on lit donc l'item
 * en priorité, avec repli sur la racine pour les anciens objets.
 */
export function readPeriodEnd(subscription: Stripe.Subscription): Date | null {
    const fromItem = subscription.items?.data?.[0]?.current_period_end;
    // Le champ racine n'existe plus dans les types Stripe récents, d'où le cast :
    // il reste présent à l'exécution sur les objets issus d'anciennes versions d'API.
    const fromRoot = (subscription as unknown as { current_period_end?: number })
        .current_period_end;
    const raw = fromItem ?? fromRoot;
    return typeof raw === "number" ? new Date(raw * 1000) : null;
}
