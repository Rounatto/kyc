"use client";

import { useState, useEffect, use } from "react";
import { useSession } from "next-auth/react"; // Import pour récupérer l'agent connecté
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Check, X, FileText, ShieldAlert, User, Clock, History } from "lucide-react";
import Link from "next/link";
import Header from "@/components/header";

export default function CustomerReviewPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const customerId = resolvedParams.id;
    
    const { data: session } = useSession(); // Récupération de la session
    const router = useRouter();

    const [customer, setCustomer] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        async function loadCustomer() {
            try {
                const res = await fetch(`/api/customers/${customerId}`);
                if (res.ok) setCustomer(await res.json());
            } catch (err) { 
                console.error("Loading error"); 
            } finally { 
                setLoading(false); 
            }
        }
        loadCustomer();
    }, [customerId]);

    const handleDecision = async (newStatus: "verified" | "rejected") => {
        setActionLoading(newStatus);
        try {
            const res = await fetch(`/api/customers/${customerId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    status: newStatus,
                    agentId: (session?.user as any)?.id // Envoi de l'ID pour la piste d'audit
                }),
            });
            
            if (res.ok) {
                const updatedCustomer = await res.json();
                // Mise à jour de l'UI avec les nouvelles données (incluant le nouveau log)
                setCustomer(updatedCustomer);
            }
        } finally { 
            setActionLoading(null); 
        }
    };

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin w-8 h-8 text-blue-600" /></div>;
    if (!customer) return <div className="min-h-screen flex items-center justify-center text-gray-500">Customer not found.</div>;

    // Définition des couleurs selon le niveau de risque IA
    const riskColors = {
        High: "bg-red-50 border-red-200 text-red-700",
        Medium: "bg-yellow-50 border-yellow-200 text-yellow-700",
        Low: "bg-green-50 border-green-200 text-green-700"
    };
    const currentRiskColor = riskColors[customer.riskLevel as keyof typeof riskColors] || riskColors.Medium;

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            <Header />
            <div className="max-w-6xl mx-auto px-4 py-8">
                <Link href="/dashboard/customers" className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-700 mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Directory
                </Link>

                {/* Structure 100% Flexbox */}
                <div className="flex flex-wrap items-start gap-6">
                    
                    {/* Colonne Gauche (Données) */}
                    <div className="flex-[2_1_600px] flex flex-col gap-6">
                        
                        {/* Section Identité */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-6">
                            <div className="flex flex-wrap justify-between items-start gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold shrink-0">
                                        {customer.customerName?.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="flex flex-col">
                                        <h1 className="text-2xl font-bold text-gray-900">{customer.customerName}</h1>
                                        <p className="text-sm text-gray-500 font-mono break-all">ID: {customer.id}</p>
                                    </div>
                                </div>
                                <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                                    customer.status === "verified" ? "bg-green-100 text-green-700" :
                                    customer.status === "rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                                }`}>
                                    {customer.status}
                                </span>
                            </div>

                            <div className="flex flex-wrap gap-x-12 gap-y-6 pt-4 border-t border-gray-100">
                                <div className="flex-1 min-w-[120px]"><p className="text-xs text-gray-400 font-bold uppercase mb-1">Document ID</p><p className="font-bold text-gray-800">{customer.cin}</p></div>
                                <div className="flex-1 min-w-[150px]"><p className="text-xs text-gray-400 font-bold uppercase mb-1">Email</p><p className="font-medium text-gray-800 break-all">{customer.email}</p></div>
                                <div className="flex-1 min-w-[120px]"><p className="text-xs text-gray-400 font-bold uppercase mb-1">Nationality</p><p className="font-medium text-gray-800">{customer.nationality || "N/A"}</p></div>
                                <div className="flex-1 min-w-[120px]"><p className="text-xs text-gray-400 font-bold uppercase mb-1">Phone</p><p className="font-medium text-gray-800">{customer.phoneNumber || "N/A"}</p></div>
                            </div>
                        </div>

                        {/* Section Documents (Préparation UploadThing) */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-4">
                            <h3 className="text-sm font-bold uppercase flex items-center gap-2 text-gray-800"><FileText className="w-4 h-4 text-blue-600" /> Provided Documents</h3>
                            <div className="flex flex-col sm:flex-row gap-4">
                                <div className="flex-1 border border-gray-200 rounded-xl p-6 bg-gray-50 flex flex-col items-center justify-center text-center cursor-pointer hover:border-blue-300 transition-colors">
                                    <FileText className="w-6 h-6 text-gray-400 mb-2" />
                                    <p className="text-xs font-bold uppercase text-gray-700">Front ID</p>
                                </div>
                                <div className="flex-1 border border-gray-200 rounded-xl p-6 bg-gray-50 flex flex-col items-center justify-center text-center cursor-pointer hover:border-blue-300 transition-colors">
                                    <User className="w-6 h-6 text-gray-400 mb-2" />
                                    <p className="text-xs font-bold uppercase text-gray-700">Selfie Match</p>
                                </div>
                            </div>
                        </div>

                        {/* Piste d'Audit Dynamique */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-5">
                            <h3 className="text-sm font-bold uppercase flex items-center gap-2 text-gray-800"><History className="w-4 h-4 text-blue-600" /> Audit Trail</h3>
                            <div className="flex flex-col gap-4 pl-2">
                                {customer.auditLogs && customer.auditLogs.length > 0 ? (
                                    customer.auditLogs.map((log: any) => (
                                        <div key={log.id} className="flex gap-4 relative border-l-2 border-gray-100 pl-4 pb-2">
                                            {/* Point sur la timeline */}
                                            <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-blue-500 ring-4 ring-white"></span>
                                            <div className="flex flex-col">
                                                <p className="text-sm font-bold text-gray-900">{log.action}</p>
                                                <p className="text-xs text-gray-600 mt-0.5">{log.details}</p>
                                                <p className="text-[10px] text-gray-400 mt-1.5 font-mono">{new Date(log.timestamp).toLocaleString()}</p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-gray-500">No audit logs available.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Colonne Droite (Décision & IA) */}
                    <div className="flex-[1_1_300px] flex flex-col gap-6">
                        
                        {/* Panneau IA Dynamique */}
                        <div className={`p-6 rounded-2xl border shadow-sm flex flex-col ${currentRiskColor}`}>
                            <h3 className="text-sm font-bold mb-4 flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> AI Risk Analysis</h3>
                            <div className="flex items-baseline gap-1 mb-1">
                                <span className="text-5xl font-black">{customer.score}</span>
                                <span className="text-xl opacity-60 font-bold">/100</span>
                            </div>
                            <p className="text-xs font-bold uppercase tracking-wider mb-3 opacity-80">{customer.riskLevel} Risk</p>
                            <div className="bg-white/50 rounded-lg p-3 border border-black/5">
                                <p className="text-xs font-medium leading-relaxed">{customer.aiRationale}</p>
                            </div>
                        </div>

                        {/* Actions de conformité */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-4">
                            <h3 className="text-sm font-bold text-gray-800">Compliance Decision</h3>
                            <div className="flex flex-col gap-3">
                                <button 
                                    onClick={() => handleDecision("verified")} 
                                    disabled={actionLoading !== null || customer.status === "verified"} 
                                    className="w-full bg-green-600 text-white font-bold py-3.5 rounded-xl hover:bg-green-700 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                                >
                                    {actionLoading === "verified" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} 
                                    Approve Profile
                                </button>
                                <button 
                                    onClick={() => handleDecision("rejected")} 
                                    disabled={actionLoading !== null || customer.status === "rejected"} 
                                    className="w-full bg-white border-2 border-red-100 text-red-600 font-bold py-3.5 rounded-xl hover:bg-red-50 hover:border-red-200 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                                >
                                    {actionLoading === "rejected" ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} 
                                    Reject Profile
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}