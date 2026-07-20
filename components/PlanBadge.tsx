"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { onBillingChanged } from "@/lib/billing-events";

const PLAN_LABELS: Record<string, string> = {
    trial: "Trial",
    starter: "Starter",
    growth: "Growth",
    enterprise: "Enterprise",
};

const PLAN_STYLES: Record<string, string> = {
    trial: "bg-gray-100 text-gray-600 border-gray-200",
    starter: "bg-blue-50 text-blue-700 border-blue-200",
    growth: "bg-purple-50 text-purple-700 border-purple-200",
    enterprise: "bg-gradient-to-r from-amber-100 to-yellow-50 text-amber-800 border-amber-300",
};

// Badge du plan de l'entreprise, affiché dans le header du dashboard.
//
// Double source volontaire : on refetch /api/billing/quota (toujours à jour,
// lit directement la DB) plutôt que de faire confiance uniquement au plan
// embarqué dans le JWT (qui peut être périmé jusqu'au prochain refresh de
// session) — mais `session.user.companyPlan` reste utilisé comme repli
// instantané le temps que ce fetch réponde, pour éviter un badge "Trial" qui
// clignote avant d'afficher la vraie valeur.
//
// Ce fetch ne se faisait QU'UNE FOIS au montage, sans jamais réécouter quoi que
// ce soit : le header et l'onglet facturation étant deux arbres React séparés,
// annuler ou reprendre son abonnement laissait le badge figé sur l'ancienne
// valeur jusqu'à un rechargement complet de la page. On se resynchronise donc
// sur trois signaux : l'événement applicatif émis après une mutation de
// facturation, le retour de l'utilisateur sur l'onglet (paiement Stripe terminé
// dans un autre onglet, ou renouvellement pendant que la page était ouverte),
// et bien sûr le montage initial.
export default function PlanBadge() {
    const { data: session, status } = useSession();
    const [currentPlan, setCurrentPlan] = useState<string | null>(null);
    const [isCanceling, setIsCanceling] = useState(false);

    const refresh = useCallback(() => {
        fetch("/api/billing/quota")
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!data) return;
                setCurrentPlan(data.plan || null);
                setIsCanceling(data.status === "canceling");
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        refresh();

        const unsubscribe = onBillingChanged(refresh);
        // `visibilitychange` plutôt que `focus` : on ne recharge que lorsque
        // l'onglet redevient réellement visible, pas à chaque clic dans la page.
        const onVisible = () => {
            if (document.visibilityState === "visible") refresh();
        };
        document.addEventListener("visibilitychange", onVisible);

        return () => {
            unsubscribe();
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [refresh]);

    if (status === "loading") return null;

    const plan = currentPlan || (session?.user as any)?.companyPlan || "trial";
    const label = PLAN_LABELS[plan] || plan;
    const style = PLAN_STYLES[plan] || PLAN_STYLES.trial;

    return (
        <span className="hidden sm:inline-flex items-center gap-1.5 mr-1">
            <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide border ${style}`}
            >
                {label}
            </span>
            {/* L'abonnement reste pleinement actif jusqu'à la fin de période :
                on signale l'arrêt programmé à côté du plan, sans jamais dégrader
                l'affichage du plan lui-même. */}
            {isCanceling && (
                <span
                    title="Your subscription is scheduled to cancel at the end of the billing period."
                    className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border bg-orange-50 text-orange-700 border-orange-200"
                >
                    Canceling
                </span>
            )}
        </span>
    );
}
