"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldAlert, User, Mail, CreditCard, Phone, Loader2, Check, X } from "lucide-react";
import Link from "next/link";
import Header from "@/components/header";

export default function CustomerReviewPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const customerId = resolvedParams.id;
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
                console.error("Erreur de chargement");
            } finally {
                setLoading(false);
            }
        }
        loadCustomer();
    }, [customerId]);

    // L'action d'approuver ou rejeter
    const handleDecision = async (newStatus: "verified" | "rejected") => {
        setActionLoading(newStatus === "verified" ? "approve" : "reject");
        try {
            const res = await fetch(`/api/customers/${customerId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });

            if (res.ok) {
                setCustomer((prev: any) => ({ ...prev, status: newStatus }));
            }
        } catch (err) {
            alert("Erreur réseau");
        } finally {
            setActionLoading(null);
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600 w-8 h-8" /></div>;
    if (!customer) return <div className="min-h-screen text-center pt-20">Dossier introuvable.</div>;

    return (
        <div className="w-full min-h-screen bg-gray-50">
            <Header />
            <div className="max-w-5xl mx-auto px-4 py-8">
                <Link href="/dashboard/customers" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-blue-700 font-medium mb-6">
                    <ArrowLeft className="w-4 h-4" /> Retour à l'annuaire
                </Link>

                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xl font-bold">
                            {customer.customerName ? customer.customerName.substring(0, 2).toUpperCase() : "??"}
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">{customer.customerName}</h1>
                            <p className="text-xs text-gray-500 font-mono mt-0.5">ID: {customer.id}</p>
                        </div>
                    </div>
                    <span className={`text-xs px-3 py-1.5 rounded-full font-bold uppercase tracking-wider ${
                        customer.status === "verified" ? "bg-green-100 text-green-700" :
                        customer.status === "rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                    }`}>
                        {customer.status}
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 flex flex-col gap-6">
                        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                            <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4 uppercase tracking-wider">Identité</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div><p className="text-xs text-gray-400 uppercase">CIN</p><p className="font-mono font-bold">{customer.cin}</p></div>
                                <div><p className="text-xs text-gray-400 uppercase">Email</p><p className="font-medium">{customer.email}</p></div>
                                <div><p className="text-xs text-gray-400 uppercase">Téléphone</p><p className="font-medium">{customer.phoneNumber || "N/A"}</p></div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4 bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 uppercase tracking-wider">Décision</h3>
                        <button 
                            onClick={() => handleDecision("verified")}
                            disabled={actionLoading !== null || customer.status === "verified"}
                            className="w-full flex justify-center items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-bold py-3 rounded-lg text-sm transition-colors cursor-pointer"
                        >
                            {actionLoading === "approve" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approuver
                        </button>
                        <button 
                            onClick={() => handleDecision("rejected")}
                            disabled={actionLoading !== null || customer.status === "rejected"}
                            className="w-full flex justify-center items-center gap-2 bg-white border border-red-200 hover:bg-red-50 disabled:bg-gray-100 text-red-600 disabled:text-gray-400 font-bold py-3 rounded-lg text-sm transition-colors cursor-pointer"
                        >
                            {actionLoading === "reject" ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} Rejeter
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}