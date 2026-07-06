"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Lock, Eye, EyeOff, ShieldCheck, Scale, Fingerprint } from "lucide-react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react"; 

export default function Register() {
    const [showPassword, setShowPassword] = useState(false);
    const [password, setPassword] = useState("");
    const [fullName, setFullName] = useState("");
    const [companyName, setCompanyName] = useState("");
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const correctLength = password.length >= 12;
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const isValid = correctLength && hasSpecialChar;
    
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!isValid) {
            setError("Veuillez respecter les critères de mot de passe.");
            return;
        }
        
        setIsLoading(true);
        try {
            const response = await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password, fullName, companyName }),
            });
            if (response.ok) {
                router.push("/login");
            } else {
                const data = await response.json();
                setError(data.error || "Une erreur est survenue lors de l'inscription.");
            }
        } catch (err) {
            setError("Impossible de se connecter au serveur.");
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="flex h-screen w-full flex-row bg-gray-100 overflow-hidden">
            {/* Colonne Bleue */}
            <div className="hidden lg:flex flex-col w-[450px] shrink-0 h-[85%]">
                <div className="flex flex-col w-full h-full items-start justify-center gap-16 p-12 bg-blue-700 text-white shadow-md overflow-hidden">
                    <div className="flex flex-col gap-4 xl:gap-6 w-full">
                        <h1 className="font-bold text-white mb-4 text-3xl">TrustVerify</h1>
                        <p className="text-4xl leading-tight font-bold mt-4"><b>Secure identity verification for global enterprises</b></p>
                        <p className="text-sm text-blue-100 leading-relaxed max-w-sm">Automate your KYC/AML workflows with 99.9% accuracy and absolute compliance confidence</p>
                    </div>
                    <div className="flex flex-col gap-4 xl:gap-6 w-full">
                        <div className="flex flex-row items-start gap-3 xl:gap-4">
                            <div className="p-3 bg-blue-600 rounded-lg shrink-0 text-xl"><ShieldCheck /></div>
                            <div className="flex flex-col gap-1">
                                <p className="flex text-sm font-bold text-white">Bank-Grade Encryption</p>
                                <p className="flex text-xs text-blue-100 max-w-xs leading-relaxed">Your data is secured with AES-256 at rest and TLS 1.3 in transit.</p>
                            </div>
                        </div>
                        <div className="flex flex-row items-start gap-3 xl:gap-4">
                            <div className="p-3 bg-blue-600 rounded-lg shrink-0 text-xl"><Scale /></div>
                            <div className="flex flex-col gap-1">
                                <p className="flex text-sm font-bold text-white">Global Compliance</p>
                                <p className="flex text-xs text-blue-100 max-w-xs leading-relaxed">Fully GDPR, SOC2, and CCPA compliant verification engines.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Formulaire */}
            <div className="flex flex-col items-center justify-center flex-1 h-full p-6 lg:p-8 overflow-y-auto">
                <div className="flex flex-col w-full max-w-md bg-white rounded-lg border border-gray-200 p-8 shadow-sm">
                    <div className="mb-6 text-center">
                        <h2 className="text-2xl font-bold text-gray-900">Create your account</h2>
                        <p className="text-sm text-gray-500 mt-1">Start your 14-day premium trial today.</p>
                    </div>

                    <div className="flex flex-col gap-3 mb-6">
                        <button 
                            type="button"
                            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                            className="flex items-center justify-center gap-3 w-full border border-gray-300 bg-white text-gray-700 py-2.5 px-4 rounded-sm hover:bg-gray-50 transition-colors text-sm font-bold cursor-pointer"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Continue with Google
                        </button>
                        <button 
                            type="button"
                            className="flex items-center justify-center gap-3 w-full border border-gray-300 bg-gray-50 text-gray-400 py-2.5 px-4 rounded-sm text-sm font-bold cursor-not-allowed group relative"
                        >
                            <Fingerprint className="w-5 h-5" />
                            Continue with Passkey
                            {/* 💡 Tooltip pour expliquer à l'utilisateur */}
                            <span className="absolute hidden group-hover:block bottom-full mb-2 w-max px-3 py-1 bg-gray-800 text-white text-xs rounded-sm shadow-md">
                                Set up your Passkey in Settings after registration
                            </span>
                        </button>
                    </div>

                    <div className="flex items-center gap-4 mb-6">
                        <div className="flex-1 h-[1px] bg-gray-200"></div>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Or register with email</p>
                        <div className="flex-1 h-[1px] bg-gray-200"></div>
                    </div>

                    {error && <div className="p-3 mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-sm">{error}</div>}

                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div className="flex flex-row gap-4">
                            <div className="flex flex-col flex-1">
                                <label className="text-sm font-bold text-gray-700 mb-1">Full Name</label>
                                <input type="text" placeholder="John Doe" className="w-full border border-gray-300 rounded-sm py-2 px-3 text-sm outline-none text-gray-900 focus:border-blue-500 transition-colors" value={fullName} onChange={(e) => setFullName(e.target.value)} required/>
                            </div>
                            <div className="flex flex-col flex-1">
                                <label className="text-sm font-bold text-gray-700 mb-1">Company Name</label>
                                <input type="text" placeholder="Acme Corp" className="w-full border border-gray-300 rounded-sm py-2 px-3 text-sm outline-none text-gray-900 focus:border-blue-500 transition-colors" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required/>
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <label className="text-sm font-bold text-gray-700 mb-1">Business Email</label>
                            <div className="flex items-center gap-2 w-full border border-gray-300 rounded-sm py-2 px-3 focus-within:border-blue-500 transition-colors bg-white">
                                <Mail className="w-4 h-4 text-gray-400 shrink-0"/>
                                <input type="email" placeholder="name@company.com" className="w-full outline-none text-sm text-gray-900 bg-transparent" value={email} onChange={(e) => setEmail(e.target.value)} required/>
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <label className="text-sm font-bold text-gray-700 mb-1">Password</label>
                            <div className="flex items-center gap-2 w-full border border-gray-300 rounded-sm py-2 px-3 focus-within:border-blue-500 transition-colors bg-white">
                                <Lock className="w-4 h-4 text-gray-400 shrink-0" />
                                <input type={showPassword ? "text" : "password"} placeholder="••••••••" className="w-full outline-none text-sm text-gray-900 bg-transparent" value={password} onChange={(e) => setPassword(e.target.value)} required/>
                                <span className="text-gray-400 cursor-pointer hover:text-gray-600 transition-colors" onClick={() => setShowPassword(!showPassword)}>
                                    {showPassword ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                                </span>
                            </div>
                            <p className={`text-xs font-medium mt-1.5 transition-colors ${password.length === 0 ? "text-gray-500" : isValid ? "text-green-600" : "text-red-500"}`}>
                                Must be at least 12 characters with 1 special symbol.
                            </p>
                        </div>
                        <button disabled={isLoading} className="w-full bg-blue-700 text-white py-2.5 px-4 rounded-sm hover:bg-blue-800 transition-colors text-sm font-bold mt-2 shadow-sm disabled:opacity-70 flex justify-center items-center" type="submit">
                            {isLoading ? "Creating Account..." : "Create Account"}
                        </button>
                        
                        <p className="text-sm text-gray-500 text-center mt-2 font-medium">Already have an account? <Link href="/login" className="text-blue-700 hover:underline font-bold">Log in</Link></p>
                    </form>
                </div>
            </div>
        </div> 
    );
}