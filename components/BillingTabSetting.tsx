"use client";

// ============================================================================
// 💳 ONGLET SETTINGS — FACTURATION & USAGE (COMPANY_ADMIN uniquement)
// ============================================================================
// Combine 3 routes billing (Lot 5) : GET /api/billing/quota pour l'état
// courant (plan, usage, date de reset), POST /api/billing/checkout pour
// lancer un upgrade (redirige vers Stripe Checkout via `window.location.href`,
// pas de state React à gérer après ce point), et POST /api/billing/subscription
// pour l'annulation. `searchParams.get("payment")` détecte le retour de Stripe
// après paiement (?payment=success|cancelled, voir success_url/cancel_url
// dans billing/checkout/route.ts) pour afficher un toast puis nettoyer l'URL.
import { useState, useEffect, useCallback } from "react";
import { Zap, CheckCircle2, AlertTriangle, XCircle, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { notifyBillingChanged } from "@/lib/billing-events";

export default function BillingSetting() {
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null); // 💡 Permet de savoir QUEL bouton tourne
    const [billingData, setBillingData] = useState<any>(null);

    const searchParams = useSearchParams();
    const router = useRouter();
    const { update: updateSession } = useSession();

    const fetchQuota = useCallback(async () => {
        try {
            const res = await fetch("/api/billing/quota");
            if (res.ok) {
                const data = await res.json();
                setBillingData(data);
            }
        } catch (error) {
            console.error("Failed to load billing data", error);
        } finally {
            setLoading(false);
        }
    }, []);

    // 💡 DÉTECTION DES RETOURS STRIPE
    useEffect(() => {
        const paymentStatus = searchParams.get("payment");
        if (paymentStatus === "success") {
            toast.success("Payment successful! Your subscription is now active.");
            // Le plan vient de changer côté serveur : on prévient le reste de
            // l'app (badge du header) et on rafraîchit le JWT, qui porte encore
            // l'ancien `companyPlan`.
            notifyBillingChanged();
            updateSession?.();
            // On nettoie l'URL pour que le toast ne réapparaisse pas au rafraîchissement
            router.replace("/dashboard/settings");
        } else if (paymentStatus === "cancelled") {
            toast.info("Payment process was cancelled.");
            router.replace("/dashboard/settings");
        }

        fetchQuota();
    }, [searchParams, router, fetchQuota, updateSession]);

    // Annulation ET reprise passent par la même route : seule l'action change.
    const handleSubscriptionChange = async (action: "CANCEL" | "RESUME") => {
        setActionLoading(action === "CANCEL" ? "cancel" : "resume");
        try {
            const res = await fetch("/api/billing/subscription", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action })
            });

            const data = await res.json().catch(() => ({}));

            if (res.ok) {
                toast.success(
                    action === "CANCEL"
                        ? "Subscription cancelled. You will retain access until the end of your billing cycle."
                        : "Subscription resumed. Your plan will renew automatically."
                );
                await fetchQuota();
                notifyBillingChanged();
            } else {
                toast.error(data.error || "An error occurred processing your request.");
            }
        } catch (error) {
            toast.error("Network error.");
        } finally {
            setActionLoading(null);
        }
    };

    const handleUpgrade = async (plan: string) => {
        setActionLoading(plan);
        try {
            const res = await fetch("/api/billing/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan })
            });

            const data = await res.json().catch(() => ({}));

            if (res.ok && data.url) {
                window.location.href = data.url;
                return; // on quitte la page : inutile de rendre la main au bouton
            }

            // 409 + shouldResume : l'abonnement existe déjà et n'est "que"
            // programmé en annulation. On reprend au lieu de faire repayer.
            if (res.status === 409 && data.shouldResume) {
                setActionLoading(null);
                await handleSubscriptionChange("RESUME");
                return;
            }

            toast.error(data.error || "Failed to initialize payment gateway.");
            setActionLoading(null);
        } catch (error) {
            toast.error("Network error.");
            setActionLoading(null);
        }
    };

    if (loading) return <div className="py-20 flex items-center justify-center flex-col gap-4"><Loader2 className="animate-spin w-8 h-8 text-blue-600" /><p className="text-gray-500 font-medium">Loading Billing Information...</p></div>;

    const usagePercent = Math.min(100, Math.round((billingData.current / billingData.limit) * 100));
    const isPremium = billingData.plan !== "trial";
    const isCanceling = Boolean(billingData.cancelAtPeriodEnd);

    // Libellé et action du bouton d'un plan donné. Toute la correction du bug
    // tient ici : quand l'abonnement est programmé en annulation, le bouton du
    // plan courant ne doit plus être un "Current Plan" grisé — c'est ce qui
    // enfermait le client, sans aucun chemin de retour vers un abonnement actif.
    const planButtonState = (plan: string) => {
        const isCurrent = billingData.plan === plan;

        if (isCurrent && isCanceling) {
            return {
                label: actionLoading === "resume" ? "Reactivating..." : "Reactivate Plan",
                disabled: !!actionLoading,
                busy: actionLoading === "resume",
                onClick: () => handleSubscriptionChange("RESUME"),
                highlight: true,
            };
        }

        if (isCurrent) {
            return {
                label: "Current Plan",
                disabled: true,
                busy: false,
                onClick: () => {},
                highlight: false,
            };
        }

        return {
            label: actionLoading === plan ? "Redirecting..." : `Upgrade to ${plan.charAt(0).toUpperCase() + plan.slice(1)}`,
            disabled: !!actionLoading,
            busy: actionLoading === plan,
            onClick: () => handleUpgrade(plan),
            highlight: false,
        };
    };

    const starterButton = planButtonState("starter");
    const growthButton = planButtonState("growth");

    return (
        <div className="w-full max-w-5xl mx-auto">
            <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900">Billing & Usage</h2>
                <p className="text-sm text-gray-500 mt-1">Manage your subscription, check your quota, and update payment methods.</p>
            </div>

            {/* ALERTE D'ANNULATION — avec la sortie de secours */}
            {isCanceling && (
                <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-xl flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex items-start gap-3 flex-1">
                        <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="text-sm font-bold text-orange-800">Subscription Canceled</h4>
                            <p className="text-sm text-orange-700 mt-1">You will retain access to your Premium quota until <strong>{new Date(billingData.resetDate).toLocaleDateString()}</strong>. After this date, your workspace will be downgraded to the Free Trial plan.</p>
                            <p className="text-sm text-orange-700 mt-1">Changed your mind? Resume now and your plan will keep renewing normally — you will not be charged again before {new Date(billingData.resetDate).toLocaleDateString()}.</p>
                        </div>
                    </div>
                    <button
                        onClick={() => handleSubscriptionChange("RESUME")}
                        disabled={!!actionLoading}
                        className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm rounded-lg transition-colors shrink-0 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {actionLoading === "resume" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                        {actionLoading === "resume" ? "Resuming..." : "Resume Subscription"}
                    </button>
                </div>
            )}

            {/* USAGE QUOTA */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 mb-8">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-md font-bold text-gray-900 flex items-center gap-2"><Zap className="w-4 h-4 text-blue-600" /> Current Usage</h3>
                    <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-gray-100 text-gray-700 text-[10px] font-bold rounded-full uppercase tracking-wider border border-gray-200">
                            {billingData.plan} PLAN
                        </span>
                        {/* Un plan payant annulé reste payant jusqu'à la fin de
                            période : on affiche donc bien deux informations
                            distinctes (le plan, et son état de renouvellement). */}
                        {isPremium && (
                            <span className={`px-3 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider border ${isCanceling ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-green-50 text-green-700 border-green-200"}`}>
                                {isCanceling ? "Canceling" : "Active"}
                            </span>
                        )}
                    </div>
                </div>

                <div className="mb-2 flex justify-between text-sm">
                    <span className="font-medium text-gray-600">KYC/KYB Verifications</span>
                    <span className="font-bold text-gray-900">{billingData.current} / {billingData.limit} used</span>
                </div>
                
                <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden border border-gray-200">
                    <div 
                        className={`h-full rounded-full transition-all duration-1000 ${usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-yellow-400' : 'bg-blue-600'}`}
                        style={{ width: `${usagePercent}%` }}
                    ></div>
                </div>
                <p className="text-xs text-gray-500 mt-3">Quota resets on {new Date(billingData.resetDate).toLocaleDateString()}</p>
            </div>

            {/* PLANS & PRICING */}
            <h3 className="text-md font-bold text-gray-900 mb-4">Available Plans</h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* STARTER */}
                <div className={`bg-white border rounded-xl p-6 flex flex-col ${billingData.plan === "starter" ? "border-blue-500 ring-1 ring-blue-500 shadow-md" : "border-gray-200 shadow-sm"}`}>
                    <h4 className="text-lg font-black text-gray-900">Starter</h4>
                    <p className="text-xs text-gray-500 mt-2 min-h-[32px]">Perfect for early-stage startups.</p>
                    <div className="my-4">
                        <span className="text-3xl font-black text-gray-900">$49</span>
                        <span className="text-gray-500 font-medium text-sm"> / month</span>
                    </div>
                    <ul className="flex flex-col gap-3 mb-6 flex-1">
                        <li className="flex items-center gap-2 text-xs font-medium text-gray-700"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> 50 Verifications</li>
                    </ul>
                    <button
                        onClick={starterButton.onClick}
                        disabled={starterButton.disabled}
                        className={`w-full py-2.5 rounded-lg font-bold text-sm transition-colors border disabled:opacity-50 flex items-center justify-center gap-2 ${starterButton.highlight ? 'bg-orange-600 hover:bg-orange-700 text-white border-orange-600' : billingData.plan === 'starter' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white hover:bg-gray-50 text-gray-900 border-gray-300'}`}
                    >
                        {starterButton.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : starterButton.highlight ? <RotateCcw className="w-4 h-4" /> : null}
                        {starterButton.label}
                    </button>
                </div>

                {/* GROWTH */}
                <div className={`bg-white border rounded-xl p-6 flex flex-col relative ${billingData.plan === "growth" ? "border-blue-500 ring-1 ring-blue-500 shadow-md" : "border-gray-200 shadow-sm"}`}>
                    {billingData.plan !== "growth" && <div className="absolute top-0 right-4 -translate-y-1/2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[9px] font-black uppercase tracking-wider py-1 px-2.5 rounded-full">Popular</div>}
                    <h4 className="text-lg font-black text-gray-900">Growth</h4>
                    <p className="text-xs text-gray-500 mt-2 min-h-[32px]">For businesses scaling operations.</p>
                    <div className="my-4">
                        <span className="text-3xl font-black text-gray-900">$299</span>
                        <span className="text-gray-500 font-medium text-sm"> / month</span>
                    </div>
                    <ul className="flex flex-col gap-3 mb-6 flex-1">
                        <li className="flex items-center gap-2 text-xs font-medium text-gray-700"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> 500 Verifications</li>
                    </ul>
                    <button
                        onClick={growthButton.onClick}
                        disabled={growthButton.disabled}
                        className={`w-full py-2.5 rounded-lg font-bold text-sm transition-colors border disabled:opacity-50 flex items-center justify-center gap-2 ${growthButton.highlight ? 'bg-orange-600 hover:bg-orange-700 text-white border-orange-600' : billingData.plan === 'growth' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-blue-700 hover:bg-blue-800 text-white border-blue-700'}`}
                    >
                        {growthButton.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : growthButton.highlight ? <RotateCcw className="w-4 h-4" /> : null}
                        {growthButton.label}
                    </button>
                </div>

                {/* ENTERPRISE */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col shadow-sm">
                    <h4 className="text-lg font-black text-white">Enterprise</h4>
                    <p className="text-xs text-gray-400 mt-2 min-h-[32px]">Custom limits & infrastructure.</p>
                    <div className="my-4">
                        <span className="text-3xl font-black text-white">Custom</span>
                    </div>
                    <ul className="flex flex-col gap-3 mb-6 flex-1">
                        <li className="flex items-center gap-2 text-xs font-medium text-gray-300"><CheckCircle2 className="w-3.5 h-3.5 text-blue-400" /> Unlimited Volume</li>
                    </ul>
                    {/* Bouton statique : ni onClick ni href/mailto */}
                    <button className="w-full py-2.5 rounded-lg font-bold text-sm transition-colors border bg-gray-800 hover:bg-gray-700 text-white border-gray-700">
                        Contact Sales
                    </button>
                </div>
            </div>

            {/* DANGER ZONE : CANCEL — masquée si une annulation est déjà
                programmée, le bandeau orange du haut prend alors le relais. */}
            {isPremium && !isCanceling && (
                <div className="mt-10 pt-6 border-t border-gray-200">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-5 bg-red-50 border border-red-100 rounded-xl gap-4">
                        <div>
                            <h4 className="text-sm font-bold text-red-900">Cancel Subscription</h4>
                            <p className="text-xs text-red-700 mt-1 max-w-xl">You will lose access to premium features at the end of your billing cycle.</p>
                        </div>
                        <button 
                            onClick={() => handleSubscriptionChange("CANCEL")}
                            disabled={!!actionLoading}
                            className="px-4 py-2 bg-white border border-red-200 text-red-600 font-bold text-sm rounded-lg hover:bg-red-50 transition-colors shrink-0 flex items-center gap-2 disabled:opacity-50"
                        >
                            {actionLoading === "cancel" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} 
                            {actionLoading === "cancel" ? "Canceling..." : "Cancel Plan"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}