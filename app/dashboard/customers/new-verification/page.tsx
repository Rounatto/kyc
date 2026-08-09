"use client";

// ============================================================================
// 🆕 FORMULAIRE DE NOUVELLE VÉRIFICATION KYC — LE CŒUR DU PRODUIT
// ============================================================================
// Flux complet : formulaire d'identité → upload pièce d'identité + selfie
// (Supabase Storage, bucket PRIVÉ) → comparaison biométrique locale
// (face-api.js, dans le navigateur) → POST /api/customers qui relance TOUT le
// pipeline serveur (OCR, AML, moteur de règles — voir Lot 4) avec le score
// biométrique déjà calculé ici comme simple donnée d'entrée.
//
// ✅ [PHASE B — RÉSOLU] Les documents ne partent plus sur uploadthing derrière
// des URLs publiques et permanentes. Ils vont dans un bucket Supabase privé, et
// ce formulaire ne manipule plus que des CHEMINS (`idCardPath`/`selfiePath`) —
// des coordonnées internes non adressables, inutilisables sans une URL signée
// délivrée par le serveur après contrôle du companyId.
//
// 🚨 FAILLE LIVENESS TOUJOURS PRÉSENTE (Phase C, non traitée ici) :
// aucune trace de `getUserMedia`, de `<video>` ou de capture caméra en direct
// dans ce fichier. Le "selfie" reste un `<input type="file">` classique —
// EXACTEMENT le même mécanisme que l'upload de la pièce d'identité.
// Concrètement : n'importe qui peut uploader une photo trouvée en ligne de la
// personne à la place d'un vrai selfie, et `compareFaces` comparera gentiment
// deux fichiers statiques sans jamais savoir si un humain était devant un
// appareil photo. Il n'y a ni challenge-response (tourner la tête, cligner des
// yeux), ni détection d'écran/photo-d'une-photo (anti-spoofing). C'est le plus
// gros écart restant avec un vrai acteur KYC (Sumsub, Onfido, Veriff).
//
// Autre détail : le sélecteur "Procedure Type" propose "Individual KYC
// (Enhanced - Biometrics)" comme option distincte de "Standard", mais AUCUNE
// branche du code ne change de comportement selon cette valeur — la
// comparaison faciale (`compareFaces`) s'exécute de toute façon dans tous les
// cas où un selfie est fourni. Le champ est cosmétique, envoyé tel quel au
// serveur (`type`) sans influencer la logique de vérification.
import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { User, Mail, Shield, ArrowLeft, PlusCircle, CreditCard, Calendar, Globe, AlertTriangle, FileText, Camera, X, Lock, Zap, Languages } from "lucide-react";
import Link from "next/link";
import Header from "@/components/header";
import { toast } from "sonner";
import { getCountries, getCountryCallingCode } from 'react-phone-number-input/input';
import en from 'react-phone-number-input/locale/en';

import * as faceapi from 'face-api.js';

// ============================================================================
// 🆕 [PHASE B] CONTRAINTES DE FICHIER — ALIGNÉES SUR LE BUCKET SUPABASE
// ============================================================================
// ⚠️ Ces deux constantes doivent rester COHÉRENTES avec la configuration du
// bucket `kyc-documents` dans le dashboard Supabase (taille max + types MIME
// autorisés). L'ancienne version validait 5 Mo côté client alors qu'uploadthing
// plafonnait à 4 Mo : un fichier entre les deux passait la vérification visuelle
// puis échouait au transfert, avec un message d'erreur incompréhensible.
//
// 💡 Ces vérifications ne PROTÈGENT rien — un appel direct à l'API les
// contournerait. Elles servent uniquement au confort : donner un retour
// immédiat plutôt que de laisser l'utilisateur attendre le rejet du serveur.
// La vraie barrière est configurée au niveau du bucket, côté Supabase.
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024; // 4 Mo

