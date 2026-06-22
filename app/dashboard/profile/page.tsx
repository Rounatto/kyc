"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { User, Building, Mail, Upload, Save, ArrowLeft, CheckCircle } from "lucide-react";
import Link from "next/link";
import Header from "@/components/header";

export default function ProfilePage() {
    const { data: session, update } = useSession(); 
    
    const [fullName, setFullName] = useState("");
    const [companyName, setCompanyName] = useState(""); // Notre state pour l'input
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");

    // 1. Au chargement, on remplit ENFIN l'input avec la vraie valeur de la session
    useEffect(() => {
        if (session?.user) {
            setFullName(session.user.name || "");
            setCompanyName((session.user as any).companyName || ""); // Lecture magique ici !
            setPreviewUrl(session.user.image || "");
        }
    }, [session]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setAvatarFile(file);
            setPreviewUrl(URL.createObjectURL(file)); 
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setSuccessMessage("");

        try {
            const formData = new FormData();
            formData.append("email", session?.user?.email || "");
            formData.append("fullName", fullName);
            formData.append("companyName", companyName);
            if (avatarFile) {
                formData.append("avatar", avatarFile);
            }

            const response = await fetch("/api/profile", {
                method: "POST",
                body: formData, 
            });

            const data = await response.json();

            if (response.ok) {
                setSuccessMessage("Profil mis à jour avec succès !");
                
                // 2. On transmet le nouveau nom d'entreprise à NextAuth pour la mise à jour en direct
                await update({
                    ...session,
                    user: {
                        ...session?.user,
                        name: data.user.fullName,
                        image: data.user.avatarUrl || session?.user?.image,
                        companyName: data.user.companyName // Synchro instantanée !
                    }
                });
            } else {
                alert(data.error || "Une erreur est survenue.");
            }
        } catch (error) {
            console.error(error);
            alert("Erreur lors de la mise à jour.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full min-h-screen bg-gray-50">
            <Header />
            
            <div className="max-w-3xl mx-auto px-4 py-8">
                <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-blue-700 font-medium mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Retour au Dashboard
                </Link>

                <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 md:p-8">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Gestion du Profil</h2>
                    <p className="text-sm text-gray-500 mb-8">Mettez à jour vos informations de compte et votre avatar de sécurité KYC.</p>

                    {successMessage && (
                        <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center gap-3 text-sm font-medium">
                            <CheckCircle className="w-5 h-5 text-green-600" /> {successMessage}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                        <div className="flex flex-col sm:flex-row items-center gap-6 pb-6 border-b border-gray-100">
                            <div className="w-20 h-20 bg-blue-100 rounded-2xl border border-gray-200 overflow-hidden flex items-center justify-center text-blue-700 font-bold text-2xl shadow-inner relative">
                                {previewUrl ? (
                                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                    <span>{fullName.charAt(0).toUpperCase()}</span>
                                )}
                            </div>
                            <div className="flex flex-col gap-2 w-full sm:w-auto">
                                <label className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer shadow-sm transition-colors">
                                    <Upload className="w-4 h-4 text-gray-500" />
                                    Choisir une photo
                                    <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                                </label>
                                <p className="text-xs text-gray-400 text-center sm:text-left">PNG, JPG (Max 5Mo). Optionnel.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-semibold text-gray-700">Nom Complet</label>
                                <div className="relative">
                                    <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="w-full border border-gray-300 rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-800" />
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-semibold text-gray-700">Nom de l'Entreprise</label>
                                <div className="relative">
                                    <Building className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required className="w-full border border-gray-300 rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-800" />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 opacity-60">
                            <label className="text-sm font-semibold text-gray-700">Adresse Email (Non modifiable)</label>
                            <div className="relative">
                                <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input type="email" value={session?.user?.email || ""} disabled className="w-full border border-gray-300 bg-gray-100 rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none text-gray-500 cursor-not-allowed" />
                            </div>
                        </div>

                        <button type="submit" disabled={loading} className="mt-4 flex items-center justify-center gap-2 w-full sm:w-fit sm:self-end px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg shadow-sm transition-colors disabled:bg-blue-400 cursor-pointer text-sm">
                            <Save className="w-4 h-4" />
                            {loading ? "Enregistrement..." : "Sauvegarder les modifications"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}