"use client";

// ============================================================================
// 🆕 FORMULAIRE DE NOUVELLE VÉRIFICATION KYC — LE CŒUR DU PRODUIT
// ============================================================================
// Flux complet : formulaire d'identité → upload de la pièce d'identité + capture
// de la séquence de liveness (Supabase Storage, bucket PRIVÉ) → POST
// /api/customers qui exécute TOUT le pipeline de vérification côté serveur (OCR,
// AML, comparaison faciale, liveness, moteur de règles).
//
// ✅ [PHASE B — RÉSOLU] Les documents ne partent plus sur uploadthing derrière
// des URLs publiques et permanentes. Ils vont dans un bucket Supabase privé, et
// ce formulaire ne manipule plus que des CHEMINS — des coordonnées internes non
// adressables, inutilisables sans une URL signée délivrée par le serveur après
// contrôle du companyId.
//
// ✅ [PHASE C — RÉSOLU] LA BIOMÉTRIE A QUITTÉ CE FICHIER.
// face-api.js chargeait trois réseaux de neurones dans le navigateur et le score
// obtenu partait dans le corps de la requête. Il suffisait d'intercepter l'appel
// et de remplacer `biometricScore: 12.4` par `99.9` pour que deux photos de
// personnes différentes passent sans la moindre pénalité.
//
// 💡 LA RÈGLE GÉNÉRALE : un contrôle de sécurité exécuté sur une machine que
// l'utilisateur contrôle n'est pas un contrôle, c'est un affichage.
//
// ✅ [PHASE C — RÉSOLU] LE SELFIE N'EST PLUS UN FICHIER UPLOADÉ.
//
// ❌ CE QUI EXISTAIT ICI : un `<input type="file">` classique, exactement le même
// mécanisme que pour la pièce d'identité. N'importe qui pouvait envoyer une photo
// de sa victime trouvée sur Facebook ou LinkedIn — et la comparaison faciale
// serveur confirmait consciencieusement que c'était bien elle. Le contrôle
// biométrique fonctionnait parfaitement et VALIDAIT UNE USURPATION.
//
// ✅ MAINTENANT : `<LivenessCapture />` impose une capture caméra en direct et
// demande DEUX actions tirées au hasard par le serveur. Une photo imprimée ne
// tourne pas la tête. L'image neutre de la séquence devient le selfie du dossier
// — même usage qu'avant, mais capturée en direct au lieu d'être choisie dans une
// galerie.
//
// ⚠️ LIMITE DOCUMENTÉE : une VIDÉO pré-enregistrée de la vraie personne pourrait
// passer. Ce n'est pas une faiblesse du modèle mais de l'information disponible —
// une image 2D ne contient pas la profondeur. Voir lib/liveness-verify.ts.
//
// Autre détail : le sélecteur "Procedure Type" propose "Individual KYC
// (Enhanced - Biometrics)" comme option distincte de "Standard", mais AUCUNE
// branche du code ne change de comportement selon cette valeur — la comparaison
// faciale et le liveness s'exécutent dans tous les cas. Le champ est cosmétique.
import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { User, Mail, Shield, ArrowLeft, PlusCircle, CreditCard, Calendar, Globe, AlertTriangle, FileText, X, Lock, Zap, Languages } from "lucide-react";
import Link from "next/link";
import Header from "@/components/header";
import { toast } from "sonner";
import { getCountries, getCountryCallingCode } from 'react-phone-number-input/input';
import en from 'react-phone-number-input/locale/en';
// 🆕 [PHASE C — LIVENESS] Le composant remplace la zone "Upload Selfie".
import LivenessCapture, { type LivenessResult } from "@/components/liveness-capture";

// ============================================================================
// 🆕 [PHASE B] CONTRAINTES DE FICHIER — ALIGNÉES SUR LE BUCKET SUPABASE
// ============================================================================
// ⚠️ Ces deux constantes doivent rester COHÉRENTES avec la configuration du
// bucket `kyc-documents` dans le dashboard Supabase. L'ancienne version validait
// 5 Mo côté client alors que le stockage plafonnait à 4 Mo : un fichier entre les
// deux passait la vérification visuelle puis échouait au transfert, avec un
// message d'erreur incompréhensible.
//
// 💡 Ces vérifications ne PROTÈGENT rien — un appel direct à l'API les
// contournerait. Elles servent uniquement au confort : donner un retour immédiat
// plutôt que de laisser l'utilisateur attendre le rejet du serveur. La vraie
// barrière est configurée au niveau du bucket.
//
// 💡 Elles ne concernent plus que la PIÈCE D'IDENTITÉ : les images de liveness
// sont produites par `canvas.toBlob()` dans le composant, à une résolution et un
// format que nous contrôlons entièrement.
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024; // 4 Mo