// ⚠️ image/svg+xml est délibérément ABSENT. Un SVG est un document XML qui peut
// embarquer du JavaScript : servi un jour depuis notre domaine, il deviendrait
// un vecteur d'attaque XSS. L'ancienne vérification `file.type.startsWith('image/')`
// l'acceptait sans broncher. Seuls des formats raster sont autorisés — ils sont
// incapables de porter du code exécutable.
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
    const [selfieFile, setSelfieFile] = useState<File | null>(null);
    const [selfiePreview, setSelfiePreview] = useState<string | null>(null);

    const idCardInputRef = useRef<HTMLInputElement>(null);
    const selfieInputRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(false);
    const [loadingText, setLoadingText] = useState("");
    const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
    const [globalError, setGlobalError] = useState("");

    // 💡 NOUVEAU : ETATS DU PAYWALL (BILLING)
    const [isCheckingQuota, setIsCheckingQuota] = useState(true);
    const [quotaReached, setQuotaReached] = useState(false);
    const [usageStats, setUsageStats] = useState({ current: 0, limit: 5 });

    const callingCode = nationality ? getCountryCallingCode(nationality as any) : "";

    // Au montage : vérifie d'abord le quota (paywall) — si l'entreprise a
    // atteint sa limite, on affiche le mur de paiement SANS charger les
    // modèles d'IA (inutile de télécharger plusieurs Mo de réseaux de
    // neurones si l'utilisateur ne pourra de toute façon rien soumettre).
    useEffect(() => {
        const initializePage = async () => {
            try {
                // 1. Vérification du Billing (Paywall Check)
                const quotaRes = await fetch("/api/billing/quota");
                if (quotaRes.ok) {
                    const quotaData = await quotaRes.json();
                    setUsageStats({ current: quotaData.current, limit: quotaData.limit });
                    if (quotaData.isLocked) {
                        setQuotaReached(true);
                        setIsCheckingQuota(false);
                        return; // On stoppe ici, inutile de charger l'IA si c'est bloqué
                    }
                }
                
                setIsCheckingQuota(false);

                // 2. Chargement de l'IA (Seulement si le quota le permet) : 3 réseaux
                // de neurones pré-entraînés servis en fichiers statiques depuis
                // /public/models — détection de visage (SSD MobileNet), 68 points
                // de repère du visage (landmarks), et l'encodeur qui transforme un
                // visage en vecteur numérique (descriptor) comparable mathématiquement.
                await Promise.all([
                    faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
                    faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
                    faceapi.nets.faceRecognitionNet.loadFromUri('/models')
                ]);
                console.log("✅ Deep Learning Vision Models loaded successfully.");
            } catch (err) {
                console.error("⚠️ System initialization error", err);
                setIsCheckingQuota(false);
            }
        };
        initializePage();
    }, []);

    // ========================================================================
    // 🆕 [PHASE B] ENVOI D'UN DOCUMENT VERS LE BUCKET PRIVÉ — EN 2 TEMPS
    // ========================================================================
    // Remplace `startUpload` d'uploadthing. Le mécanisme est différent et vaut
    // la peine d'être compris :
    //
    //   TEMPS 1 — On demande une AUTORISATION à notre serveur. Il vérifie la
    //   session, calcule lui-même le chemin de destination à partir du
    //   companyId, et renvoie une URL d'écriture signée valable 15 minutes.
    //   Le navigateur ne choisit JAMAIS où le fichier atterrit : il est donc
    //   structurellement incapable d'écrire dans le dossier d'une autre
    //   entreprise, même en manipulant la requête.
    //
    //   TEMPS 2 — Le fichier part DIRECTEMENT du navigateur vers Supabase.
    //   Il ne transite jamais par notre application.
    //
    // 💡 POURQUOI CE DÉTOUR : Vercel plafonne le corps d'une requête serverless
    // à 4,5 Mo. Nos fichiers montent à 4 Mo, et l'encodage multipart réduit
    // encore la marge — on frôlerait l'échec en permanence. Faire transiter le
    // fichier par une fonction serverless imposerait aussi de le charger
    // entièrement en mémoire et de payer le temps d'exécution du transfert.
    //
    // Retourne le CHEMIN du fichier (ex: "cmp_a1b2/9f8e-idcard.jpg"), à joindre
    // au formulaire. Ce n'est pas une URL : sans domaine ni protocole, et avec
    // un bucket privé, il n'est pas adressable.
    const uploadDocument = async (file: File, kind: "idcard" | "selfie"): Promise<string> => {
        // --- TEMPS 1 : obtenir l'autorisation ---
        const authRes = await fetch("/api/kyc-documents/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, contentType: file.type }),
        });

        if (!authRes.ok) {
            const data = await authRes.json().catch(() => ({} as any));
            // 💡 On remonte le message du serveur tel quel : il est déjà précis
            // (type non autorisé, quota de demandes dépassé, session expirée...).
            // En inventer un ici masquerait la vraie cause à l'utilisateur.
            throw new Error(data.error || "Impossible de préparer l'envoi du document.");
        }

        const { signedUrl, path } = await authRes.json();

        // --- TEMPS 2 : envoyer le fichier directement à Supabase ---
        // Un simple PUT sur l'URL signée, avec le fichier brut en corps de
        // requête. Aucune clé Supabase n'est nécessaire côté navigateur : la
        // signature contenue dans l'URL fait office d'autorisation, et elle ne
        // vaut que pour CE chemin précis, pendant 15 minutes.
        const uploadRes = await fetch(signedUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type },
            body: file,
        });

        if (!uploadRes.ok) {
            // On journalise le détail technique en console pour le débogage,
            // mais l'utilisateur reçoit un message actionnable.
            console.error(
                "[UPLOAD] Échec du transfert :",
                uploadRes.status,
                await uploadRes.text().catch(() => "")
            );
            throw new Error("Le transfert du document a échoué. Vérifiez votre connexion et réessayez.");
        }

        return path;
    };

    // Compare le visage détecté sur la pièce d'identité et celui du "selfie"
    // (rappel : n'importe quelle image uploadée, pas forcément une vraie
    // capture live — voir la note en tête de fichier).
    //
    // 💡 Les deux paramètres sont des URLs `blob:` LOCALES, créées par
    // URL.createObjectURL() dans handleFileChange — jamais des adresses
    // distantes. La comparaison se fait donc entièrement en mémoire, sans le
    // moindre téléchargement. C'est aussi ce qui la rend compatible avec le
    // stockage privé : le navigateur n'a jamais besoin de relire le fichier
    // depuis Supabase.
    //
    // Les images sont chargées comme de simples <img> DOM (pas de flux vidéo),
    // passées au détecteur, puis chaque visage est réduit à un "descriptor"
    // (vecteur de 128 nombres qui encode les traits du visage). La distance
    // euclidienne entre les deux vecteurs mesure la dissemblance ; elle est
    // ensuite transformée en un score de similarité 0-100% via une formule
    // linéaire calibrée empiriquement (distance de 1.2 ≈ 0% de similarité).
    // Retourne `null` si un visage n'est détecté sur aucune des deux images
    // (traité côté serveur comme "vérification biométrique ignorée").
    const compareFaces = async (idUrl: string, selfieUrl: string): Promise<number | null> => {
        try {
            // 💡 `crossOrigin` n'a plus d'utilité avec des URLs blob: locales
            // (aucune requête réseau, donc aucune politique CORS en jeu). On le
            // conserve : inoffensif, et utile si un jour on repasse par une URL
            // distante signée.
            const idImg = new Image(); idImg.src = idUrl; idImg.crossOrigin = "anonymous";
            const selfieImg = new Image(); selfieImg.src = selfieUrl; selfieImg.crossOrigin = "anonymous";

            await Promise.all([
                new Promise((resolve, reject) => { idImg.onload = resolve; idImg.onerror = reject; }),
                new Promise((resolve, reject) => { selfieImg.onload = resolve; selfieImg.onerror = reject; })
            ]);

            const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 });

            const idFace = await faceapi.detectSingleFace(idImg, options).withFaceLandmarks().withFaceDescriptor();
            const selfieFace = await faceapi.detectSingleFace(selfieImg, options).withFaceLandmarks().withFaceDescriptor();

            if (!idFace || !selfieFace) return null;

            const distance = faceapi.euclideanDistance(idFace.descriptor, selfieFace.descriptor);
            let similarity = Math.max(0, Math.min(100, (1 - (distance / 1.2)) * 100));

            return similarity;
        } catch (err) {
            console.error("❌ Erreur critique dans le moteur biométrique :", err);
            return null;
        }
    };

    // Validation client seulement — un attaquant appelant /api/customers
    // directement (sans passer par ce formulaire) contournerait tout ceci,
    // mais le serveur revalide indépendamment via Zod (voir customers/route.ts,
    // Lot 4), donc cette couche n'est là que pour le confort/feedback utilisateur.
    // Les règles de format (CIN/passeport/téléphone) sont spécifiques par pays
    // (ex: CIN tunisienne = exactement 8 chiffres) avec un repli générique
    // pour les nationalités non explicitement gérées.
    const validateForm = () => {
        const errors: { [key: string]: string } = {};
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) errors.email = "Invalid email format.";
        // 🆕 [ARABE] Si le champ est rempli, il DOIT contenir de l'arabe.
        //
        // ⚠️ CE QUE ÇA ÉVITE : un agent pressé pourrait y retaper le nom latin
        // par réflexe. Le serveur détecterait alors l'absence de caractères
        // arabes et retomberait sur la comparaison latine — reproduisant
        // exactement le bug d'origine, mais de façon invisible : le champ
        // paraîtrait rempli alors qu'il ne sert à rien.
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
        if (!selfieFile) errors.selfieFile = "Selfie verification is required.";

        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: "idCard" | "selfie") => {
        const file = e.target.files?.[0];
        if (!file) return;

        // 🆕 [PHASE B] LISTE BLANCHE STRICTE au lieu de `startsWith('image/')`.
        // L'ancienne vérification acceptait image/svg+xml, image/gif, et tout
        // autre format exotique. On n'autorise plus que trois formats raster,
        // exactement ceux acceptés par la route d'autorisation d'upload et par
        // le bucket lui-même.
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            setGlobalError("Unsupported format. Please upload a JPEG, PNG or WebP image.");
            return;
        }

        // 🆕 [PHASE B] 4 Mo — aligné sur la limite du bucket Supabase.
        // Avant : 5 Mo ici contre 4 Mo côté serveur, donc un fichier de 4,5 Mo
        // passait cette vérification puis échouait au transfert avec un message
        // opaque. Les deux valeurs sont désormais cohérentes.
        if (file.size > MAX_FILE_SIZE_BYTES) {
            setGlobalError("File size must be under 4MB.");
            return;
        }

        setGlobalError("");

        // 💡 Cette URL `blob:` sert à DEUX choses : l'aperçu affiché dans le
        // formulaire, et l'analyse biométrique (compareFaces). Elle pointe vers
        // la mémoire du navigateur, jamais vers le réseau.
        const previewUrl = URL.createObjectURL(file);

        if (type === "idCard") {
            setIdCardFile(file);
            setIdCardPreview(previewUrl);
            setFieldErrors(prev => ({ ...prev, idCardFile: "" }));
        } else {
            setSelfieFile(file);
            setSelfiePreview(previewUrl);
            setFieldErrors(prev => ({ ...prev, selfieFile: "" }));
        }
    };

    const removeFile = (type: "idCard" | "selfie", e: React.MouseEvent) => {
        e.stopPropagation(); 
        if (type === "idCard") {
            setIdCardFile(null);
            setIdCardPreview(null);
            if (idCardInputRef.current) idCardInputRef.current.value = "";
        } else {
            setSelfieFile(null);
            setSelfiePreview(null);
            if (selfieInputRef.current) selfieInputRef.current.value = "";
        }
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
                
                // 🆕 [PHASE B] On récupère des CHEMINS, plus des URLs.
                // La différence est fondamentale : une URL est directement
                // adressable (la coller dans un navigateur affiche le fichier),
                // un chemin ne l'est pas. C'est tout l'objet du correctif.
                let uploadedIdCardPath = "";
                let uploadedSelfiePath = "";

                // 💡 Les deux envois sont lancés EN PARALLÈLE (Promise.all) au
                // lieu de l'un après l'autre comme avant. Deux transferts de
                // 4 Mo en série sur une connexion mobile, c'est une attente
                // deux fois plus longue pour rien : ils sont indépendants.
                if (idCardFile && selfieFile) {
                    const [idPath, selfiePath] = await Promise.all([
                        uploadDocument(idCardFile, "idcard"),
                        uploadDocument(selfieFile, "selfie"),
                    ]);
                    uploadedIdCardPath = idPath;
                    uploadedSelfiePath = selfiePath;
                }

                if (!uploadedIdCardPath || !uploadedSelfiePath) {
                    throw new Error("Document upload failed. Please try again.");
                }

                // Le score biométrique est calculé ICI, entièrement dans le
                // navigateur, à partir des fichiers LOCAUX, puis envoyé au
                // serveur dans le body JSON juste en dessous. Le serveur
                // (customers/route.ts) fait confiance à ce chiffre tel quel —
                // c'est le point d'origine exact de la faille "biometricScore
                // contournable" : rien n'empêche d'intercepter cette requête et
                // de remplacer la valeur calculée par 99.9 avant l'envoi.
                // ⚠️ Correction prévue en Phase C (recalcul côté serveur), en
                // même temps que le liveness.
                setLoadingText("Executing Deep Learning Biometrics...");
                let biometricScore: number | null = null;
                if (idCardPreview && selfiePreview) {
                    biometricScore = await compareFaces(idCardPreview, selfiePreview);
                }

                setLoadingText("Analyzing AI Risk & Creating Profile...");
                
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
                        // 🆕 [PHASE B] `userId` retiré du corps de la requête.
                        // Le serveur dérive de toute façon l'identité de l'agent
                        // de la session (`guard.userId`) et ignorait déjà cette
                        // valeur. La laisser laissait croire que le client peut
                        // désigner l'auteur d'un dossier — exactement ce qu'on a
                        // corrigé côté serveur pour l'intégrité de la piste
                        // d'audit. Autant que le code dise la vérité.
                        idCardPath: uploadedIdCardPath,
                        selfiePath: uploadedSelfiePath,
                        biometricScore: biometricScore 
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
                                    L'agent recopie ce qu'il voit, il n'y a donc rien
                                    à deviner ni à maintenir.

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
                                
                                <div className="flex flex-col sm:flex-row gap-5">
                                    {/* Upload ID Card */}
                                    <div className="flex-1 flex flex-col gap-1">
                                        {/* 🆕 [PHASE B] `accept` restreint aux 3 formats autorisés au lieu de
                                            `image/*` : le sélecteur de fichiers du système filtre directement,
                                            l'utilisateur ne peut plus choisir un format qui sera refusé ensuite. */}
                                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" ref={idCardInputRef} onChange={(e) => handleFileChange(e, "idCard")} disabled={loading} />
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
                                                        <button type="button" onClick={(e) => removeFile("idCard", e)} className="absolute top-2 right-2 bg-white/90 p-1.5 rounded-full hover:bg-red-500 hover:text-white transition-colors">
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

                                    {/* Upload Selfie */}
                                    <div className="flex-1 flex flex-col gap-1">
                                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" ref={selfieInputRef} onChange={(e) => handleFileChange(e, "selfie")} disabled={loading} />
                                        <div 
                                            onClick={() => !loading && selfieInputRef.current?.click()}
                                            className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center h-48 relative overflow-hidden transition-colors ${loading ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer group'} ${fieldErrors.selfieFile ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-gray-50 hover:bg-blue-50 hover:border-blue-400'}`}
                                        >
                                            {selfiePreview ? (
                                                <>
                                                    <img src={selfiePreview} alt="Selfie Preview" className="absolute inset-0 w-full h-full object-cover" />
                                                    {!loading && (
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <p className="text-white text-sm font-bold">Change Image</p>
                                                        </div>
                                                    )}
                                                    {!loading && (
                                                        <button type="button" onClick={(e) => removeFile("selfie", e)} className="absolute top-2 right-2 bg-white/90 p-1.5 rounded-full hover:bg-red-500 hover:text-white transition-colors">
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <div className={`w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center mb-3 transition-transform ${!loading && 'group-hover:scale-110'}`}>
                                                        <Camera className={`w-5 h-5 ${fieldErrors.selfieFile ? 'text-red-500' : 'text-gray-400'} ${!loading && 'group-hover:text-blue-600'}`} />
                                                    </div>
                                                    <p className="text-sm font-bold text-gray-700 mb-1">Upload Selfie</p>
                                                    <p className="text-xs text-gray-500">JPG, PNG or WebP file</p>
                                                </>
                                            )}
                                        </div>
                                        {fieldErrors.selfieFile && <p className="text-xs text-red-600 font-medium text-center">{fieldErrors.selfieFile}</p>}
                                    </div>
                                </div>
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

                            <button type="submit" disabled={loading} className="mt-4 flex items-center justify-center gap-2 w-full px-6 py-3.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 cursor-not-allowed text-sm">
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