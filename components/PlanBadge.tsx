"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

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

// Petit badge affichant le plan de la company, dérivé de la session (session.user.companyPlan).
// Nécessite l'ajout de companyPlan dans les callbacks jwt/session de app/api/auth/[...nextauth]/route.ts.
export default function PlanBadge() {
    const { data: session, status } = useSession();
    const [currentPlan, setCurrentPlan] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/billing/quota")
            .then((res) => res.ok ? res.json() : null)
            .then((data) => setCurrentPlan(data?.plan || null))
            .catch(() => {});
    }, []);

    if (status === "loading") return null;

    const plan = currentPlan || (session?.user as any)?.companyPlan || "trial";
    const label = PLAN_LABELS[plan] || plan;
    const style = PLAN_STYLES[plan] || PLAN_STYLES.trial;

    return (
        <span className={`hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide border mr-1 ${style}`}>
            {label}
        </span>
    );
}