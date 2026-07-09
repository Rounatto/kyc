"use client";

import { Smartphone, LogOut, Laptop, ShieldCheck, KeyRound, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, Lock, Fingerprint, X } from "lucide-react";
import { signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { startRegistration } from "@simplewebauthn/browser"; 

export default function SecurSetting() {
    // --- ÉTATS MOT DE PASSE ---
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // --- ÉTATS PASSKEY ---
    const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
    const [passkeyStatus, setPasskeyStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // --- ÉTATS SESSIONS ---
    const [sessions, setSessions] = useState<any[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(true);

    // 💡 NOUVEAUX ÉTATS POUR LE 2FA (TOTP)
    const [is2faModalOpen, setIs2faModalOpen] = useState(false);
    const [qrCodeUrl, setQrCodeUrl] = useState("");
    const [totpSecret, setTotpSecret] = useState("");
    const [totpCodeInput, setTotpCodeInput] = useState("");
    const [is2faLoading, setIs2faLoading] = useState(false);
    const [is2faEnabled, setIs2faEnabled] = useState(false); 
    const [totpStatus, setTotpStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // LOGIQUE DE VALIDATION EN TEMPS RÉEL (Mot de passe)
    const correctLength = newPassword.length >= 12;
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);
    const isValid = correctLength && hasSpecialChar;

    useEffect(() => {
        async function fetchSessions() {
            try {
                const res = await fetch("/api/settings/security/sessions");
                if (res.ok) {
                    const data = await res.json();
                    setSessions(data.sessions || []);
                }
            } catch (error) {
                console.error("Failed to load device sessions:", error);
            } finally {
                setSessionsLoading(false);
            }
        }
        fetchSessions();
    }, []);

    const handlePasswordUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordStatus(null);

        if (!isValid) {
            setPasswordStatus({ type: "error", text: "Please meet all password requirements." });
            return;
        }

        if (newPassword !== confirmPassword) {
            setPasswordStatus({ type: "error", text: "The new passwords do not match." });
            return;
        }

        setPasswordLoading(true);

        try {
            const res = await fetch("/api/settings/security/password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "An error occurred");

            setPasswordStatus({ type: "success", text: "Password successfully updated!" });
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            
            setTimeout(() => setPasswordStatus(null), 4000);
        } catch (error: any) {
            setPasswordStatus({ type: "error", text: error.message });
        } finally {
            setPasswordLoading(false);
        }
    };

    const handleRegisterPasskey = async () => {
        setPasskeyStatus(null);
        setIsPasskeyLoading(true);

        try {
            const resp = await fetch("/api/settings/security/passkey/generate");
            if (!resp.ok) {
                const errorData = await resp.json();
                throw new Error(errorData.error || "Failed to start passkey registration.");
            }
            const options = await resp.json();

            let attResp;
            try {
                attResp = await startRegistration(options);
            } catch (error: any) {
                if (error.name === "NotAllowedError") {
                    throw new Error("Registration cancelled by user.");
                }
                throw new Error("Biometric sensor error. Please try again.");
            }

            const verificationResp = await fetch("/api/settings/security/passkey/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(attResp),
            });

            if (!verificationResp.ok) {
                const errorData = await verificationResp.json();
                throw new Error(errorData.error || "Failed to verify and save passkey.");
            }

            setPasskeyStatus({ type: "success", text: "Passkey successfully registered! You can now use it to log in." });
            setTimeout(() => setPasskeyStatus(null), 5000);

        } catch (error: any) {
            setPasskeyStatus({ type: "error", text: error.message });
        } finally {
            setIsPasskeyLoading(false);
        }
    };

    const handleRevokeSession = async (sessionId: string) => {
        try {
            const res = await fetch("/api/settings/security/sessions", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId }),
            });

            if (res.ok) {
                setSessions((prev) => prev.filter((s) => s.id !== sessionId));
            }
        } catch (error) {
            console.error("Failed to revoke device session:", error);
        }
    };

    // 💡 LOGIQUE 2FA : DEMANDER LE QR CODE AU SERVEUR
    const handleStart2faSetup = async () => {
        setIs2faLoading(true);
        setTotpStatus(null);
        try {
            const res = await fetch("/api/settings/security/totp/generate", { method: "POST" });
            if (!res.ok) throw new Error("Failed to generate 2FA secret");
            const data = await res.json();
            
            setQrCodeUrl(data.qrCodeUrl);
            setTotpSecret(data.secret);
            setIs2faModalOpen(true);
        } catch (error: any) {
            console.error(error);
        } finally {
            setIs2faLoading(false);
        }
    };

    // 💡 LOGIQUE 2FA : VÉRIFIER LE CODE TAPÉ PAR L'UTILISATEUR
    const handleVerify2fa = async () => {
        setIs2faLoading(true);
        setTotpStatus(null);
        try {
            const res = await fetch("/api/settings/security/totp/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: totpCodeInput, secret: totpSecret })
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Invalid verification code");

            setIs2faEnabled(true);
            setIs2faModalOpen(false);
            setTotpCodeInput("");
        } catch (error: any) {
            setTotpStatus({ type: "error", text: error.message });
        } finally {
            setIs2faLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-6 w-full relative">
            
            {/* BLOC 1 : Mot de Passe */}
            <form onSubmit={handlePasswordUpdate} className="flex flex-col w-full bg-white rounded-sm border border-gray-400 shadow-sm">
                <div className="border-b border-gray-400 px-5 md:px-6 py-4 flex flex-row items-center gap-3 bg-gray-50/50">
                    <KeyRound className="w-5 h-5 text-gray-500 shrink-0" />
                    <h3 className="text-base md:text-lg font-bold text-gray-900 flex-1">Password Management</h3>
                    {passwordStatus && (
                        <div className={`flex items-center gap-1.5 text-xs font-semibold ${passwordStatus.type === "success" ? "text-green-600" : "text-red-600"}`}>
                            {passwordStatus.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                            <span className="truncate max-w-[180px] md:max-w-none">{passwordStatus.text}</span>
                        </div>
                    )}
                </div>
                <div className="flex flex-col p-5 md:p-6 gap-5">
                    <div className="flex flex-col gap-1.5 w-full md:w-1/2">
                        <label className="text-xs font-semibold text-gray-700">Current Password</label>
                        <div className="flex items-center gap-2 w-full border border-gray-300 rounded-sm py-2 px-3 focus-within:border-blue-500 bg-white transition-colors">
                            <Lock className="w-4 h-4 text-gray-400 shrink-0" />
                            <input 
                                type={showCurrentPassword ? "text" : "password"} 
                                required
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                placeholder="••••••••" 
                                className="w-full outline-none text-sm text-gray-900" 
                            />
                            <span className="cursor-pointer text-gray-400 hover:text-gray-600 shrink-0" onClick={() => setShowCurrentPassword(!showCurrentPassword)}>
                                {showCurrentPassword ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-row flex-wrap gap-4 md:gap-5 w-full">
                        <div className="flex flex-col gap-1.5 flex-1 min-w-[240px]">
                            <label className="text-xs font-semibold text-gray-700">New Password</label>
                            <div className="flex items-center gap-2 w-full border border-gray-300 rounded-sm py-2 px-3 focus-within:border-blue-500 bg-white transition-colors">
                                <Lock className="w-4 h-4 text-gray-400 shrink-0" />
                                <input 
                                    type={showNewPassword ? "text" : "password"} 
                                    required
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Min. 12 characters" 
                                    className="w-full outline-none text-sm text-gray-900" 
                                />
                                <span className="cursor-pointer text-gray-400 hover:text-gray-600 shrink-0" onClick={() => setShowNewPassword(!showNewPassword)}>
                                    {showNewPassword ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5 flex-1 min-w-[240px]">
                            <label className="text-xs font-semibold text-gray-700">Confirm New Password</label>
                            <div className="flex items-center gap-2 w-full border border-gray-300 rounded-sm py-2 px-3 focus-within:border-blue-500 bg-white transition-colors">
                                <Lock className="w-4 h-4 text-gray-400 shrink-0" />
                                <input 
                                    type={showConfirmPassword ? "text" : "password"} 
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Repeat new password" 
                                    className="w-full outline-none text-sm text-gray-900" 
                                />
                                <span className="cursor-pointer text-gray-400 hover:text-gray-600 shrink-0" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                                    {showConfirmPassword ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col w-full">
                        <p className={`text-xs font-medium transition-colors ${newPassword.length === 0 ? "text-gray-500" : isValid ? "text-green-600" : "text-red-500"}`}>
                            Must be at least 12 characters with 1 special symbol.
                        </p>
                    </div>
                    
                    <div className="flex flex-row flex-wrap justify-between items-center mt-2 pt-4 border-t border-gray-100 gap-4">
                        <p className="text-xs text-gray-500">Security Standard: <span className="font-bold text-gray-700">SHA-256 / Bcrypt</span></p>
                        <button 
                            type="submit"
                            disabled={passwordLoading || !isValid || currentPassword.length === 0}
                            className="text-sm font-bold bg-blue-700 text-white min-w-[150px] flex items-center justify-center h-10 px-5 rounded-sm hover:bg-blue-800 transition-colors shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {passwordLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update Password"}
                        </button>
                    </div>
                </div>
            </form>

            {/* BLOC 2 : Biometric Security (Passkeys) */}
            <div className="flex flex-col w-full bg-white rounded-sm border border-gray-400 shadow-sm">
                <div className="border-b border-gray-400 px-5 md:px-6 py-4 flex flex-row items-center gap-3 bg-gray-50/50">
                    <Fingerprint className="w-5 h-5 text-gray-500 shrink-0" />
                    <h3 className="text-base md:text-lg font-bold text-gray-900 flex-1">Biometric Security (Passkeys)</h3>
                    {passkeyStatus && (
                        <div className={`flex items-center gap-1.5 text-xs font-semibold ${passkeyStatus.type === "success" ? "text-green-600" : "text-red-600"}`}>
                            {passkeyStatus.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                            <span className="truncate max-w-[200px] md:max-w-none">{passkeyStatus.text}</span>
                        </div>
                    )}
                </div>
                <div className="flex flex-row flex-wrap items-center justify-between p-5 md:p-6 gap-5">
                    <div className="flex flex-col gap-1.5 flex-1 min-w-[280px]">
                        <p className="text-sm font-bold text-gray-900">Passwordless Authentication</p>
                        <p className="text-xs text-gray-500 leading-relaxed max-w-xl">
                            Register your device's fingerprint, Face ID, or Windows Hello. Once registered, you can log in instantly without typing a password. Your biometric data never leaves your device.
                        </p>
                    </div>
                    <button 
                        onClick={handleRegisterPasskey}
                        disabled={isPasskeyLoading}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 text-sm font-bold text-gray-900 bg-white border border-gray-300 px-5 h-10 rounded-sm hover:bg-gray-50 transition-colors shadow-sm shrink-0 cursor-pointer disabled:opacity-50"
                    >
                        {isPasskeyLoading ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" /> : <Fingerprint className="w-4 h-4 text-gray-600" />}
                        Add New Passkey
                    </button>
                </div>
            </div>

            {/* 💡 BLOC 3 : Authentification Double Facteur (2FA) */}
            <div className="flex flex-row flex-wrap items-center justify-between p-5 md:p-6 bg-white rounded-sm border border-gray-400 shadow-sm gap-5">
                <div className="flex flex-row gap-4 items-center flex-1 min-w-[280px]">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
                        <Smartphone className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            Two-Factor Authentication (2FA)
                            {is2faEnabled ? (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-sm uppercase border border-green-200">Enabled</span>
                            ) : (
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-sm uppercase border border-red-200">Disabled</span>
                            )}
                        </h4>
                        <p className="text-xs text-gray-500 leading-relaxed max-w-md mt-0.5">Enforce bank-grade compliance security by requiring a code from an authenticator application at login.</p>
                    </div>
                </div>
                {!is2faEnabled && (
                    <button 
                        onClick={handleStart2faSetup} 
                        disabled={is2faLoading} 
                        className="w-full sm:w-auto text-sm font-bold text-blue-700 bg-white border border-blue-700 px-5 h-10 rounded-sm hover:bg-blue-50 transition-colors shrink-0 text-center cursor-pointer disabled:opacity-50"
                    >
                        {is2faLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Configure 2FA"}
                    </button>
                )}
            </div>

            {/* BLOC 4 : Sessions Actives */}
            <div className="flex flex-col w-full bg-white rounded-sm border border-gray-400 shadow-sm">
                <div className="border-b border-gray-400 px-5 md:px-6 py-4 flex flex-row items-center gap-3 bg-gray-50/50">
                    <Laptop className="w-5 h-5 text-gray-500" />
                    <h3 className="text-base md:text-lg font-bold text-gray-900">Dynamic Active Sessions</h3>
                </div>
                <div className="flex flex-col p-5 md:p-6 gap-4">
                    <p className="text-xs text-gray-500">Below is the live registry of terminal architectures currently operating on your account. Revoke any unrecognized access lines immediately.</p>
                    
                    <div className="flex flex-col w-full divide-y divide-gray-100">
                        {sessionsLoading ? (
                            <div className="flex flex-row items-center justify-center py-6 gap-2 text-sm text-gray-500">
                                <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> Synchronizing device registry...
                            </div>
                        ) : sessions.length > 0 ? (
                            sessions.map((sess) => (
                                <div key={sess.id} className="flex flex-row items-center justify-between py-3.5 gap-4">
                                    <div className="flex flex-row items-center gap-4">
                                        <Laptop className="w-6 h-6 text-gray-400 shrink-0" />
                                        <div className="flex flex-col">
                                            <p className="text-sm font-bold text-gray-900">{sess.deviceType || "Unknown Terminal"}</p>
                                            <p className="text-xs text-green-600 font-semibold flex items-center gap-1 mt-0.5">
                                                <ShieldCheck className="w-3.5 h-3.5" /> Connected • IP: {sess.ipAddress || "127.0.0.1"}
                                            </p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => handleRevokeSession(sess.id)}
                                        className="text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200 px-3 py-1.5 rounded-sm transition-all cursor-pointer"
                                    >
                                        Revoke
                                    </button>
                                </div>
                            ))
                        ) : (
                            <div className="flex flex-row items-center justify-between py-3.5">
                                <div className="flex flex-row items-center gap-4">
                                    <Laptop className="w-6 h-6 text-gray-400 shrink-0" />
                                    <div className="flex flex-col">
                                        <p className="text-sm font-bold text-gray-900">Windows 11 Workstation (Chrome)</p>
                                        <p className="text-xs text-green-600 font-semibold flex items-center gap-1 mt-0.5">
                                            <ShieldCheck className="w-3.5 h-3.5" /> Active Session (This Device)
                                        </p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => signOut({ callbackUrl: "/login" })}
                                    className="flex flex-row items-center gap-1.5 text-xs font-bold bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-sm hover:bg-red-100 transition-colors cursor-pointer"
                                >
                                    <LogOut className="w-3.5 h-3.5" /> Secure Sign Out
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 💡 MODALE DE CONFIGURATION 2FA */}
            {is2faModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center p-4 border-b border-gray-100">
                            <h3 className="font-bold text-lg text-gray-900">Setup Authenticator App</h3>
                            <button onClick={() => setIs2faModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 flex flex-col items-center gap-6">
                            <p className="text-sm text-gray-600 text-center">
                                Scan this QR code with your authenticator app (like Google Authenticator, Authy, or 1Password).
                            </p>
                            
                            <div className="p-2 bg-white border border-gray-200 rounded-lg shadow-sm">
                                {qrCodeUrl ? (
                                    <img src={qrCodeUrl} alt="2FA QR Code" className="w-48 h-48" />
                                ) : (
                                    <div className="w-48 h-48 flex items-center justify-center bg-gray-50 text-gray-400">Loading...</div>
                                )}
                            </div>

                            <div className="w-full">
                                <label className="text-xs font-bold text-gray-700 mb-1.5 block">Enter the 6-digit code</label>
                                <input 
                                    type="text" 
                                    maxLength={6}
                                    placeholder="000000"
                                    value={totpCodeInput}
                                    onChange={(e) => setTotpCodeInput(e.target.value.replace(/[^0-9]/g, ''))}
                                    className="w-full border border-gray-300 rounded-sm py-2.5 px-3 text-center tracking-[0.5em] font-mono text-lg focus-within:border-blue-500 outline-none transition-colors"
                                />
                                {totpStatus?.type === "error" && (
                                    <p className="text-xs text-red-600 mt-2 flex items-center justify-center gap-1"><AlertCircle className="w-3 h-3"/> {totpStatus.text}</p>
                                )}
                            </div>

                            <button 
                                onClick={handleVerify2fa}
                                disabled={totpCodeInput.length !== 6 || is2faLoading}
                                className="w-full bg-blue-700 text-white font-bold py-2.5 rounded-sm hover:bg-blue-800 disabled:opacity-50 transition-colors flex justify-center items-center h-11"
                            >
                                {is2faLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify and Enable 2FA"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}