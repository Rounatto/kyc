"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Lock, Loader2, CheckCircle2, ShieldAlert } from "lucide-react";

function SetupAccountForm() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get("token");

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<{ type: "error" | "success", text: string } | null>(null);

    const isValid = password.length >= 12 && /[!@#$%^&*(),.?":{}|<>]/.test(password) && password === confirmPassword;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isValid) return;

        setIsLoading(true);
        setStatus(null);

        try {
            const res = await fetch("/api/auth/setup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, password }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setStatus({ type: "success", text: "Account secured successfully! Redirecting to login..." });
            setTimeout(() => router.push("/login"), 3000);
        } catch (error: any) {
            setStatus({ type: "error", text: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    if (!token) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-center gap-4">
                <ShieldAlert className="w-16 h-16 text-red-500" />
                <h2 className="text-xl font-bold text-gray-900">Security Error</h2>
                <p className="text-sm text-gray-500 max-w-sm">No security token detected. Access to this sector is strictly prohibited.</p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 w-full">
            {status && (
                <div className={`p-4 rounded-sm text-sm font-bold border flex items-center gap-2 ${status.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                    {status.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                    {status.text}
                </div>
            )}

            <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-700">Set Your Password</label>
                <div className="flex items-center gap-2 border border-gray-300 rounded-sm py-2.5 px-3 focus-within:border-blue-500 bg-white">
                    <Lock className="w-4 h-4 text-gray-400" />
                    <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 12 characters + 1 special symbol" className="w-full outline-none text-sm" />
                </div>
            </div>

            <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-700">Confirm Password</label>
                <div className="flex items-center gap-2 border border-gray-300 rounded-sm py-2.5 px-3 focus-within:border-blue-500 bg-white">
                    <Lock className="w-4 h-4 text-gray-400" />
                    <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat password" className="w-full outline-none text-sm" />
                </div>
            </div>

            <button type="submit" disabled={isLoading || !isValid} className="mt-2 w-full bg-blue-700 text-white font-bold py-3 rounded-sm hover:bg-blue-800 disabled:opacity-50 transition-colors flex justify-center items-center h-12 shadow-md">
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Secure Account & Login"}
            </button>
        </form>
    );
}

export default function SetupAccountPage() {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
            <div className="w-full max-w-md bg-white border border-gray-300 shadow-xl rounded-md overflow-hidden">
                <div className="bg-blue-900 px-6 py-8 text-center border-b border-gray-200">
                    <h1 className="text-2xl font-black text-white tracking-tight">Compliance Portal</h1>
                    <p className="text-blue-200 text-sm mt-2 font-medium">Agent Account Activation</p>
                </div>
                <div className="p-6 md:p-8">
                    <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-blue-700" /></div>}>
                        <SetupAccountForm />
                    </Suspense>
                </div>
            </div>
        </div>
    );
}