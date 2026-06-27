"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Check, X, FileText, ShieldAlert, User, Clock, History } from "lucide-react";
import Link from "next/link";
import Header from "@/components/header";

export default function CustomerReviewPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const customerId = resolvedParams.id;
    
    const [customer, setCustomer] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        async function loadCustomer() {
            try {
                const res = await fetch(`/api/customers/${customerId}`);
                if (res.ok) setCustomer(await res.json());
            } catch (err) { console.error("Erreur chargement"); } 
            finally { setLoading(false); }
        }
        loadCustomer();
    }, [customerId]);

    const handleDecision = async (newStatus: "verified" | "rejected") => {
        setActionLoading(newStatus);
        try {
            const res = await fetch(`/api/customers/${customerId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) setCustomer((prev: any) => ({ ...prev, status: newStatus }));
        } finally { setActionLoading(null); }
    };

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin w-8 h-8 text-blue-600" /></div>;

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            <Header />
            <div className="max-w-6xl mx-auto px-4 py-8">
                <Link href="/dashboard/customers" className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-700 mb-6">
                    <ArrowLeft className="w-4 h-4" /> Retour à l'annuaire
                </Link>

                <div className="flex flex-wrap items-start gap-6">
                    {/* Colonne Gauche (Données) */}
                    <div className="flex-[2_1_600px] flex flex-col gap-6">
                        {/* Identité */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold">
                                    {customer.customerName?.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold">{customer.customerName}</h1>
                                    <p className="text-sm text-gray-500">ID: {customer.id}</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-x-12 gap-y-6">
                                <div><p className="text-xs text-gray-400 font-bold uppercase">CIN</p><p className="font-bold">{customer.cin}</p></div>
                                <div><p className="text-xs text-gray-400 font-bold uppercase">Email</p><p className="font-medium">{customer.email}</p></div>
                                <div><p className="text-xs text-gray-400 font-bold uppercase">Nationalité</p><p className="font-medium">{customer.nationality || "N/A"}</p></div>
                            </div>
                        </div>

                        {/* Documents */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                            <h3 className="text-sm font-bold uppercase mb-4 flex items-center gap-2"><FileText className="w-4 h-4" /> Documents fournis</h3>
                            <div className="flex gap-4">
                                <div className="flex-1 border border-gray-200 rounded-xl p-4 bg-gray-50 text-center">
                                    <FileText className="w-6 h-6 mx-auto text-gray-400 mb-2" />
                                    <p className="text-xs font-bold uppercase">Recto CIN</p>
                                </div>
                                <div className="flex-1 border border-gray-200 rounded-xl p-4 bg-gray-50 text-center">
                                    <User className="w-6 h-6 mx-auto text-gray-400 mb-2" />
                                    <p className="text-xs font-bold uppercase">Selfie</p>
                                </div>
                            </div>
                        </div>

                        {/* Audit Log (Ajouté !) */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                            <h3 className="text-sm font-bold uppercase mb-4 flex items-center gap-2"><History className="w-4 h-4" /> Piste d'Audit</h3>
                            <div className="space-y-4">
                                <div className="flex gap-3 text-sm text-gray-600 border-l-2 border-gray-200 pl-4">
                                    <Clock className="w-4 h-4 mt-0.5 text-blue-600" />
                                    <div><p className="font-bold">Dossier créé</p><p className="text-xs">Système automatique - {new Date(customer.submittedAt).toLocaleDateString()}</p></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Colonne Droite (Décision) */}
                    <div className="flex-[1_1_300px] flex flex-col gap-6">
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                            <h3 className="text-sm font-bold mb-4 flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> Score Risque IA</h3>
                            <div className="text-5xl font-black text-gray-900 mb-2">{customer.score} <span className="text-xl text-gray-400">/100</span></div>
                            <p className="text-xs text-gray-500 mb-6">{parseInt(customer.score) > 50 ? "Profil sain" : "Risque détecté"}</p>
                            
                            <div className="flex flex-col gap-3">
                                <button onClick={() => handleDecision("verified")} disabled={actionLoading !== null} className="w-full bg-green-600 text-white font-bold py-3 rounded-xl hover:bg-green-700 transition-all flex justify-center">
                                    {actionLoading === "verified" ? <Loader2 className="animate-spin" /> : "Approuver"}
                                </button>
                                <button onClick={() => handleDecision("rejected")} disabled={actionLoading !== null} className="w-full bg-white border border-gray-200 text-red-600 font-bold py-3 rounded-xl hover:bg-red-50 transition-all flex justify-center">
                                    {actionLoading === "rejected" ? <Loader2 className="animate-spin" /> : "Rejeter"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}