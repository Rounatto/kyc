"use client";

// ============================================================================
// 📝 PAGE D'INSCRIPTION — MACHINE À 2 ÉTATS (form → otp → success)
// ============================================================================
// Reflète le flux serveur en 2 routes (voir Lot 2) : `step === "form"` appelle
// POST /api/register (envoie l'OTP par email, ne crée rien), `step === "otp"`
// appelle POST /api/auth/verify-register (crée réellement l'entreprise+admin).
// Toutes les infos du formulaire (email, password, fullName, companyName)
// sont RENVOYÉES intégralement à l'étape 2 (gardées en state React) — le
// serveur ne les mémorise pas entre les deux appels, donc le client doit les
// reposter avec le code OTP.
// `handleResendOtp` republie simplement sur /api/register (qui fait un upsert
// sur l'email en base) avec un cooldown de 30s côté client pour limiter le spam.
//
// Bouton "Continue with Passkey" volontairement désactivé (`cursor-not-allowed`
// + tooltip) : à la différence des boutons morts d'autres pages, celui-ci est
// un choix UX assumé — on ne peut pas enregistrer une passkey avant d'avoir un
// compte, donc l'action n'a de sens qu'après l'inscription (dans Settings).
import { useState, useEffect } from "react";
import Link from "next/link";
import { Mail, Lock, Eye, EyeOff, ShieldCheck, Scale, Fingerprint, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function Register() {
    const [step, setStep] = useState<"form" | "otp">("form");

    const [showPassword, setShowPassword] = useState(false);
    const [password, setPassword] = useState("");
    const [fullName, setFullName] = useState("");
    const [companyName, setCompanyName] = useState("");
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // 🛡️ NOUVEAU : ÉTAPE 2 - VÉRIFICATION OTP (branché sur /api/auth/verify-register)
    const [otpCode, setOtpCode] = useState("");
    const [isVerifying, setIsVerifying] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const [success, setSuccess] = useState(false);

    const correctLength = password.length >= 12;
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const isValid = correctLength && hasSpecialChar;

    const router = useRouter();

    // Décompte du cooldown pour le renvoi de code (anti-spam côté client)
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const timer = setInterval(() => {
            setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, [resendCooldown]);

    // ÉTAPE 1 : Envoie les infos du formulaire, déclenche l'envoi de l'OTP par email
    const handleRegisterSubmit = async () => {
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
            const data = await response.json().catch(() => ({}));

            if (response.ok) {
                setStep("otp");
                setResendCooldown(30);
            } else {
                setError(data.error || "Une erreur est survenue lors de l'inscription.");
            }
        } catch (err) {
            setError("Impossible de se connecter au serveur.");
        } finally {
            setIsLoading(false);
        }
    };

    // ÉTAPE 2 : Envoie le code OTP + les infos conservées en mémoire pour créer le compte
    const handleVerifyOtp = async () => {
        setError("");

        if (otpCode.length !== 6) {
            setError("Veuillez entrer les 6 chiffres du code.");
            return;
        }

        setIsVerifying(true);
        try {
            const response = await fetch("/api/auth/verify-register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password, fullName, companyName, otpCode }),
            });
            const data = await response.json().catch(() => ({}));

            if (response.ok) {
                setSuccess(true);
                setTimeout(() => router.push("/login"), 2000);
            } else {
                setError(data.error || "Code de vérification invalide.");
                setOtpCode("");
            }
        } catch (err) {
            setError("Impossible de se connecter au serveur.");
        } finally {
            setIsVerifying(false);
        }
    };

    // Renvoie un nouveau code (le backend fait un upsert sur l'email, donc ça écrase l'ancien)
    const handleResendOtp = async () => {
        if (resendCooldown > 0 || isResending) return;

        setError("");
        setIsResending(true);
        try {
            const response = await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password, fullName, companyName }),
            });
            const data = await response.json().catch(() => ({}));

            if (response.ok) {
                setOtpCode("");
                setResendCooldown(30);
            } else {
                setError(data.error || "Impossible de renvoyer le code.");
            }
        } catch (err) {
            setError("Impossible de se connecter au serveur.");
        } finally {
            setIsResending(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (step === "form") {
            handleRegisterSubmit();
        } else {
            handleVerifyOtp();
        }
    };

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
                        {success ? (
                            <>
                                <h2 className="text-2xl font-bold text-gray-900">You&apos;re all set!</h2>
                                <p className="text-sm text-gray-500 mt-1">Your workspace has been created successfully.</p>
                            </>
                        ) : step === "form" ? (
                            <>
                                <h2 className="text-2xl font-bold text-gray-900">Create your account</h2>
                                <p className="text-sm text-gray-500 mt-1">Start your 14-day premium trial today.</p>
                            </>
                        ) : (
                            <>
                                <h2 className="text-2xl font-bold text-gray-900">Verify your email</h2>
                                <p className="text-sm text-gray-500 mt-1">Enter the 6-digit code sent to <span className="font-bold text-gray-700">{email}</span></p>
                            </>
                        )}
                    </div>

                    {step === "form" && (
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
                    )}

                    {step === "form" && (
                        <div className="flex items-center gap-4 mb-6">
                            <div className="flex-1 h-[1px] bg-gray-200"></div>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Or register with email</p>
                            <div className="flex-1 h-[1px] bg-gray-200"></div>
                        </div>
                    )}

                    {success ? (
                        <div className="p-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-sm font-bold flex items-center gap-2 justify-center">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            Redirecting you to login...
                        </div>
                    ) : (
                        <>
                            {error && <div className="p-3 mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-sm">{error}</div>}

                            <form onSubmit={handleSubmit}>
                                {step === "form" ? (
                                    <div className="flex flex-col gap-4 animate-in fade-in duration-300">
                                        <div className="flex flex-row gap-4">
                                            <div className="flex flex-col flex-1">
                                                <label className="text-sm font-bold text-gray-700 mb-1">Full Name</label>
                                                <input type="text" placeholder="John Doe" className="w-full border border-gray-300 rounded-sm py-2 px-3 text-sm outline-none text-gray-900 focus:border-blue-500 transition-colors" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                                            </div>
                                            <div className="flex flex-col flex-1">
                                                <label className="text-sm font-bold text-gray-700 mb-1">Company Name</label>
                                                <input type="text" placeholder="Acme Corp" className="w-full border border-gray-300 rounded-sm py-2 px-3 text-sm outline-none text-gray-900 focus:border-blue-500 transition-colors" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
                                            </div>
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-sm font-bold text-gray-700 mb-1">Business Email</label>
                                            <div className="flex items-center gap-2 w-full border border-gray-300 rounded-sm py-2 px-3 focus-within:border-blue-500 transition-colors bg-white">
                                                <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                                                <input type="email" placeholder="name@company.com" className="w-full outline-none text-sm text-gray-900 bg-transparent" value={email} onChange={(e) => setEmail(e.target.value)} required />
                                            </div>
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-sm font-bold text-gray-700 mb-1">Password</label>
                                            <div className="flex items-center gap-2 w-full border border-gray-300 rounded-sm py-2 px-3 focus-within:border-blue-500 transition-colors bg-white">
                                                <Lock className="w-4 h-4 text-gray-400 shrink-0" />
                                                <input type={showPassword ? "text" : "password"} placeholder="••••••••" className="w-full outline-none text-sm text-gray-900 bg-transparent" value={password} onChange={(e) => setPassword(e.target.value)} required />
                                                <span className="text-gray-400 cursor-pointer hover:text-gray-600 transition-colors" onClick={() => setShowPassword(!showPassword)}>
                                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-4 animate-in slide-in-from-right-4 fade-in duration-300">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            maxLength={6}
                                            placeholder="000000"
                                            required
                                            autoFocus
                                            value={otpCode}
                                            onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ""))}
                                            className="w-full border border-gray-300 rounded-sm py-3 px-4 text-center tracking-[0.7em] font-mono text-2xl focus-within:border-blue-500 outline-none transition-colors"
                                        />

                                        <button
                                            disabled={isVerifying || otpCode.length !== 6}
                                            className="w-full bg-blue-700 text-white py-2.5 px-4 rounded-sm hover:bg-blue-800 transition-colors text-sm font-bold shadow-sm disabled:opacity-70 flex justify-center items-center"
                                            type="submit"
                                        >
                                            {isVerifying ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify & Create Account"}
                                        </button>

                                        <div className="flex flex-row items-center justify-between mt-1">
                                            <button
                                                type="button"
                                                onClick={() => { setStep("form"); setOtpCode(""); setError(""); }}
                                                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors"
                                            >
                                                <ArrowLeft className="w-3 h-3" /> Back
                                            </button>
                                            <button
                                                type="button"
                                                disabled={resendCooldown > 0 || isResending}
                                                onClick={handleResendOtp}
                                                className="text-xs text-blue-700 font-bold hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed transition-colors"
                                            >
                                                {isResending ? "Sending..." : resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}