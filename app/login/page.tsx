"use client";

// ============================================================================
// 🔐 PAGE DE CONNEXION — 3 MÉTHODES (mot de passe+2FA / Google / Passkey)
// ============================================================================
// Le formulaire mot de passe est une machine à 2 états pilotée par `is2faStep` :
//   1. L'utilisateur entre email+mot de passe → `signIn("credentials", ...)`.
//   2. Si le compte a la 2FA active, NextAuth renvoie l'erreur spéciale
//      "2FA_REQUIRED" (voir [...nextauth]/route.ts) → on bascule l'UI vers le
//      champ code à 6 chiffres SANS jamais recharger la page ni perdre l'état.
// Le bouton Passkey utilise `startAuthentication` (SimpleWebAuthn browser) qui
// déclenche la boîte de dialogue native Face ID/empreinte/clé de sécurité.
//
// ⚠️ Le lien "Forgot password?" pointe vers /forgot-password, qui N'EXISTE
// PAS dans ce projet (aucune page, aucune route API de reset) — fonctionnalité
// manquante, pas juste un lien mort à corriger.
// ⚠️ L'icône d'aide (point d'interrogation, en haut à droite) a un curseur
// "pointer" mais aucun onClick — élément visuellement cliquable qui ne fait rien.
import { useState } from "react";
import Link from "next/link";
import { Eye, Mail, Lock, EyeOff, Fingerprint, CircleQuestionMark, Loader2, ArrowLeft, ShieldAlert } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import LoginBtn from "@/components/login-btn"; // ⚠️ Importé mais jamais utilisé dans ce fichier (le bouton Google est réécrit inline plus bas)
import { startAuthentication } from "@simplewebauthn/browser";

