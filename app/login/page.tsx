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
// 🆕 [PHASE B] L'étape 2FA propose désormais DEUX modes, pilotés par
// `useBackupCode` : le code à 6 chiffres de l'application d'authentification,
// ou un CODE DE SECOURS à usage unique pour l'utilisateur qui n'a plus accès à
// son téléphone. Sans cette option, perdre son appareil signifiait être
// définitivement verrouillé dehors.
//
// 💡 POURQUOI LE MOT DE PASSE EST RENVOYÉ À L'ÉTAPE 2 : le serveur ne garde
// AUCUN état entre les deux appels — il ne "se souvient" pas que le mot de
// passe était bon. C'est ce qui rend le flux "stateless" : aucune session
// temporaire à créer, à faire expirer ou à sécuriser entre les deux étapes.
// D'où le fait que `password` reste en mémoire côté client et reparte avec le
// second appel.
//
// 🆕 [PHASE B] Le serveur applique un rate limiting sur la connexion
// (10 tentatives / 15 min par IP) et sur /api/auth/passkey/generate-login
// (10 / min par IP). Cette page distingue donc un vrai échec d'authentification
// d'un simple blocage temporaire — sans quoi l'utilisateur verrait "mot de passe
// incorrect" alors que son mot de passe est bon.
import { useState } from "react";
import Link from "next/link";
import { Eye, Mail, Lock, EyeOff, Fingerprint, CircleQuestionMark, Loader2, ArrowLeft, ShieldAlert, KeyRound } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import LoginBtn from "@/components/login-btn"; // ⚠️ Importé mais jamais utilisé dans ce fichier (le bouton Google est réécrit inline plus bas)
import { startAuthentication } from "@simplewebauthn/browser";

// 🆕 [PHASE B] Longueur d'un code de secours une fois normalisé (tiret et
// espaces retirés). Doit correspondre à CODE_LENGTH dans lib/backup-codes.ts.
const BACKUP_CODE_LENGTH = 10;

