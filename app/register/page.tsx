"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Lock, Eye, EyeOff, ShieldCheck, Scale, Loader2, ArrowRight, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react"; 

export default function Register() {
    // État du flux (Step-based UI)
    const [step, setStep] = useState<"REGISTER" | "OTP">("REGISTER");
    
    // États du formulaire
    const [showPassword, setShowPassword] = useState(false);
    const [password, setPassword] = useState("");
    const [fullName, setFullName] = useState("");
    const [companyName, setCompanyName] = useState("");
    const [email, setEmail] = useState("");
    const [otpCode, setOtpCode] = useState("");
    
    // États de contrôle
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    // Validation Password
    const correctLength = password.length >= 12;
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const isValidPassword = correctLength && hasSpecialChar;

    // ÉTAPE 1 : Envoi de la demande d'inscription (Génération OTP)
    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        if (!isValidPassword) return setError("Le mot de passe doit faire 12 caractères et contenir un symbole spécial.");
        
        setIsLoading(true);
        try {
            const response = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password, fullName, companyName }),
            });
            const data = await response.json();
            
            if (response.ok) {
                setStep("OTP"); // Bascule vers la saisie du code
            } else {
                setError(data.error || "Une erreur est survenue.");
            }
        } catch { setError("Serveur indisponible."); }
        finally { setIsLoading(false); }
    }

    // ÉTAPE 2 : Validation OTP et Finalisation Inscription
    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);
        try {
            const response = await fetch("/api/auth/verify-register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password, fullName, companyName, otpCode }),
            });
            const data = await response.json();
            
            if (response.ok) {
                router.push("/login"); // Succès : redirection vers connexion
            } else {
                setError(data.error || "Code invalide.");
            }
        } catch { setError("Erreur de connexion lors de la vérification."); }
        finally { setIsLoading(false); }
    }

    return (
        <div className="flex h-screen w-full flex-row bg-gray-100 overflow-hidden font-sans">
            {/* Colonne Design */}
            <div className="hidden lg:flex flex-col w-[450px] shrink-0 h-[85%]">
                <div className="flex flex-col w-full h-full items-start justify-center gap-16 p-12 bg-blue-700 text-white shadow-md overflow-hidden">
                    <h1 className="font-bold text-white text-3xl">TrustVerify</h1>
                    <div className="flex flex-col gap-8">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-blue-600 rounded-lg"><ShieldCheck /></div>
                            <div><p className="font-bold text-sm">Bank-Grade Security</p><p className="text-xs text-blue-100">AES-256 at rest, TLS 1.3 in transit.</p></div>
                        </div>
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-blue-600 rounded-lg"><Scale /></div>
                            <div><p className="font-bold text-sm">Full Compliance</p><p className="text-xs text-blue-100">GDPR, SOC2, and CCPA compliant.</p></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Formulaire Dynamique */}
            <div className="flex flex-col items-center justify-center flex-1 h-full p-6">
                <div className="flex flex-col w-full max-w-md bg-white rounded-lg border border-gray-200 p-8 shadow-sm">
                    
                    {step === "REGISTER" ? (
                        <>
                            <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Create your account</h2>
                            {error && <div className="p-3 mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-sm">{error}</div>}
                            <form onSubmit={handleRegister} className="flex flex-col gap-4">
                                <div className="flex gap-4">
                                    <input className="w-full border p-2 text-sm rounded-sm focus:border-blue-500 outline-none" placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                                    <input className="w-full border p-2 text-sm rounded-sm focus:border-blue-500 outline-none" placeholder="Company Name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
                                </div>
                                <input type="email" className="w-full border p-2 text-sm rounded-sm focus:border-blue-500 outline-none" placeholder="Business Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                                <div className="relative border p-2 rounded-sm flex items-center focus-within:border-blue-500">
                                    <input type={showPassword ? "text" : "password"} className="w-full text-sm outline-none" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                                    <span onClick={() => setShowPassword(!showPassword)} className="cursor-pointer text-gray-400 hover:text-gray-600">
                                        {showPassword ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                                    </span>
                                </div>
                                <button disabled={isLoading} className="w-full bg-blue-700 text-white py-2 font-bold rounded-sm hover:bg-blue-800 transition-colors flex justify-center items-center" type="submit">
                                    {isLoading ? <Loader2 className="animate-spin"/> : "Continue to Verification"}
                                </button>
                            </form>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 mb-6 cursor-pointer text-gray-500 hover:text-gray-800" onClick={() => setStep("REGISTER")}>
                                <ArrowLeft className="w-4 h-4" /> <span className="text-xs font-bold uppercase tracking-wider">Back</span>
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Verification Required</h2>
                            <p className="text-sm text-gray-500 mb-6 text-center">We've sent a 6-digit code to <strong className="text-gray-900">{email}</strong>.</p>
                            {error && <div className="p-3 mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-sm">{error}</div>}
                            <form onSubmit={handleVerify} className="flex flex-col gap-4">
                                <input maxLength={6} className="w-full border p-4 text-center text-3xl tracking-[0.5em] font-bold rounded-sm focus:border-blue-500 outline-none" placeholder="000000" value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))} required />
                                <button disabled={isLoading} className="w-full bg-green-600 text-white py-3 font-bold rounded-sm hover:bg-green-700 transition-colors flex justify-center gap-2" type="submit">
                                    {isLoading ? <Loader2 className="animate-spin"/> : <>Verify & Create Account <ArrowRight className="w-5 h-5"/></>}
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div> 
    );
}