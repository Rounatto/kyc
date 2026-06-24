"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { User, Mail, Shield, CheckCircle, ArrowLeft, PlusCircle } from "lucide-react";
import Link from "next/link";
import Header from "@/components/header";

export default function NewVerificationPage() {
    const { data: session } = useSession();
    const router = useRouter();

    // Les variables d'état pour notre formulaire
    const [customerName, setCustomerName] = useState("");
    const [email, setEmail] = useState("");
    const [type, setType] = useState("Individual KYC");
    const [status, setStatus] = useState("pending");
    const [score, setScore] = useState("--");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await fetch("/api/customers", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    customerName,
                    email,
                    type,
                    status,
                    score,
                    userId: (session?.user as any)?.id,
                }),
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess(true);
                setTimeout(() => {
                    router.push("/dashboard");
                }, 1500);
            } else {
                alert(data.error || "Une erreur est survenue");
            }
        } catch (error) {
            console.error(error);
            alert("Erreur de connexion avec le serveur");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full min-h-screen bg-gray-50">
            <Header />
            
            <div className="max-w-2xl mx-auto px-4 py-8">
                <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-blue-700 font-medium mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Retour au Dashboard
                </Link>

                <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 md:p-8">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Nouvelle Vérification</h2>
                    <p className="text-sm text-gray-500 mb-8">Ajoutez un nouveau client ou une entité pour lancer le processus de vérification KYC/KYB.</p>

                    {success && (
                        <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center gap-3 text-sm font-medium">
                            <CheckCircle className="w-5 h-5 text-green-600" /> Client enregistré ! Redirection...
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                        {/* Nom du Client */}
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-gray-700">Nom Complet du Client / Entité</label>
                            <div className="relative">
                                <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input type="text" placeholder="Ex: Eleanor Lewis" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required className="w-full border border-gray-300 rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-800" />
                            </div>
                        </div>

                        {/* Email du Client */}
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-gray-700">Adresse Email</label>
                            <div className="relative">
                                <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input type="email" placeholder="Ex: e.lewis@corporate.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full border border-gray-300 rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-800" />
                            </div>
                        </div>

                        {/* Type de Vérification */}
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-gray-700">Type de Procédure</label>
                            <div className="relative">
                                <Shield className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <select value={type} onChange={(e) => setType(e.target.value)} className="w-full border border-gray-300 bg-white rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-800 cursor-pointer">
                                    <option value="Individual KYC">Individual KYC</option>
                                    <option value="Corporate KYB">Corporate KYB</option>
                                    <option value="Entity Screening">Entity Screening</option>
                                    <option value="other">Autre</option>
                                </select>
                            </div>
                        </div>

                        {/* Statut Initial & Score (Simulé pour le backoffice) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-semibold text-gray-700">Statut Initial</label>
                                <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full border border-gray-300 bg-white rounded-lg py-2.5 px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-800 cursor-pointer">
                                    <option value="pending">En attente (Pending)</option>
                                    <option value="verified">Vérifié (Verified)</option>
                                    <option value="rejected">Rejeté (Rejected)</option>
                                </select>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-semibold text-gray-700">Score de conformité (Optionnel)</label>
                                <input type="text" placeholder="Ex: 94/100 ou --" value={score} onChange={(e) => setScore(e.target.value)} className="w-full border border-gray-300 rounded-lg py-2.5 px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-800" />
                            </div>
                        </div>

                        {/* Bouton de soumission */}
                        <button type="submit" disabled={loading} className="mt-4 flex items-center justify-center gap-2 w-full px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg shadow-sm transition-colors disabled:bg-blue-400 cursor-pointer text-sm">
                            <PlusCircle className="w-4 h-4" />
                            {loading ? "Création en cours..." : "Lancer la vérification"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}