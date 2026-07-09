"use client";

import { Pencil, User, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState, useEffect, useRef } from "react";

export default function ProfSetting() {
    const { data: session, update } = useSession();

    const [fullName, setFullName] = useState("");
    const [companyName, setCompanyName] = useState("");
    
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isSaving, setIsSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error", text: string } | null>(null);

    // 🛡️ ANALYSE DE LA HIÉRARCHIE RBAC (Phase 3)
    // Détermine si l'utilisateur possède l'autorité d'administration racine
    const isAdmin = (session?.user as any)?.role === "COMPANY_ADMIN";

    useEffect(() => {
        if (session?.user) {
            setFullName(session.user.name || "");
            setCompanyName((session.user as any).companyName || "");
            setAvatarPreview(session.user.image || null);
        }
    }, [session]);

    const handleAvatarClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) { 
                setStatusMessage({ type: "error", text: "Image is too large (Max 5MB)." });
                return;
            }
            setAvatarFile(file);
            setAvatarPreview(URL.createObjectURL(file));
            setStatusMessage(null);
        }
    };

    const handleDiscard = () => {
        if (session?.user) {
            setFullName(session.user.name || "");
            setCompanyName((session.user as any).companyName || "");
            setAvatarFile(null);
            setAvatarPreview(session.user.image || null);
            setStatusMessage(null);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        setStatusMessage(null);

        try {
            const formData = new FormData();
            formData.append("fullName", fullName);
            formData.append("companyName", companyName);
            if (avatarFile) {
                formData.append("avatar", avatarFile);
            }

            const response = await fetch("/api/settings/profile", {
                method: "POST",
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.error || "Failed to update profile");

            await update({
                ...session,
                user: {
                    ...session?.user,
                    name: data.user.fullName,
                    image: data.user.avatarUrl || session?.user?.image,
                    companyName: data.user.companyName
                }
            });

            setStatusMessage({ type: "success", text: "Profile updated successfully!" });
            
            setTimeout(() => setStatusMessage(null), 3000);
            
        } catch (error: any) {
            console.error(error);
            setStatusMessage({ type: "error", text: error.message || "An error occurred." });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex flex-col w-full bg-white rounded-sm border border-gray-400 shadow-sm">
            <div className="border-b border-gray-400 px-5 md:px-6 py-4 md:py-5 flex flex-row justify-between items-center bg-gray-50/50">
                <h3 className="text-base md:text-lg font-bold text-gray-900">Personal Information</h3>
                {statusMessage && (
                    <div className={`flex items-center gap-2 text-sm font-semibold animate-fade-in ${statusMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                        {statusMessage.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        {statusMessage.text}
                    </div>
                )}
            </div>
            
            <div className="flex flex-col p-5 md:p-6 gap-6">
                <div className="flex flex-row items-center gap-4 md:gap-5">
                    <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-xl bg-gray-200 shrink-0 border border-gray-300">
                        <div className="w-full h-full rounded-xl flex items-center justify-center bg-slate-300 overflow-hidden relative shadow-inner">
                            {avatarPreview ? (
                                <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <User className="w-8 h-8 text-gray-500" />
                            )}
                        </div>
                        <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            ref={fileInputRef} 
                            onChange={handleFileChange} 
                        />
                        <button 
                            onClick={handleAvatarClick}
                            className="absolute -bottom-1.5 -right-1.5 bg-blue-700 text-white p-1.5 rounded-full border-2 border-white hover:bg-blue-800 transition-all shadow-sm z-10 cursor-pointer hover:scale-105"
                            title="Edit picture"
                        >
                            <Pencil className="w-3 h-3 md:w-3.5 md:h-3.5" />
                        </button>
                    </div>
                    <div className="flex flex-col">
                        <p className="text-sm font-semibold text-gray-900">Profile Picture</p>
                        <p className="text-xs text-gray-500 mt-0.5">JPG, GIF or PNG. Max size of 5MB.</p>
                    </div>
                </div>

                <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-700">Full Name</label>
                        <input 
                            type="text" 
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 transition-colors" 
                        />
                    </div>
                    
                    {/* 💡 CHAMP DYNAMIQUE SÉCURISÉ PAR RÔLE */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-700">
                            Organization {!isAdmin && "(Read-only)"}
                        </label>
                        <input 
                            type="text" 
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            disabled={!isAdmin}
                            className={`w-full border rounded-sm px-3 py-2 text-sm outline-none transition-colors ${
                                !isAdmin 
                                    ? "border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed focus:border-gray-200" 
                                    : "border-gray-300 text-gray-900 focus:border-blue-500"
                            }`}
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-1.5 opacity-70">
                    <label className="text-xs font-semibold text-gray-700">Email Address (Read-only)</label>
                    <input 
                        type="email" 
                        value={session?.user?.email || ""} 
                        disabled
                        className="w-full border border-gray-200 bg-gray-50 rounded-sm px-3 py-2 text-sm text-gray-500 outline-none cursor-not-allowed" 
                    />
                </div>

                <div className="flex flex-row justify-end items-center gap-4 mt-2 border-t border-gray-100 pt-5">
                    <button 
                        onClick={handleDiscard}
                        disabled={isSaving}
                        className="text-sm font-bold bg-white text-gray-500 px-5 py-2.5 rounded-sm hover:bg-gray-200 transition-colors cursor-pointer disabled:opacity-50"
                    >
                        Discard
                    </button>
                    <button 
                        onClick={handleSave}
                        disabled={isSaving || !fullName}
                        className="text-sm font-bold flex items-center justify-center gap-2 bg-blue-700 text-white min-w-[140px] px-5 py-2.5 rounded-sm hover:bg-blue-800 transition-colors shadow-sm cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
                    </button>
                </div>
            </div>
        </div>
    );
}