export default function Login() {
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [rememberMe, setRememberMe] = useState(false);
    const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);

    // 💡 ÉTATS POUR LE 2FA
    const [is2faStep, setIs2faStep] = useState(false);
    const [totpCode, setTotpCode] = useState("");
    const [isLoginLoading, setIsLoginLoading] = useState(false);

    // 🆕 [PHASE B] Bascule entre le code à 6 chiffres et le code de secours.
    //
    // 💡 POURQUOI UN CHAMP SÉPARÉ plutôt qu'une détection automatique du format
    // ("si ça fait 6 chiffres c'est un TOTP, sinon un code de secours") : le
    // champ TOTP filtre déjà les non-chiffres et limite la saisie à 6
    // caractères — il faudrait de toute façon changer son comportement. Autant
    // être explicite : l'utilisateur qui cherche cette issue de secours la
    // trouve, au lieu de deviner qu'il peut taper autre chose.
    const [useBackupCode, setUseBackupCode] = useState(false);
    const [backupCode, setBackupCode] = useState("");

    const router = useRouter();

    // 🆕 [PHASE B] Normalisation côté client, uniquement pour activer ou non le
    // bouton de soumission. Le serveur applique EXACTEMENT la même normalisation
    // de son côté (voir normalizeBackupCode dans lib/backup-codes.ts) — celle-ci
    // n'est qu'un confort d'interface, elle ne protège rien.
    const normalizedBackupCode = backupCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const isBackupCodeComplete = normalizedBackupCode.length === BACKUP_CODE_LENGTH;

    // 🆕 [PHASE B] Bascule entre les deux modes. On vide systématiquement l'autre
    // champ et le message d'erreur : laisser un code à moitié saisi ou une
    // erreur qui concernait l'autre mode ne ferait que semer la confusion.
    const toggleBackupMode = () => {
        setUseBackupCode((prev) => !prev);
        setTotpCode("");
        setBackupCode("");
        setError("");
    };

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

        // 🆕 [PHASE B] À l'étape 2, on n'envoie QUE le champ correspondant au
        // mode actif. Envoyer les deux (dont un vide) fonctionnerait — le
        // serveur teste le code de secours en premier — mais transmettre une
        // valeur vide dans une requête d'authentification brouille la lecture
        // des logs et le débogage.
        if (is2faStep) {
            if (useBackupCode) {
                payload.backupCode = backupCode;
            } else {
                payload.totpCode = totpCode;
            }
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
            } else if (resultat.error === "INVALID_BACKUP_CODE") {
                // 🆕 [PHASE B] Message distinct de celui du code TOTP.
                //
                // 💡 La mention "usage unique" est délibérée : c'est de loin la
                // cause d'échec la plus probable. L'utilisateur ressaisit un code
                // qu'il a déjà consommé lors d'une connexion précédente, et sans
                // ce rappel il croirait le système cassé — le code est bien sur
                // sa feuille, correctement recopié, et pourtant refusé.
                setError("Invalid backup code. Each code can only be used once — try a different one from your list.");
                setBackupCode("");
            } else if (resultat.error === "TOO_MANY_ATTEMPTS") {
                // 🆕 [PHASE B] Blocage temporaire par le rate limiting serveur.
                // Sans cette branche, l'erreur tomberait dans le `else` ci-dessous
                // et afficherait "Email or password incorrect" — alors que les
                // identifiants sont peut-être parfaitement valides. L'utilisateur
                // chercherait à corriger un mot de passe qui n'a aucun problème.
                setError("Too many login attempts. Please wait a few minutes before trying again.");
            } else {
                setError("Email or password incorrect.");
            }
        } else {
            router.push("/dashboard");
        }
    };

    // ... [Logique Passkey]
    const handlePasskeyLogin = async () => {
        setError("");
        if (!email) { setError("Please enter your email to use Passkey."); return; }
        setIsPasskeyLoading(true);
        try {
            const resp = await fetch("/api/auth/passkey/generate-login", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email })
            });

            // 🆕 [PHASE B] Le 429 doit être intercepté AVANT le test `!resp.ok`
            // générique. Un statut 429 n'est pas "ok", il tomberait donc dans
            // "No passkey found for this email" — ce qui enverrait l'utilisateur
            // configurer une passkey qu'il possède déjà, sans jamais lui dire
            // qu'il est simplement bloqué quelques instants.
            if (resp.status === 429) {
                const data = await resp.json().catch(() => ({} as any));
                throw new Error(data.error || "Too many attempts. Please wait a moment and try again.");
            }

            if (!resp.ok) throw new Error("No passkey found for this email. Setup in Settings first.");
            const options = await resp.json();

            let authenticationResponse;
            try {
                // 🆕 [PHASE B] CORRECTION DE LA SIGNATURE D'APPEL.
                //
                // Avant : startAuthentication(options)
                // Maintenant : startAuthentication({ optionsJSON: options })
                //
                // @simplewebauthn/browser v13 a changé sa signature : la fonction
                // attend désormais un OBJET dont la propriété `optionsJSON`
                // contient les options, au lieu des options directement.
                //
                // L'ancien appel fonctionnait encore par rétrocompatibilité, mais
                // la librairie l'annonçait dans la console ("startAuthentication()
                // was not called correctly") et le supprimera à la prochaine
                // version majeure — la connexion par passkey casserait alors d'un
                // coup, lors d'une simple mise à jour de dépendance.
                authenticationResponse = await startAuthentication({ optionsJSON: options });
            } 
            catch (authErr) { throw new Error("Biometric scan cancelled or failed."); }

            const resultat = await signIn("credentials", {
                email: email,
                passkeyResponse: JSON.stringify(authenticationResponse), 
                // 🆕 [PHASE B] `rememberMe` était ABSENT de cet appel : une
                // connexion par passkey ignorait donc totalement la case cochée
                // par l'utilisateur, qui repartait avec une session courte de 24 h
                // au lieu des 15 jours promis.
                rememberMe: rememberMe.toString(),
                redirect: false,
            });

            // 🆕 [PHASE B] Même raisonnement que pour le formulaire mot de passe :
            // un blocage par rate limiting n'est pas un échec de vérification
            // biométrique. Afficher "Security verification failed" ferait croire
            // à l'utilisateur que son empreinte ou son appareil pose problème.
            if (resultat?.error === "TOO_MANY_ATTEMPTS") {
                throw new Error("Too many login attempts. Please wait a few minutes before trying again.");
            }

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
                {/* 🆕 L'icône d'aide était visuellement cliquable (cursor-pointer)
                    mais n'avait aucune action — un faux bouton. Elle ouvre
                    maintenant une fenêtre de rédaction d'email.
                    💡 aria-label est indispensable : une icône seule, sans texte,
                    est totalement invisible pour un lecteur d'écran.
                    💡 rel="noopener noreferrer" est obligatoire avec target="_blank" :
                    sans lui, la page ouverte peut manipuler la nôtre. */}
                
                <a    href="https://mail.google.com/mail/?view=cm&fs=1&to=rayan1mhalla@gmail.com&su=TrustVerify%20-%20Login%20assistance"
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
                    
                    {/* 💡 EN-TÊTE DYNAMIQUE */}
                    <div className="text-center mb-3 text-2xl font-bold">
                        {is2faStep ? (
                            <>
                                {/* 🆕 [PHASE B] L'icône et le texte changent selon le
                                    mode : une clé pour le code de secours, un
                                    bouclier pour le code habituel. L'utilisateur voit
                                    immédiatement dans quel mode il se trouve, sans
                                    avoir à interpréter le champ de saisie. */}
                                {useBackupCode ? (
                                    <>
                                        <KeyRound className="w-10 h-10 text-blue-700 mx-auto mb-2" />
                                        <h1 className="text-2xl font-bold text-gray-900">Backup Code</h1>
                                        <p className="text-sm text-gray-500 m-2">Enter one of the recovery codes you saved when enabling two-factor authentication.</p>
                                    </>
                                ) : (
                                    <>
                                        <ShieldAlert className="w-10 h-10 text-blue-700 mx-auto mb-2" />
                                        <h1 className="text-2xl font-bold text-gray-900">Two-Factor Auth</h1>
                                        <p className="text-sm text-gray-500 m-2">Enter the 6-digit code from your authenticator app.</p>
                                    </>
                                )}
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

                                {/* 🆕 [PHASE B] DEUX CHAMPS MUTUELLEMENT EXCLUSIFS.
                                    Leurs contraintes de saisie n'ont rien à voir : le
                                    TOTP n'accepte que 6 chiffres, le code de secours
                                    des lettres ET des chiffres avec un tiret. Un champ
                                    unique aurait forcé à relâcher le filtrage du TOTP,
                                    au détriment de la saisie la plus courante. */}
                                {useBackupCode ? (
                                    <input
                                        type="text"
                                        maxLength={13}
                                        placeholder="XXXXX-XXXXX"
                                        required
                                        autoFocus
                                        value={backupCode}
                                        // 💡 Passage en majuscules à la volée : les codes
                                        // sont affichés et stockés en majuscules. Voir sa
                                        // saisie en minuscules ferait douter l'utilisateur
                                        // alors que le serveur normalise de toute façon.
                                        onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                                        className="w-full border border-gray-300 rounded-sm py-3 px-4 text-center tracking-[0.25em] font-mono text-xl focus-within:border-blue-500 outline-none transition-colors uppercase"
                                    />
                                ) : (
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
                                )}

                                {/* 🆕 [PHASE B] LE LIEN QUI REND LES CODES DE SECOURS
                                    ACCESSIBLES. Sans lui, ils existeraient en base sans
                                    qu'aucun utilisateur ne puisse jamais s'en servir —
                                    exactement l'état du champ `backupCodes` avant ce
                                    travail : présent au schéma, mort dans le code. */}
                                <button
                                    type="button"
                                    onClick={toggleBackupMode}
                                    className="flex items-center justify-center gap-1.5 text-xs text-blue-700 font-bold mt-4 mx-auto hover:underline transition-colors"
                                >
                                    {useBackupCode ? (
                                        <><ShieldAlert className="w-3 h-3" /> Use authenticator code instead</>
                                    ) : (
                                        <><KeyRound className="w-3 h-3" /> Use a backup code instead</>
                                    )}
                                </button>

                                <button 
                                    type="button" 
                                    onClick={() => { setIs2faStep(false); setTotpCode(""); setBackupCode(""); setUseBackupCode(false); setError(""); }}
                                    className="flex items-center justify-center gap-1.5 text-xs text-gray-500 mt-3 mx-auto hover:text-gray-900 transition-colors"
                                >
                                    <ArrowLeft className="w-3 h-3" /> Back to password
                                </button>
                            </div>
                        )}

                        {error && <div className="p-3 mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-sm font-medium">{error}</div>}
                        
                        <button 
                            type="submit"
                            // 🆕 [PHASE B] La condition d'activation dépend du mode :
                            // 6 chiffres pour le TOTP, 10 caractères normalisés pour un
                            // code de secours.
                            disabled={
                                isLoginLoading ||
                                (is2faStep && (useBackupCode ? !isBackupCodeComplete : totpCode.length !== 6))
                            }
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