export default function Login() {
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [rememberMe, setRememberMe] = useState(false);
    const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);

    // 💡 NOUVEAUX ÉTATS POUR LE 2FA
    const [is2faStep, setIs2faStep] = useState(false);
    const [totpCode, setTotpCode] = useState("");
    const [isLoginLoading, setIsLoginLoading] = useState(false);

    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoginLoading(true);

        // On prépare la valise de données à envoyer
        const payload: any = {
            email: email,
            password: password,
            rememberMe: rememberMe.toString(),
            redirect: false,
        };

        // Si on est à l'étape 2, on ajoute le code à la valise
        if (is2faStep) {
            payload.totpCode = totpCode;
        }

        const resultat = await signIn("credentials", payload);

        setIsLoginLoading(false);

        if (resultat?.error) {
            // 💡 Le serveur demande le code ! On change l'interface.
            if (resultat.error === "2FA_REQUIRED") {
                setIs2faStep(true);
            } else if (resultat.error === "INVALID_2FA_CODE") {
                setError("Incorrect 6-digit code. Please try again.");
                setTotpCode(""); // On vide la case
            } else {
                setError("Email or password incorrect.");
            }
        } else {
            router.push("/dashboard");
        }
    };

    // ... [Logique Passkey inchangée]
    const handlePasskeyLogin = async () => {
        setError("");
        if (!email) { setError("Please enter your email to use Passkey."); return; }
        setIsPasskeyLoading(true);
        try {
            const resp = await fetch("/api/auth/passkey/generate-login", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email })
            });
            if (!resp.ok) throw new Error("No passkey found for this email. Setup in Settings first.");
            const options = await resp.json();

            let authenticationResponse;
            try { authenticationResponse = await startAuthentication(options); } 
            catch (authErr) { throw new Error("Biometric scan cancelled or failed."); }

            const resultat = await signIn("credentials", {
                email: email,
                passkeyResponse: JSON.stringify(authenticationResponse), 
                redirect: false,
            });

            if (resultat?.error) throw new Error("Security verification failed.");
            else router.push("/dashboard");
        } catch (err: any) {
            setError(err.message || "An error occurred with Passkey authentication.");
        } finally {
            setIsPasskeyLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen w-full flex-col justify-between items-center py-3 bg-gray-100">
            <div className="flex flex-row w-full justify-between items-center px-8">
                <h1 className="text-xl font-bold text-blue-700">TrustVerify</h1>
                {/* Icône d'aide statique : curseur "pointer" mais aucun onClick/href */}
                <span className="text-gray-500 cursor-pointer hover:text-gray-700 text-lg">
                    <CircleQuestionMark className="text-gray-500 w-5 h-5" />
                </span>
            </div>

            <div className="flex flex-col items-center justify-center flex-1 w-full gap-4">
                <div className="flex w-full max-w-md flex-col gap-4 rounded-md bg-white p-8 border border-gray-200 shadow-sm">
                    
                    {/* 💡 EN-TÊTE DYNAMIQUE */}
                    <div className="text-center mb-3 text-2xl font-bold">
                        {is2faStep ? (
                            <>
                                <ShieldAlert className="w-10 h-10 text-blue-700 mx-auto mb-2" />
                                <h1 className="text-2xl font-bold text-gray-900">Two-Factor Auth</h1>
                                <p className="text-sm text-gray-500 m-2">Enter the 6-digit code from your authenticator app.</p>
                            </>
                        ) : (
                            <>
                                <h1 className="text-2xl font-bold text-gray-900">Welcome Back</h1>
                                <p className="text-sm text-gray-500 m-2">Please enter your details to sign in</p>
                            </>
                        )}
                    </div>

                    <form onSubmit={handleSubmit} className="flex flex-col">
                        
                        {/* 💡 ÉTAPE 1 : EMAIL / MOT DE PASSE (Caché si étape 2) */}
                        {!is2faStep && (
                            <div className="animate-in fade-in duration-300">
                                <label className="text-sm font-bold text-gray-700 mb-1">Email address</label>
                                <div className="flex items-center gap-2 w-full border border-gray-300 rounded-sm py-2.5 px-3 mb-4 bg-white focus-within:border-blue-500 transition-colors">
                                    <span className="flex h-5 w-5 items-center justify-center text-gray-400 shrink-0"><Mail className="w-4 h-4" /></span>
                                    <input type="email" placeholder="name@company.com" className="w-full outline-none text-sm text-gray-900 bg-transparent" value={email} onChange={(e) => setEmail(e.target.value)} required />
                                </div>

                                <div className="flex flex-row items-center justify-between mb-1">
                                    <label className="text-sm font-bold text-gray-700">Password</label>
                                    {/* ⚠️ /forgot-password n'existe pas encore (voir note en tête de fichier) */}
                                    <Link href="/forgot-password" className="text-xs text-blue-700 font-bold hover:underline">Forgot password?</Link>
                                </div>
                                <div className="flex items-center gap-2 w-full border border-gray-300 rounded-sm py-2.5 px-3 mb-4 bg-white focus-within:border-blue-500 transition-colors">
                                    <span className="flex h-5 w-5 items-center justify-center text-gray-400 shrink-0"><Lock className="w-4 h-4" /></span>
                                    <input type={showPassword ? "text" : "password"} placeholder="••••••••" className="w-full outline-none text-sm text-gray-900 bg-transparent" value={password} onChange={(e) => setPassword(e.target.value)} required />
                                    <span className="text-gray-400 cursor-pointer hover:text-gray-600 transition-colors shrink-0" onClick={() => setShowPassword(!showPassword)}>
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </span>
                                </div>

                                <div className="flex items-center gap-2 mb-5">
                                    <input type="checkbox" id="remember" className="h-4 w-4 rounded-sm border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)}/>
                                    <label htmlFor="remember" className="text-sm text-gray-600 cursor-pointer">Remember for 15 days</label>
                                </div>
                            </div>
                        )}

                        {/* 💡 ÉTAPE 2 : LE CODE 2FA (Visible uniquement si requis) */}
                        {is2faStep && (
                            <div className="animate-in slide-in-from-right-4 fade-in duration-300 mb-5">
                                <input 
                                    type="text" 
                                    maxLength={6}
                                    placeholder="000000"
                                    required
                                    autoFocus
                                    value={totpCode}
                                    onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9]/g, ''))}
                                    className="w-full border border-gray-300 rounded-sm py-3 px-4 text-center tracking-[0.7em] font-mono text-2xl focus-within:border-blue-500 outline-none transition-colors"
                                />
                                <button 
                                    type="button" 
                                    onClick={() => { setIs2faStep(false); setTotpCode(""); }}
                                    className="flex items-center justify-center gap-1.5 text-xs text-gray-500 mt-4 mx-auto hover:text-gray-900 transition-colors"
                                >
                                    <ArrowLeft className="w-3 h-3" /> Back to password
                                </button>
                            </div>
                        )}

                        {error && <div className="p-3 mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-sm font-medium">{error}</div>}
                        
                        <button 
                            type="submit"
                            disabled={isLoginLoading || (is2faStep && totpCode.length !== 6)}
                            className="w-full bg-blue-700 text-white font-bold py-2.5 rounded-sm hover:bg-blue-800 disabled:opacity-50 transition-colors flex justify-center items-center"
                        >
                            {isLoginLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (is2faStep ? "Verify Code" : "Sign In")}
                        </button>

                        {!is2faStep && (
                            <>
                                <div className="flex flex-row items-center my-5 gap-3 justify-center opacity-70">
                                    <span className="flex-1 h-px bg-gray-300"></span>
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">or continue with</span>
                                    <span className="flex-1 h-px bg-gray-300"></span>
                                </div>

                                <div className="flex flex-row items-center gap-4 w-full">
                                    <button type="button" onClick={() => signIn('google', { callbackUrl: '/dashboard' })} className="flex flex-row items-center justify-center py-2 px-3 border border-gray-300 rounded-sm cursor-pointer hover:bg-gray-50 transition duration-200 w-full shadow-sm">
                                        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4c-.2 1.2-.9 2.2-1.9 2.9v2.4h3c1.8-1.6 3.1-4 3.1-7.1Z" fill="#4285F4"/><path d="M12 22c2.6 0 4.8-.9 6.4-2.4l-3-2.4c-.9.6-2 .9-3.4.9-2.6 0-4.7-1.7-5.6-4H3.3v2.5A10 10 0 0 0 12 22Z" fill="#34A853"/><path d="M6.4 13.1c-.2-.6-.4-1.3-.4-2.1s.2-1.5.4-2.1V6.4H3.3A10 10 0 0 0 2 12c0 1.6.4 3.1 1.3 4.4l3.1-3.3Z" fill="#FBBC05"/><path d="M12 5.3c1.4 0 2.7.5 3.7 1.4l2.8-2.8A10 10 0 0 0 12 2 10 10 0 0 0 3.3 6.4l3.1 2.5c.9-2.3 3-3.6 5.6-3.6Z" fill="#EA4335"/></svg>
                                        <span className="ml-2 text-sm font-bold text-gray-700">Google</span>
                                    </button>
                                    
                                    <button type="button" onClick={handlePasskeyLogin} disabled={isPasskeyLoading} className="flex items-center justify-center py-2 px-3 border border-gray-300 bg-white rounded-sm cursor-pointer hover:bg-gray-50 transition duration-200 w-full shadow-sm disabled:opacity-50">
                                        {isPasskeyLoading ? <Loader2 className="h-5 w-5 text-gray-700 animate-spin shrink-0" /> : <Fingerprint className="h-5 w-5 text-gray-700 shrink-0" />}
                                        <span className="ml-2 text-sm font-bold text-gray-700">Passkey</span>
                                    </button>
                                </div>
                            </>
                        )}

                        <div className="flex flex-row items-center justify-center gap-1.5 mt-6">
                            <p className="text-sm text-gray-600 font-medium">Don't have an account?</p>
                            <Link href="/register" className="text-sm text-blue-700 font-bold hover:underline">Create an account</Link>
                        </div>
                    </form>
                </div>
                
                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-gray-200 shadow-sm text-xs font-bold text-gray-700">
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                    All systems operational
                </div>
            </div>
            {/* Footer caché pour la concision */}
        </div>
    );
}