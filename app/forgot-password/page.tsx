"use client";

// ============================================================================
// 🆕 [PHASE B] 🔓 MOT DE PASSE OUBLIÉ — ÉTAPE 1/2 : DEMANDE DU LIEN
// ============================================================================
// C'est la page vers laquelle pointait le lien "Forgot password?" de
// app/login/page.tsx — lien qui menait jusqu'ici à une 404, faute de page.
//
// Machine à 2 états pilotée par `isSubmitted` :
//   1. Formulaire de saisie de l'email.
//   2. Message de confirmation — affiché DANS TOUS LES CAS, même si l'email
//      n'existe pas (voir la note anti-énumération plus bas).
//
// 🔒 POINT DE SÉCURITÉ CENTRAL DE CETTE PAGE : l'interface ne doit JAMAIS
// laisser deviner si un compte existe. La route /api/auth/forgot-password
// renvoie déjà une réponse générique identique dans tous les cas — cette page
// doit respecter la même règle, sinon toute la protection serveur serait
// ruinée par un simple message d'erreur côté client.
import { useState } from "react";
import Link from "next/link";
import { Mail, Loader2, ArrowLeft, CircleQuestionMark } from "lucide-react";

export default function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Bascule vers l'écran de confirmation. Une fois à true, on ne revient
    // jamais en arrière : le formulaire disparaît, ce qui évite qu'un
    // utilisateur pressé ne renvoie 5 demandes d'affilée (et ne déclenche le
    // rate limiting de 3 requêtes/heure sans comprendre pourquoi).
    const [isSubmitted, setIsSubmitted] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            const res = await fetch("/api/auth/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });

            // 🆕 Le rate limiting (3 demandes/heure par IP et par email) est le
            // SEUL cas où cette page affiche une erreur. Il faut le traiter à
            // part : un 429 n'est pas un échec de la demande, c'est un blocage
            // temporaire, et le message doit le dire clairement plutôt que de
            // laisser l'utilisateur croire que le service est cassé.
            if (res.status === 429) {
                const data = await res.json().catch(() => ({} as any));
                setError(data.error || "Trop de demandes. Veuillez patienter avant de réessayer.");
                return;
            }

            // 🔒 TOUS LES AUTRES CAS → écran de confirmation, sans exception.
            //
            // Y compris si le serveur renvoie une erreur inattendue. C'est
            // volontaire : afficher "Cet email n'existe pas" ou "Erreur d'envoi"
            // permettrait de tester des milliers d'adresses pour dresser la
            // liste des clients de la plateforme (énumération de comptes).
            // La route serveur est déjà conçue pour ne rien révéler — cette
            // page ne doit pas ouvrir la brèche qu'elle vient de fermer.
            setIsSubmitted(true);

        } catch (err) {
            // Même en cas de panne réseau, on bascule sur l'écran de
            // confirmation. Un message "erreur réseau" ne révélerait rien de
            // sensible, mais on garde le comportement uniforme par principe.
            setIsSubmitted(true);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen w-full flex-col justify-between items-center py-3 bg-gray-100">
            <div className="flex flex-row w-full justify-between items-center px-8">
                <h1 className="text-xl font-bold text-blue-700">TrustVerify</h1>
                
                <a  href="https://mail.google.com/mail/?view=cm&fs=1&to=rayan1mhalla@gmail.com&su=TrustVerify%20-%20Password%20assistance"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-500 cursor-pointer hover:text-gray-700 text-lg"
                    aria-label="Contact support"
                >
                    <CircleQuestionMark className="text-gray-500 w-5 h-5" />
                </a>
            </div>

            <div className="flex flex-col items-center justify-center flex-1 w-full gap-4">
                <div className="flex w-full max-w-md flex-col gap-4 rounded-md bg-white p-8 border border-gray-200 shadow-sm">

                    {!isSubmitted ? (
                        <>
                            <div className="text-center mb-3">
                                <h1 className="text-2xl font-bold text-gray-900">Forgot Password?</h1>
                                <p className="text-sm text-gray-500 m-2">
                                    Enter your email address and we'll send you a link to reset your password.
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="flex flex-col">
                                <label className="text-sm font-bold text-gray-700 mb-1">Email address</label>
                                <div className="flex items-center gap-2 w-full border border-gray-300 rounded-sm py-2.5 px-3 mb-4 bg-white focus-within:border-blue-500 transition-colors">
                                    <span className="flex h-5 w-5 items-center justify-center text-gray-400 shrink-0">
                                        <Mail className="w-4 h-4" />
                                    </span>
                                    <input
                                        type="email"
                                        placeholder="name@company.com"
                                        className="w-full outline-none text-sm text-gray-900 bg-transparent"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        autoFocus
                                    />
                                </div>

                                {error && (
                                    <div className="p-3 mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-sm font-medium">
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full bg-blue-700 text-white font-bold py-2.5 rounded-sm hover:bg-blue-800 disabled:opacity-50 transition-colors flex justify-center items-center"
                                >
                                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send Reset Link"}
                                </button>
                            </form>
                        </>
                    ) : (
                        // ============================================================
                        // ÉCRAN DE CONFIRMATION — affiché quel que soit le résultat
                        // ============================================================
                        // 💡 Noter la formulation au CONDITIONNEL : "If an account
                        // exists...". Elle est honnête envers l'utilisateur légitime
                        // (qui sait, lui, qu'il a bien un compte) sans jamais rien
                        // confirmer à un attaquant qui testerait des adresses au hasard.
                        // C'est exactement la même phrase que celle renvoyée par la
                        // route serveur — la cohérence est volontaire.
                        <div className="text-center py-4 animate-in fade-in duration-300">
                            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                                <Mail className="w-7 h-7 text-blue-700" />
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 mb-2">Check Your Inbox</h1>
                            <p className="text-sm text-gray-500 mb-1">
                                If an account exists for <strong className="text-gray-700">{email}</strong>,
                                a reset link has been sent.
                            </p>
                            <p className="text-xs text-gray-400 mb-6">
                                The link expires in 30 minutes and can only be used once.
                                Don't forget to check your spam folder.
                            </p>
                        </div>
                    )}

                    <div className="flex flex-row items-center justify-center gap-1.5 mt-2">
                        <Link
                            href="/login"
                            className="flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium"
                        >
                            <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
                        </Link>
                    </div>
                </div>

                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-gray-200 shadow-sm text-xs font-bold text-gray-700">
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                    All systems operational
                </div>
            </div>
        </div>
    );
}