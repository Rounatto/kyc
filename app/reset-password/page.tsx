"use client";

// ============================================================================
// 🆕 [PHASE B] 🔓 MOT DE PASSE OUBLIÉ — ÉTAPE 2/2 : NOUVEAU MOT DE PASSE
// ============================================================================
// Page atteinte via le lien reçu par email, de la forme :
//     /reset-password?token=<64 caractères hexadécimaux>
// Le jeton transite dans l'URL — c'est le standard universel de ce flux
// (GitHub, Stripe font pareil), sécurisé par sa durée de vie très courte
// (30 minutes) et son usage unique.
//
// ⚠️ CONTRAINTE TECHNIQUE NEXT.JS À CONNAÎTRE :
// `useSearchParams()` force le rendu dynamique du composant qui l'utilise. Si
// on l'appelait directement dans le composant exporté par défaut, le BUILD
// ÉCHOUERAIT avec l'erreur :
//     "useSearchParams() should be wrapped in a suspense boundary"
//
// La parade, appliquée ici : isoler la logique dans un sous-composant
// (`ResetPasswordForm`) et l'envelopper dans un <Suspense> au niveau de
// l'export par défaut. Next.js peut alors pré-rendre la coquille de la page
// statiquement, et ne charger dynamiquement que la partie qui lit l'URL.
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Eye, EyeOff, Loader2, ArrowLeft, ShieldAlert } from "lucide-react";

// Doit correspondre EXACTEMENT au schéma Zod de app/api/auth/reset-password.
// Cette validation côté client n'est qu'un confort d'interface (retour
// immédiat, sans aller-retour réseau) : le serveur revalide systématiquement.
// Une vérification côté client seule ne protège rien — un appel direct à l'API
// la contournerait en une seconde.
const MIN_PASSWORD_LENGTH = 12;