// ⚠️ image/svg+xml est délibérément ABSENT. Un SVG est un document XML qui peut
// embarquer du JavaScript : servi un jour depuis notre domaine, il deviendrait un
// vecteur d'attaque XSS. L'ancienne vérification `file.type.startsWith('image/')`
// l'acceptait sans broncher.
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function NewVerificationPage() {
    const { data: session } = useSession();
    const router = useRouter();

    const [customerName, setCustomerName] = useState("");
    // 🆕 [ARABE] Nom tel qu'il figure SUR LA CARTE, en écriture arabe.
    //
    // ⚠️ CE QUE ÇA CORRIGE : les CIN tunisiennes portent le nom en arabe, alors
    // que `customerName` ci-dessus est saisi en alphabet latin. Le serveur
    // cherchait donc "rayen" dans un texte arabe — introuvable par nature.
    // `ocrNameMismatch` se déclenchait sur 100% des dossiers tunisiens, coûtant
    // 40 points de pénalité à des clients parfaitement légitimes.
    const [customerNameAr, setCustomerNameAr] = useState("");
    const [email, setEmail] = useState("");
    const [type, setType] = useState("Individual KYC (Standard)");
    const [cin, setCin] = useState("");
    const [documentType, setDocumentType] = useState("CIN");
    const [nationality, setNationality] = useState<string>("TN");
    const [dateOfBirth, setDateOfBirth] = useState("");
    const [localPhone, setLocalPhone] = useState<string>("");

    const [idCardFile, setIdCardFile] = useState<File | null>(null);
    const [idCardPreview, setIdCardPreview] = useState<string | null>(null);

    // 🆕 [PHASE C — LIVENESS] Le résultat de la séquence remplace `selfieFile`.
    //
    // 💡 CE STATE NE CONTIENT PAS D'IMAGES, MAIS DES CHEMINS. Le composant a déjà
    // envoyé les trois images dans le bucket au moment où il appelle `onResult` —
    // ce formulaire n'a plus qu'à transmettre les coordonnées au serveur. C'est
    // une différence importante avec l'ancien `selfieFile`, qui était un vrai
    // fichier restant à téléverser au moment de la soumission.
    const [livenessResult, setLivenessResult] = useState<LivenessResult | null>(null);

    const idCardInputRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(false);
    const [loadingText, setLoadingText] = useState("");
    const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
    const [globalError, setGlobalError] = useState("");

    // 💡 ETATS DU PAYWALL (BILLING)
    const [isCheckingQuota, setIsCheckingQuota] = useState(true);
    const [quotaReached, setQuotaReached] = useState(false);
    const [usageStats, setUsageStats] = useState({ current: 0, limit: 5 });

    const callingCode = nationality ? getCountryCallingCode(nationality as any) : "";

    // ========================================================================
    // 🆕 [PHASE C] CE useEffect NE FAIT PLUS QU'UNE SEULE CHOSE
    // ========================================================================
    // Il vérifiait le quota PUIS téléchargeait trois réseaux de neurones depuis
    // /public/models. Ce second temps a disparu avec le passage de la biométrie
    // côté serveur — plusieurs mégaoctets en moins à chaque ouverture de page.
    useEffect(() => {
        const checkQuota = async () => {
            try {
                const quotaRes = await fetch("/api/billing/quota");
                if (quotaRes.ok) {
                    const quotaData = await quotaRes.json();
                    setUsageStats({ current: quotaData.current, limit: quotaData.limit });
                    if (quotaData.isLocked) {
                        setQuotaReached(true);
                    }
                }
            } catch (err) {
                // 💡 Échec NON bloquant, et c'est délibéré : si l'appel au quota
                // échoue, on laisse l'agent remplir le formulaire. Le serveur
                // revérifie de toute façon le quota à la soumission et répond 402
                // le cas échéant — un incident réseau ne doit pas condamner une
                // page entière alors que la vraie barrière est ailleurs.
                console.error("⚠️ Quota check failed:", err);
            } finally {
                setIsCheckingQuota(false);
            }
        };
        checkQuota();
    }, []);

    // ========================================================================
    // 🆕 [PHASE B] ENVOI D'UN DOCUMENT VERS LE BUCKET PRIVÉ — EN 2 TEMPS
    // ========================================================================
    //   TEMPS 1 — On demande une AUTORISATION à notre serveur. Il vérifie la
    //   session, calcule lui-même le chemin de destination à partir du companyId,
    //   et renvoie une URL d'écriture signée valable 15 minutes. Le navigateur ne
    //   choisit JAMAIS où le fichier atterrit : il est donc structurellement
    //   incapable d'écrire dans le dossier d'une autre entreprise.
    //
    //   TEMPS 2 — Le fichier part DIRECTEMENT du navigateur vers Supabase, sans
    //   jamais transiter par notre application.
    //
    // 💡 POURQUOI CE DÉTOUR : Vercel plafonne le corps d'une requête serverless à
    // 4,5 Mo. Nos fichiers montent à 4 Mo, et l'encodage multipart réduit encore
    // la marge — on frôlerait l'échec en permanence.
    //
    // 🆕 [PHASE C] Cette fonction ne sert plus QUE pour la pièce d'identité : le
    // composant de liveness envoie ses trois images lui-même, avec exactement le
    // même mécanisme.
    const uploadDocument = async (file: File, kind: "idcard"): Promise<string> => {
        // --- TEMPS 1 : obtenir l'autorisation ---
        const authRes = await fetch("/api/kyc-documents/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, contentType: file.type }),
        });

        if (!authRes.ok) {
            const data = await authRes.json().catch(() => ({} as any));
            // 💡 On remonte le message du serveur tel quel : il est déjà précis
            // (type non autorisé, quota dépassé, session expirée...). En inventer
            // un ici masquerait la vraie cause à l'utilisateur.
            throw new Error(data.error || "Impossible de préparer l'envoi du document.");
        }

        const { signedUrl, path } = await authRes.json();

        // --- TEMPS 2 : envoyer le fichier directement à Supabase ---
        // Aucune clé Supabase n'est nécessaire côté navigateur : la signature
        // contenue dans l'URL fait office d'autorisation, et elle ne vaut que pour
        // CE chemin précis, pendant 15 minutes.
        const uploadRes = await fetch(signedUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type },
            body: file,
        });

        if (!uploadRes.ok) {
            console.error(
                "[UPLOAD] Échec du transfert :",
                uploadRes.status,
                await uploadRes.text().catch(() => "")
            );
            throw new Error("Le transfert du document a échoué. Vérifiez votre connexion et réessayez.");
        }

        return path;
    };

    // Validation client seulement — un attaquant appelant /api/customers
    // directement contournerait tout ceci, mais le serveur revalide
    // indépendamment via Zod. Cette couche n'est là que pour le confort.
    const validateForm = () => {
        const errors: { [key: string]: string } = {};

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) errors.email = "Invalid email format.";

        // 🆕 [ARABE] Si le champ est rempli, il DOIT contenir de l'arabe.
        //
        // ⚠️ CE QUE ÇA ÉVITE : un agent pressé pourrait y retaper le nom latin par
        // réflexe. Le serveur détecterait alors l'absence de caractères arabes et
        // retomberait sur la comparaison latine — reproduisant exactement le bug
        // d'origine, mais de façon invisible : le champ paraîtrait rempli alors
        // qu'il ne sert à rien.
        //
        // 💡 U+0600–U+06FF est le bloc Unicode principal de l'écriture arabe.
        if (customerNameAr.trim() && !/[\u0600-\u06FF]/.test(customerNameAr)) {
            errors.customerNameAr = "This field must contain Arabic text, exactly as printed on the ID card.";
        }

        if (documentType === "CIN") {
            if (nationality === "TN") {
                const tnCinRegex = /^[0-9]{8}$/;
                if (!tnCinRegex.test(cin)) errors.cin = "Tunisian CIN must be exactly 8 digits.";
            } else if (nationality === "FR") {
                const frCinRegex = /^[0-9A-Z]{12}$/i;
                if (!frCinRegex.test(cin)) errors.cin = "French ID must be 12 characters.";
            } else {
                if (cin.length < 5) errors.cin = "ID number is too short.";
            }
        } else if (documentType === "Passport") {
            const passportRegex = /^[A-Z0-9]{6,9}$/i;
            if (!passportRegex.test(cin)) errors.cin = "Invalid passport format (6-9 characters).";
        }

        if (localPhone) {
            if (nationality === "TN") {
                const tnPhoneRegex = /^[234579][0-9]{7}$/;
                if (!tnPhoneRegex.test(localPhone)) errors.localPhone = "Invalid Tunisian number.";
            } else {
                if (localPhone.length < 6 || localPhone.length > 14) errors.localPhone = "Invalid phone length.";
            }
        }

        if (dateOfBirth) {
            const birthDate = new Date(dateOfBirth);
            const today = new Date();
            const age = today.getFullYear() - birthDate.getFullYear();
            if (age < 18) errors.dateOfBirth = "Client must be at least 18 years old.";
        }

        if (!idCardFile) errors.idCardFile = "Front ID Document is required.";

        // 🆕 [PHASE C — LIVENESS] REMPLACE LA VÉRIFICATION `selfieFile`.
        //
        // ⚠️ UN CONTOURNEMENT DOCUMENTÉ EST UN RÉSULTAT VALIDE : l'agent qui a
        // écrit une justification peut soumettre. Ce qui est refusé, c'est
        // l'ABSENCE de résultat — ni capture, ni justification.
        //
        // 💡 Le serveur applique de toute façon sa propre règle : un dossier sans
        // séquence est traité comme un contournement et coûte 45 points. Cette
        // vérification n'est là que pour éviter à l'agent de découvrir la
        // pénalité après coup.
        if (!livenessResult) {
            errors.liveness = "Live capture is required. Complete the liveness check, or document why it is not possible.";
        }

        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    // 🆕 [PHASE C] Ne gère plus que la pièce d'identité — le paramètre `type` a
    // disparu, il n'y a plus qu'un seul fichier à choisir dans ce formulaire.
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // 🆕 [PHASE B] LISTE BLANCHE STRICTE au lieu de `startsWith('image/')`.
        // L'ancienne vérification acceptait image/svg+xml, image/gif, et tout
        // autre format exotique.
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            setGlobalError("Unsupported format. Please upload a JPEG, PNG or WebP image.");
            return;
        }

        // 🆕 [PHASE B] 4 Mo — aligné sur la limite du bucket Supabase.
        if (file.size > MAX_FILE_SIZE_BYTES) {
            setGlobalError("File size must be under 4MB.");
            return;
        }

        setGlobalError("");

        // Cette URL `blob:` ne sert QU'À L'APERÇU affiché dans le formulaire. Elle
        // pointe vers la mémoire du navigateur, jamais vers le réseau.
        const previewUrl = URL.createObjectURL(file);

        setIdCardFile(file);
        setIdCardPreview(previewUrl);
        setFieldErrors(prev => ({ ...prev, idCardFile: "" }));
    };

    const removeFile = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIdCardFile(null);
        setIdCardPreview(null);
        if (idCardInputRef.current) idCardInputRef.current.value = "";
    };

    // 🆕 [PHASE C — LIVENESS] Réception du résultat de la séquence.
    //
    // 💡 Le composant appelle `onResult(null)` chaque fois qu'il repart de zéro
    // (relance, annulation d'un contournement). On efface donc aussi l'erreur de
    // champ : elle ne correspondrait plus à l'état affiché.
    const handleLivenessResult = (result: LivenessResult | null) => {
        setLivenessResult(result);
        if (result) setFieldErrors(prev => ({ ...prev, liveness: "" }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) {
            setGlobalError("Please fix the errors in the form before submitting.");
            return;
        }

        setLoading(true);
        setGlobalError("");

        let finalPhoneNumber = "Not specified";
        if (nationality && localPhone) {
            finalPhoneNumber = `+${callingCode} ${localPhone.trim()}`;
        }

        const registrationPromise = new Promise(async (resolve, reject) => {
            try {
                setLoadingText("Uploading secure documents...");

                // 🆕 [PHASE C] UN SEUL FICHIER À ENVOYER ICI.
                //
                // 💡 Le `Promise.all` sur deux uploads a disparu : les trois images
                // de liveness sont DÉJÀ dans le bucket au moment où on arrive ici.
                // Le composant les a envoyées dès la fin de la séquence, pendant
                // que l'agent finissait de remplir le formulaire — du temps gagné
                // qui n'apparaît nulle part.
                if (!idCardFile) {
                    throw new Error("Front ID document is missing.");
                }

                const uploadedIdCardPath = await uploadDocument(idCardFile, "idcard");

                if (!uploadedIdCardPath) {
                    throw new Error("Document upload failed. Please try again.");
                }

                // ============================================================
                // 🆕 [PHASE C — LIVENESS] CONSTRUCTION DU PAYLOAD DE PRÉSENCE
                // ============================================================
                // Deux formes possibles, mutuellement exclusives :
                //
                //   • SÉQUENCE CAPTURÉE → on transmet le jeton signé, les trois
                //     chemins et le compteur de tentatives. Le serveur rejouera la
                //     vérification lui-même : rien de ce qu'on envoie ici n'est
                //     cru sur parole.
                //
                //   • CONTOURNEMENT → on transmet la justification écrite. Le
                //     serveur la stockera et pénalisera le dossier de 45 points.
                //
                // ⚠️ ON N'ENVOIE AUCUN VERDICT. Le composant ne sait pas si la
                // séquence est valide et n'a pas à le savoir — il produit une
                // preuve, le serveur la juge. Transmettre un verdict calculé côté
                // client reproduirait exactement la faille du `biometricScore`
                // qu'on vient de corriger.
                const livenessPayload: Record<string, unknown> = {};

                if (livenessResult?.status === "captured") {
                    const byKind = (kind: string) =>
                        livenessResult.frames.find((f) => f.kind === kind)?.path;

                    const referencePath = byKind("reference");
                    const action1Path = byKind("action1");
                    const action2Path = byKind("action2");

                    // Garde-fou : le composant ne remonte un résultat "captured"
                    // que si les trois images sont là, mais on ne construit pas un
                    // objet à moitié vide sur la foi de cette promesse.
                    if (referencePath && action1Path && action2Path) {
                        livenessPayload.liveness = {
                            token: livenessResult.token,
                            referencePath,
                            action1Path,
                            action2Path,
                            attempts: livenessResult.attempts,
                        };
                    }
                } else if (livenessResult?.status === "skipped") {
                    livenessPayload.livenessSkipReason = livenessResult.reason;
                }

                // 💡 Le texte de chargement mentionne le liveness parce qu'il a
                // bien lieu, simplement ailleurs : c'est le serveur qui l'analyse
                // pendant cette requête. L'agent n'a pas à savoir OÙ tourne le
                // calcul, mais il doit comprendre pourquoi il attend — le pipeline
                // complet peut prendre une quarantaine de secondes.
                setLoadingText("Running identity checks (OCR, liveness, biometrics, AML)...");

                const response = await fetch("/api/customers", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        customerName,
                        // 🆕 [ARABE] Envoyé même vide : le serveur gère les deux cas
                        // et retombe sur la comparaison latine quand le champ est
                        // absent. Une chaîne vide est plus prévisible qu'un champ
                        // manquant côté validation Zod.
                        customerNameAr,
                        email,
                        type,
                        cin,
                        documentType,
                        nationality: nationality ? en[nationality as keyof typeof en] : "Not specified",
                        dateOfBirth,
                        phoneNumber: finalPhoneNumber,
                        idCardPath: uploadedIdCardPath,
                        // 🆕 [PHASE C] `selfiePath` N'EST PLUS ENVOYÉ.
                        //
                        // Le serveur le dérive de l'image de RÉFÉRENCE de la
                        // séquence : elle EST un selfie — un visage de face, en
                        // pose neutre — à ceci près qu'elle a été capturée en
                        // direct au lieu d'être choisie dans une galerie. Toute la
                        // comparaison faciale continue de fonctionner, sur une
                        // source strictement meilleure.
                        ...livenessPayload,
                    }),
                });

                const data = await response.json();

                if (response.ok) {
                    resolve(data);
                    setTimeout(() => router.push("/dashboard"), 1500);
                } else {
                    // Si on attrape l'erreur 402 du backend
                    if (response.status === 402) {
                        setQuotaReached(true);
                        reject("Payment Required: Trial limit reached.");
                    } else {
                        reject(data.error || "An error occurred during registration.");
                    }
                }
            } catch (error: any) {
                reject(error.message || "Network error. Failed to initiate pipeline.");
            } finally {
                setLoading(false);
            }
        });

        toast.promise(registrationPromise, {
            loading: "Processing KYC application...",
            success: "KYC Pipeline successfully initiated! Redirecting...",
            error: (err) => `${err}`,
        });
    };

    if (isCheckingQuota) {
        return (
            <div className="w-full min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-gray-500 font-medium">Verifying workspace permissions...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full min-h-screen bg-gray-50 pb-12">
            <Header />

            <div className="max-w-4xl mx-auto px-4 py-8">
                <Link href="/dashboard/customers" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-blue-700 font-medium mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Directory
                </Link>

                <div className="relative bg-white border border-gray-200 shadow-sm rounded-xl p-6 md:p-8 overflow-hidden">

                    {/* 💡 LE FAMEUX PAYWALL */}
                    {quotaReached && (
                        <div className="absolute inset-0 z-50 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center p-6">
                            <div className="bg-white border border-gray-200 shadow-2xl rounded-2xl p-8 max-w-md w-full text-center flex flex-col items-center transform scale-100 animate-in fade-in zoom-in duration-300">
                                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4 border border-red-100">
                                    <Lock className="w-8 h-8 text-red-600" />
                                </div>
                                <h2 className="text-2xl font-black text-gray-900 mb-2">Usage Limit Reached</h2>
                                <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                                    Your workspace has exhausted its <strong className="text-gray-900">Free Trial</strong> quota ({usageStats.limit}/{usageStats.limit} verifications). Upgrade your plan to continue onboarding customers automatically.
                                </p>
                                <button onClick={() => router.push('/dashboard/settings')} className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors">
                                    <Zap className="w-5 h-5" /> Upgrade to Premium
                                </button>
                                <button onClick={() => router.push('/dashboard/customers')} className="w-full mt-3 bg-white text-gray-600 font-bold py-3.5 px-4 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                                    Cancel and Return
                                </button>
                            </div>
                        </div>
                    )}

                    <div className={quotaReached ? "opacity-20 pointer-events-none filter blur-sm transition-all" : ""}>
                        <div className="flex justify-between items-start mb-8">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900 mb-2">New Identity Verification</h2>
                                <p className="text-sm text-gray-500">Register a new client or entity to initiate the KYC/KYB pipeline.</p>
                            </div>
                            {!quotaReached && (
                                <div className="hidden md:flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg border border-blue-100">
                                    <Zap className="w-4 h-4" />
                                    <span className="text-xs font-bold">{usageStats.limit - usageStats.current} credits left</span>
                                </div>
                            )}
                        </div>

                        {globalError && (
                            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-3 text-sm font-medium">
                                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                                <span>{globalError}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="flex flex-col gap-8">

                            <div className="flex flex-col gap-5">
                                <h3 className="text-md font-bold text-gray-800 border-b border-gray-100 pb-2">1. Personal Information</h3>

                                <div className="flex flex-col sm:flex-row gap-5">
                                    <div className="flex-1 flex flex-col gap-2">
                                        <label className="text-sm font-semibold text-gray-700">Full Name <span className="text-red-500">*</span></label>
                                        <div className="relative">
                                            <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                            <input type="text" placeholder="Ex: Eleanor Lewis" value={customerName} onChange={(e) => setCustomerName(e.target.value)} disabled={loading} required className="w-full border border-gray-300 rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 text-gray-800 disabled:bg-gray-50" />
                                        </div>
                                    </div>

                                    <div className="flex-1 flex flex-col gap-2">
                                        <label className="text-sm font-semibold text-gray-700">Email Address <span className="text-red-500">*</span></label>
                                        <div className="relative">
                                            <Mail className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${fieldErrors.email ? 'text-red-500' : 'text-gray-400'}`} />
                                            <input type="email" placeholder="Ex: e.lewis@corporate.com" value={email} onChange={(e) => {setEmail(e.target.value); setFieldErrors({...fieldErrors, email: ""})}} disabled={loading} required className={`w-full border rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none transition-colors text-gray-800 disabled:bg-gray-50 ${fieldErrors.email ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-blue-500'}`} />
                                        </div>
                                        {fieldErrors.email && <p className="text-xs text-red-600 font-medium">{fieldErrors.email}</p>}
                                    </div>
                                </div>

                                {/* 🆕 [ARABE] CHAMP OPTIONNEL — NOM EN ÉCRITURE ARABE
                                    ================================================
                                    💡 POURQUOI UN CHAMP SÉPARÉ, ET NON UNE CONVERSION
                                    AUTOMATIQUE : il n'existe pas de translittération
                                    unique. "Mhalla" peut légitimement s'écrire محلة,
                                    المحلة ou محلا selon l'état civil. Et certaines
                                    mentions sont des conventions administratives, pas
                                    des translittérations : "dit" devient شهرة sur les
                                    CIN tunisiennes — aucun outil ne le devinerait.

                                    💡 LES DEUX CHAMPS SERVENT À DES CHOSES DIFFÉRENTES :
                                      • Nom latin → screening OpenSanctions (les listes
                                        ONU/UE/US indexent en alphabet latin), emails
                                      • Nom arabe → comparaison avec l'OCR, uniquement */}
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-gray-700">
                                        Name in Arabic <span className="text-gray-400 font-normal">(as printed on the ID)</span>
                                    </label>
                                    <div className="relative">
                                        <Languages className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                        <input
                                            type="text"
                                            // 💡 `dir="rtl"` fait démarrer le texte à DROITE, comme
                                            // toute écriture arabe. Sans cet attribut, la saisie
                                            // s'affiche de façon déroutante et la ponctuation se
                                            // place du mauvais côté.
                                            dir="rtl"
                                            placeholder="مثال: ريان محلة شهرة عون الله"
                                            value={customerNameAr}
                                            onChange={(e) => { setCustomerNameAr(e.target.value); setFieldErrors({...fieldErrors, customerNameAr: ""}); }}
                                            disabled={loading}
                                            className={`w-full border rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none transition-colors text-gray-800 disabled:bg-gray-50 ${fieldErrors.customerNameAr ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-blue-500'}`}
                                        />
                                    </div>
                                    {fieldErrors.customerNameAr ? (
                                        <p className="text-xs text-red-600 font-medium">{fieldErrors.customerNameAr}</p>
                                    ) : (
                                        /* 💡 Message explicatif permanent : sans lui, un agent
                                           laisserait le champ vide par défaut, et la
                                           vérification OCR resterait inopérante sans que
                                           personne ne comprenne pourquoi les scores sont
                                           systématiquement pénalisés. */
                                        <p className="text-xs text-gray-500 leading-relaxed">
                                            Optional, but strongly recommended for Tunisian IDs. Leaving it empty makes the document text check unreliable, since the card is written in Arabic.
                                        </p>
                                    )}
                                </div>

                                <div className="flex flex-col sm:flex-row gap-5">
                                    <div className="flex-1 flex flex-col gap-2">
                                        <label className="text-sm font-semibold text-gray-700">Nationality <span className="text-red-500">*</span></label>
                                        <div className="relative">
                                            <Globe className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                            <select value={nationality} onChange={(e) => {setNationality(e.target.value); setFieldErrors({...fieldErrors, cin: "", localPhone: ""})}} disabled={loading} required className="w-full border border-gray-300 bg-white rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 text-gray-800 cursor-pointer disabled:bg-gray-50">
                                                <option value="">Select a country...</option>
                                                {getCountries().map((country) => (
                                                    <option key={country} value={country}>{en[country as keyof typeof en]}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="flex-1 flex flex-col gap-2">
                                        <label className="text-sm font-semibold text-gray-700">Phone Number</label>
                                        <div className={`flex items-center w-full border rounded-lg overflow-hidden transition-all h-[42px] ${loading ? 'bg-gray-50' : 'bg-white'} ${fieldErrors.localPhone ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500'}`}>
                                            <div className={`relative flex items-center justify-center gap-1.5 border-r border-gray-300 px-3 h-full text-sm text-gray-700 font-semibold ${loading ? 'bg-gray-100' : 'bg-gray-50'}`}>
                                                {nationality ? <img src={`https://flagcdn.com/${nationality.toLowerCase()}.svg`} alt={nationality} className="w-5 h-3.5 object-cover rounded-[2px]" /> : <div className="w-5 h-3.5 bg-gray-200 rounded-[2px]"></div>}
                                                <select value={nationality} onChange={(e) => setNationality(e.target.value)} disabled={loading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed">
                                                    <option value="">Select...</option>
                                                    {getCountries().map((country) => (<option key={country} value={country}>{en[country as keyof typeof en]}</option>))}
                                                </select>
                                                <span>{callingCode ? `+${callingCode}` : "+"}</span>
                                            </div>
                                            <input type="tel" placeholder="Ex: 98 123 456" value={localPhone} onChange={(e) => {setLocalPhone(e.target.value.replace(/[^0-9\s]/g, '')); setFieldErrors({...fieldErrors, localPhone: ""})}} disabled={loading} className="flex-1 text-sm text-gray-800 outline-none bg-transparent px-3 h-full disabled:cursor-not-allowed" />
                                        </div>
                                        {fieldErrors.localPhone && <p className="text-xs text-red-600 font-medium">{fieldErrors.localPhone}</p>}
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-5">
                                    <div className="flex-1 flex flex-col gap-2">
                                        <label className="text-sm font-semibold text-gray-700">Date of Birth</label>
                                        <div className="relative">
                                            <Calendar className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${fieldErrors.dateOfBirth ? 'text-red-500' : 'text-gray-400'}`} />
                                            <input type="date" value={dateOfBirth} onChange={(e) => {setDateOfBirth(e.target.value); setFieldErrors({...fieldErrors, dateOfBirth: ""})}} disabled={loading} className={`w-full border rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none transition-colors text-gray-800 disabled:bg-gray-50 ${fieldErrors.dateOfBirth ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-blue-500'}`} />
                                        </div>
                                        {fieldErrors.dateOfBirth && <p className="text-xs text-red-600 font-medium">{fieldErrors.dateOfBirth}</p>}
                                    </div>
                                    <div className="hidden sm:block flex-1"></div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-5">
                                <h3 className="text-md font-bold text-gray-800 border-b border-gray-100 pb-2">2. Official Identification</h3>

                                <div className="flex flex-col sm:flex-row gap-5">
                                    <div className="w-full sm:w-1/3 flex flex-col gap-2">
                                        <label className="text-sm font-semibold text-gray-700">Document Type <span className="text-red-500">*</span></label>
                                        <select value={documentType} onChange={(e) => {setDocumentType(e.target.value); setFieldErrors({...fieldErrors, cin: ""})}} disabled={loading} className="w-full border border-gray-300 bg-white rounded-lg py-2.5 px-3 text-sm outline-none focus:border-blue-500 text-gray-800 cursor-pointer disabled:bg-gray-50">
                                            <option value="CIN">National ID (CIN)</option>
                                            <option value="Passport">Passport</option>
                                            <option value="Driving License">Driving License</option>
                                        </select>
                                    </div>

                                    <div className="w-full sm:w-2/3 flex flex-col gap-2">
                                        <label className="text-sm font-semibold text-gray-700">Unique ID Number <span className="text-red-500">*</span></label>
                                        <div className="relative">
                                            <CreditCard className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${fieldErrors.cin ? 'text-red-500' : 'text-gray-400'}`} />
                                            <input type="text" placeholder={nationality === "TN" && documentType === "CIN" ? "Ex: 14066711 (8 digits)" : "Ex: 12345678"} value={cin} onChange={(e) => {setCin(e.target.value.toUpperCase()); setFieldErrors({...fieldErrors, cin: ""})}} disabled={loading} required className={`w-full border rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none transition-colors text-gray-800 disabled:bg-gray-50 ${fieldErrors.cin ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-blue-500'}`} />
                                        </div>
                                        {fieldErrors.cin && <p className="text-xs text-red-600 font-medium">{fieldErrors.cin}</p>}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-5">
                                <h3 className="text-md font-bold text-gray-800 border-b border-gray-100 pb-2">3. Document Vault</h3>

                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-gray-700">
                                        Identity Document <span className="text-red-500">*</span>
                                    </label>
                                    {/* 🆕 [PHASE B] `accept` restreint aux 3 formats autorisés au lieu de
                                        `image/*` : le sélecteur de fichiers du système filtre directement,
                                        l'utilisateur ne peut plus choisir un format qui sera refusé ensuite. */}
                                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" ref={idCardInputRef} onChange={handleFileChange} disabled={loading} />
                                    <div
                                        onClick={() => !loading && idCardInputRef.current?.click()}
                                        className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center h-48 relative overflow-hidden transition-colors ${loading ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer group'} ${fieldErrors.idCardFile ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-gray-50 hover:bg-blue-50 hover:border-blue-400'}`}
                                    >
                                        {idCardPreview ? (
                                            <>
                                                <img src={idCardPreview} alt="ID Preview" className="absolute inset-0 w-full h-full object-cover" />
                                                {!loading && (
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <p className="text-white text-sm font-bold">Change Image</p>
                                                    </div>
                                                )}
                                                {!loading && (
                                                    <button type="button" onClick={removeFile} className="absolute top-2 right-2 bg-white/90 p-1.5 rounded-full hover:bg-red-500 hover:text-white transition-colors">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <div className={`w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center mb-3 transition-transform ${!loading && 'group-hover:scale-110'}`}>
                                                    <FileText className={`w-5 h-5 ${fieldErrors.idCardFile ? 'text-red-500' : 'text-gray-400'} ${!loading && 'group-hover:text-blue-600'}`} />
                                                </div>
                                                <p className="text-sm font-bold text-gray-700 mb-1">Upload Front ID</p>
                                                {/* 🆕 Texte aligné sur la vraie limite (4 Mo, pas 5) */}
                                                <p className="text-xs text-gray-500">JPG, PNG or WebP up to 4MB</p>
                                            </>
                                        )}
                                    </div>
                                    {fieldErrors.idCardFile && <p className="text-xs text-red-600 font-medium text-center">{fieldErrors.idCardFile}</p>}
                                </div>
                            </div>

                            {/* ================================================================
                                🆕 [PHASE C — LIVENESS] SECTION DÉDIÉE, ET NON UNE CASE PARMI
                                D'AUTRES DANS "DOCUMENT VAULT"
                                ================================================================
                                💡 POURQUOI SA PROPRE SECTION : la séquence n'est pas un fichier
                                à joindre, c'est un ACTE que le client doit accomplir devant
                                l'agent. La ranger à côté de l'upload de la pièce d'identité
                                laisserait croire qu'il s'agit d'une formalité équivalente, alors
                                qu'elle demande la présence physique de la personne. */}
                            <div className="flex flex-col gap-5">
                                <h3 className="text-md font-bold text-gray-800 border-b border-gray-100 pb-2">
                                    4. Physical Presence Check <span className="text-red-500">*</span>
                                </h3>

                                <p className="text-xs text-gray-500 leading-relaxed -mt-2">
                                    The applicant must be sitting in front of this camera. They will be asked
                                    to hold two poses chosen at random by the server. A photograph or a screen
                                    cannot perform them.
                                </p>

                                {/* ⚠️ `disabled={loading}` EST INDISPENSABLE : sans lui, l'agent
                                    pourrait relancer une séquence pendant la soumission. Le composant
                                    effacerait alors les images dont les chemins viennent d'être
                                    transmis au serveur — qui se retrouverait à télécharger des
                                    fichiers supprimés. */}
                                <LivenessCapture onResult={handleLivenessResult} disabled={loading} />

                                {fieldErrors.liveness && (
                                    <p className="text-xs text-red-600 font-medium text-center">{fieldErrors.liveness}</p>
                                )}
                            </div>

                            <div className="flex flex-col gap-4 bg-gray-50 p-5 rounded-xl border border-gray-200 mt-2">
                                <h3 className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-1">System Processing Settings</h3>

                                <div className="flex flex-col sm:flex-row gap-5">
                                    <div className="flex-1 flex flex-col gap-2">
                                        <label className="text-xs font-semibold text-gray-700">Procedure Type</label>
                                        <div className="relative">
                                            <Shield className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                            <select value={type} onChange={(e) => setType(e.target.value)} disabled={loading} className="w-full border border-gray-300 bg-white rounded-lg py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500 text-gray-800 cursor-pointer disabled:bg-gray-50">
                                                <option value="Individual KYC (Standard)">Individual KYC (Standard)</option>
                                                <option value="Individual KYC (Enhanced)">Individual KYC (Enhanced - Biometrics)</option>
                                                <option value="Corporate KYB (Standard)">Corporate KYB (Standard)</option>
                                                <option value="Corporate KYB (UBO)">Corporate KYB (UBO Discovery)</option>
                                                <option value="AML/PEP Screening">AML & Sanctions Screening</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="hidden sm:block flex-1"></div>
                                </div>
                            </div>

                            <button type="submit" disabled={loading} className="mt-4 flex items-center justify-center gap-2 w-full px-6 py-3.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                                {loading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        {loadingText || "Processing..."}
                                    </>
                                ) : (
                                    <>
                                        <PlusCircle className="w-5 h-5" /> Initiate Verification Pipeline
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}