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
import { useState, useEffect } from "react";
import { Zap, CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams, useRouter } from "next/navigation";

export default function BillingSetting() {
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null); // 💡 Permet de savoir QUEL bouton tourne
    const [billingData, setBillingData] = useState<any>(null);
    
    const searchParams = useSearchParams();
    const router = useRouter();

    const fetchQuota = async () => {
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
    };

    // 💡 DÉTECTION DES RETOURS STRIPE
    useEffect(() => {
        const paymentStatus = searchParams.get("payment");
        if (paymentStatus === "success") {
            toast.success("Payment successful! Your subscription is now active.");
            // On nettoie l'URL pour que le toast ne réapparaisse pas au rafraîchissement
            router.replace("/dashboard/settings");
        } else if (paymentStatus === "cancelled") {
            toast.info("Payment process was cancelled.");
            router.replace("/dashboard/settings");
        }
        
        fetchQuota();
    }, [searchParams, router]);

    const handleSubscriptionAction = async (action: "UPGRADE" | "CANCEL", plan?: string) => {
        setActionLoading(action === "UPGRADE" ? plan || "upgrade" : "cancel");
        try {
            if (action === "UPGRADE") {
                const res = await fetch("/api/billing/checkout", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ plan })
                });

                const data = await res.json();
                if (res.ok && data.url) {
                    window.location.href = data.url; 
                } else {
                    toast.error(data.error || "Failed to initialize payment gateway.");
                    setActionLoading(null);
                }
            } else {
                const res = await fetch("/api/billing/subscription", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action })
                });
                
                if (res.ok) {
                    toast.success("Subscription cancelled. You will retain access until the end of your billing cycle.");
                    await fetchQuota(); 
                } else {
                    toast.error("An error occurred processing your request.");
                }
                setActionLoading(null);
            }
        } catch (error) {
            toast.error("Network error.");
            setActionLoading(null);
        }
    };

    if (loading) return <div className="py-20 flex items-center justify-center flex-col gap-4"><Loader2 className="animate-spin w-8 h-8 text-blue-600" /><p className="text-gray-500 font-medium">Loading Billing Information...</p></div>;

    const usagePercent = Math.min(100, Math.round((billingData.current / billingData.limit) * 100));
    const isPremium = billingData.plan !== "trial";

    return (
        <div className="w-full max-w-5xl mx-auto">
            <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900">Billing & Usage</h2>
                <p className="text-sm text-gray-500 mt-1">Manage your subscription, check your quota, and update payment methods.</p>
            </div>

            {/* ALERTE D'ANNULATION */}
            {billingData.cancelAtPeriodEnd && (
                <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="text-sm font-bold text-orange-800">Subscription Canceled</h4>
                        <p className="text-sm text-orange-700 mt-1">You will retain access to your Premium quota until <strong>{new Date(billingData.resetDate).toLocaleDateString()}</strong>. After this date, your workspace will be downgraded to the Free Trial plan.</p>
                    </div>
                </div>
            )}

            {/* USAGE QUOTA */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 mb-8">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-md font-bold text-gray-900 flex items-center gap-2"><Zap className="w-4 h-4 text-blue-600" /> Current Usage</h3>
                    <span className="px-3 py-1 bg-gray-100 text-gray-700 text-[10px] font-bold rounded-full uppercase tracking-wider border border-gray-200">
                        {billingData.plan} PLAN
                    </span>
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
                        onClick={() => handleSubscriptionAction("UPGRADE", "starter")}
                        disabled={!!actionLoading || billingData.plan === "starter"}
                        className={`w-full py-2.5 rounded-lg font-bold text-sm transition-colors border disabled:opacity-50 flex items-center justify-center gap-2 ${billingData.plan === 'starter' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white hover:bg-gray-50 text-gray-900 border-gray-300'}`}
                    >
                        {actionLoading === "starter" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {actionLoading === "starter" ? "Redirecting..." : billingData.plan === "starter" ? "Current Plan" : "Upgrade to Starter"}
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
                        onClick={() => handleSubscriptionAction("UPGRADE", "growth")}
                        disabled={!!actionLoading || billingData.plan === "growth"}
                        className={`w-full py-2.5 rounded-lg font-bold text-sm transition-colors border disabled:opacity-50 flex items-center justify-center gap-2 ${billingData.plan === 'growth' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-blue-700 hover:bg-blue-800 text-white border-blue-700'}`}
                    >
                        {actionLoading === "growth" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {actionLoading === "growth" ? "Redirecting..." : billingData.plan === "growth" ? "Current Plan" : "Upgrade to Growth"}
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

            {/* DANGER ZONE : CANCEL */}
            {isPremium && !billingData.cancelAtPeriodEnd && (
                <div className="mt-10 pt-6 border-t border-gray-200">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-5 bg-red-50 border border-red-100 rounded-xl gap-4">
                        <div>
                            <h4 className="text-sm font-bold text-red-900">Cancel Subscription</h4>
                            <p className="text-xs text-red-700 mt-1 max-w-xl">You will lose access to premium features at the end of your billing cycle.</p>
                        </div>
                        <button 
                            onClick={() => handleSubscriptionAction("CANCEL")}
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