function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Lecture du jeton dans l'URL. `?? ""` évite d'avoir à gérer le type
    // `string | null` partout ensuite.
    const token = searchParams.get("token") ?? "";

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        // ====================================================================
        // VALIDATIONS CÔTÉ CLIENT — confort d'interface uniquement
        // ====================================================================
        // 💡 La confirmation du mot de passe n'existe QUE côté client, et c'est
        // normal : le serveur n'en a aucun besoin. Son unique rôle est d'éviter
        // qu'un utilisateur ne se verrouille dehors à cause d'une faute de
        // frappe — puisqu'il ne verra jamais ce qu'il vient de taper.
        if (password.length < MIN_PASSWORD_LENGTH) {
            setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setIsLoading(true);

        try {
            const res = await fetch("/api/auth/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, password }),
            });

            const data = await res.json().catch(() => ({} as any));

            if (!res.ok) {
                // 💡 On réutilise le message renvoyé par le serveur plutôt que
                // d'en inventer un. Il est déjà pensé pour ne rien révéler : un
                // message unique couvre "jeton inexistant", "expiré" et "déjà
                // utilisé", car ces trois cas appellent la même action de la part
                // de l'utilisateur (redemander un lien) et distinguer les trois
                // ne renseignerait qu'un attaquant.
                setError(data.error || "Une erreur est survenue. Veuillez réessayer.");
                return;
            }

            setIsSuccess(true);

            // 🔒 On redirige vers /login, PAS vers le dashboard : le changement
            // de mot de passe ne connecte pas automatiquement l'utilisateur.
            //
            // C'est délibéré et important. Si le compte a la 2FA activée, il
            // devra fournir son code d'authenticator au login — ce qui garantit
            // que quelqu'un ayant compromis la boîte mail NE PEUT PAS prendre le
            // compte avec le seul lien de réinitialisation. Connecter
            // directement ici reviendrait à créer un contournement de la 2FA.
            //
            // Le délai de 2,5 s laisse le temps de lire le message de succès.
            setTimeout(() => router.push("/login"), 2500);

        } catch (err) {
            setError("Impossible de contacter le serveur. Vérifiez votre connexion.");
        } finally {
            setIsLoading(false);
        }
    };

    // ========================================================================
    // CAS 1 — AUCUN JETON DANS L'URL
    // ========================================================================
    // Quelqu'un a ouvert /reset-password directement, ou le lien de l'email a
    // été tronqué (certains clients mail coupent les URLs longues). Inutile
    // d'afficher un formulaire qui échouera à coup sûr : on l'explique et on
    // renvoie vers la demande d'un nouveau lien.
    if (!token) {
        return (
            <div className="flex w-full max-w-md flex-col gap-4 rounded-md bg-white p-8 border border-gray-200 shadow-sm">
                <div className="text-center py-4">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                        <ShieldAlert className="w-7 h-7 text-red-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Link</h1>
                    <p className="text-sm text-gray-500 mb-6">
                        This password reset link is incomplete or malformed.
                        Please request a new one.
                    </p>
                    <Link
                        href="/forgot-password"
                        className="inline-block w-full bg-blue-700 text-white font-bold py-2.5 rounded-sm hover:bg-blue-800 transition-colors"
                    >
                        Request a New Link
                    </Link>
                </div>
            </div>
        );
    }

    // ========================================================================
    // CAS 2 — SUCCÈS
    // ========================================================================
    if (isSuccess) {
        return (
            <div className="flex w-full max-w-md flex-col gap-4 rounded-md bg-white p-8 border border-gray-200 shadow-sm">
                <div className="text-center py-4 animate-in fade-in duration-300">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
                        <Lock className="w-7 h-7 text-green-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Password Updated</h1>
                    <p className="text-sm text-gray-500 mb-6">
                        Your password has been reset successfully.
                        Redirecting you to sign in...
                    </p>
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" />
                </div>
            </div>
        );
    }

    // ========================================================================
    // CAS 3 — LE FORMULAIRE
    // ========================================================================
    return (
        <div className="flex w-full max-w-md flex-col gap-4 rounded-md bg-white p-8 border border-gray-200 shadow-sm">
            <div className="text-center mb-3">
                <ShieldAlert className="w-10 h-10 text-blue-700 mx-auto mb-2" />
                <h1 className="text-2xl font-bold text-gray-900">Set a New Password</h1>
                <p className="text-sm text-gray-500 m-2">
                    Choose a strong password of at least {MIN_PASSWORD_LENGTH} characters.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col">
                <label className="text-sm font-bold text-gray-700 mb-1">New password</label>
                <div className="flex items-center gap-2 w-full border border-gray-300 rounded-sm py-2.5 px-3 mb-4 bg-white focus-within:border-blue-500 transition-colors">
                    <span className="flex h-5 w-5 items-center justify-center text-gray-400 shrink-0">
                        <Lock className="w-4 h-4" />
                    </span>
                    <input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••••••"
                        className="w-full outline-none text-sm text-gray-900 bg-transparent"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoFocus
                    />
                    {/* 💡 Un seul bouton d'affichage pilote LES DEUX champs :
                        cacher l'un et montrer l'autre n'aurait aucun sens. */}
                    <span
                        className="text-gray-400 cursor-pointer hover:text-gray-600 transition-colors shrink-0"
                        onClick={() => setShowPassword(!showPassword)}
                    >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </span>
                </div>

                <label className="text-sm font-bold text-gray-700 mb-1">Confirm password</label>
                <div className="flex items-center gap-2 w-full border border-gray-300 rounded-sm py-2.5 px-3 mb-4 bg-white focus-within:border-blue-500 transition-colors">
                    <span className="flex h-5 w-5 items-center justify-center text-gray-400 shrink-0">
                        <Lock className="w-4 h-4" />
                    </span>
                    <input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••••••"
                        className="w-full outline-none text-sm text-gray-900 bg-transparent"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                    />
                </div>

                {error && (
                    <div className="p-3 mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-sm font-medium">
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={isLoading || !password || !confirmPassword}
                    className="w-full bg-blue-700 text-white font-bold py-2.5 rounded-sm hover:bg-blue-800 disabled:opacity-50 transition-colors flex justify-center items-center"
                >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Reset Password"}
                </button>
            </form>

            <div className="flex flex-row items-center justify-center gap-1.5 mt-2">
                <Link
                    href="/login"
                    className="flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium"
                >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
                </Link>
            </div>
        </div>
    );
}

// ============================================================================
// COMPOSANT EXPORTÉ — LA COQUILLE STATIQUE + LA FRONTIÈRE SUSPENSE
// ============================================================================
// C'est ici que se joue la contrainte Next.js expliquée en tête de fichier.
// `ResetPasswordForm` utilise useSearchParams() et ne peut donc pas être
// pré-rendu statiquement. En l'enveloppant dans <Suspense>, on autorise Next.js
// à générer la mise en page (en-tête, fond, badge) au build, et à n'attendre
// que la partie dynamique au chargement.
//
// Le `fallback` s'affiche pendant cette fraction de seconde : un bloc de la
// même taille que le formulaire, pour éviter que la page ne "saute"
// visuellement au moment où le contenu réel apparaît.
export default function ResetPassword() {
    return (
        <div className="flex min-h-screen w-full flex-col justify-between items-center py-3 bg-gray-100">
            <div className="flex flex-row w-full justify-between items-center px-8">
                <h1 className="text-xl font-bold text-blue-700">TrustVerify</h1>
            </div>

            <div className="flex flex-col items-center justify-center flex-1 w-full gap-4">
                <Suspense
                    fallback={
                        <div className="flex w-full max-w-md items-center justify-center rounded-md bg-white p-8 border border-gray-200 shadow-sm min-h-[380px]">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                    }
                >
                    <ResetPasswordForm />
                </Suspense>

                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-gray-200 shadow-sm text-xs font-bold text-gray-700">
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                    All systems operational
                </div>
            </div>
        </div>
    );
}