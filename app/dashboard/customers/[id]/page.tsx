"use client";

// ============================================================================
// 🔍 ÉCRAN DE DÉTAIL D'UN DOSSIER KYC — "VERIFICATION STUDIO" DE L'AGENT
// ============================================================================
// Vue complète d'un dossier (documents, métadonnées, score IA, audit trail)
// + les 2 actions qui appellent PATCH /api/customers/[id] : approuver
// (`handleDecision("verified")`) ou rejeter avec un motif (modale dédiée,
// motifs prédéfinis + option "Custom Reason"). `params` est une Promise (pas
// un objet direct) car ce projet utilise le nouveau modèle asynchrone des
// route params de Next.js — d'où le hook `use(params)` pour la déballer.
//
// 🆕 [PHASE B] Les documents ne sont plus servis par des URLs publiques
// permanentes. Le serveur renvoie désormais `idCardDisplayUrl`/`selfieDisplayUrl` :
// des liens SIGNÉS vers un bucket privé, valables 5 minutes seulement, et
// délivrés uniquement après vérification que l'agent appartient bien à
// l'entreprise propriétaire du dossier. Voir la note sur l'expiration plus bas.
//
// 🆕 [CONFORMITÉ] Le motif de rejet est désormais DÉDOUBLÉ : un texte interne
// pour la piste d'audit, un texte séparé pour l'email au client. Voir le bloc
// PREDEFINED_REASONS ci-dessous — c'est une obligation légale, pas un confort.
//
// ⚠️ Le "Verification Studio" (modale plein écran de comparaison zoomable)
// étiquette la photo du selfie "Live Selfie" — mais comme documenté dans
// new-verification/page.tsx, ce n'est PAS une capture live, c'est un fichier
// uploadé comme un autre. Ce libellé renforce une fausse impression de preuve
// de vie pour l'agent qui prend la décision. (Correction prévue en Phase C.)
import { useState, useEffect, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Loader2, Check, X, FileText, ShieldAlert, User, Clock, History, Maximize2, ZoomIn, ZoomOut, RotateCcw, AlertCircle, ShieldCheck, Mail, Phone, Calendar, Flag, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import Header from "@/components/header";
import { toast } from "sonner";

// ============================================================================
// 🆕 [CONFORMITÉ] MOTIFS DE REJET — DEUX TEXTES PAR MOTIF
// ============================================================================
// Chaque motif porte désormais DEUX formulations distinctes :
//   • `label`           → ce que voit l'agent, et ce qui part dans l'audit trail
//   • `customerMessage` → ce que reçoit réellement le client par email
//
// ⚠️ POURQUOI CETTE SÉPARATION EST OBLIGATOIRE, PAS COSMÉTIQUE :
// pour un rejet lié à des sanctions financières ou à une suspicion de
// blanchiment, la plupart des juridictions INTERDISENT de révéler la raison à
// la personne concernée. C'est le "tipping off" — l'avertir qu'elle fait
// l'objet d'un signalement — et c'est un DÉLIT PÉNAL, en Tunisie comme dans
// l'UE. Jusqu'ici, le motif sélectionné partait tel quel dans l'email : un
// agent choisissant "correspondance sur liste de sanctions" mettait l'entreprise
// cliente en infraction sans le savoir.
//
// 💡 Pour la majorité des motifs (document flou, expiré, nom incorrect), les
// deux textes disent la même chose. Aucune raison de cacher quoi que ce soit —
// au contraire, l'information aide le client à corriger et à resoumettre.
//
// 💡 `category` sert uniquement à regrouper visuellement les motifs dans la
// modale. Avec douze entrées, une liste plate serait illisible.
type RejectionReason = {
    id: string;
    category: "Document Quality" | "Data Mismatch" | "Fraud Indicators" | "Compliance";
    label: string;
    customerMessage: string;
    // `true` = la vraie raison ne doit JAMAIS atteindre le client.
    isConfidential?: boolean;
};

const PREDEFINED_REASONS: RejectionReason[] = [
    // ── QUALITÉ DU DOCUMENT ──
    // Ces motifs sont entièrement transparents : plus le client comprend ce qui
    // n'allait pas, plus sa seconde tentative a de chances d'aboutir.
    {
        id: "doc-unreadable",
        category: "Document Quality",
        label: "The provided ID document is blurry, pixelated or unreadable.",
        customerMessage: "The provided ID document is blurry, pixelated or unreadable.",
    },
    {
        id: "doc-cropped",
        category: "Document Quality",
        label: "The edges of the document are cropped or cut off.",
        customerMessage: "The edges of the document are cropped or cut off.",
    },
    {
        id: "doc-expired",
        category: "Document Quality",
        label: "The identification document has expired.",
        customerMessage: "The identification document has expired.",
    },
    {
        id: "selfie-unusable",
        category: "Document Quality",
        // 🆕 Motif absent jusqu'ici alors que le cas est fréquent : le moteur
        // biométrique renvoie `null` quand aucun visage exploitable n'est
        // détecté (photo trop sombre, de profil, visage partiellement masqué).
        // L'agent n'avait aucun motif correspondant à cocher.
        label: "No usable face could be detected in the selfie.",
        customerMessage: "We could not detect a clear face in your selfie. Please retake it in good lighting, facing the camera directly.",
    },

    // ── INCOHÉRENCE DES DONNÉES ──
    // 🆕 Le moteur OCR compare déjà le nom ET le numéro de document saisis au
    // texte réellement extrait de l'image. Seul le nom avait un motif ; les
    // deux autres cas obligeaient l'agent à écrire un texte libre.
    {
        id: "name-mismatch",
        category: "Data Mismatch",
        label: "The name on the document does not match the registered profile name.",
        customerMessage: "The name on the document does not match the name provided in your application.",
    },
    {
        id: "number-mismatch",
        category: "Data Mismatch",
        label: "The document number does not match the ID number provided.",
        customerMessage: "The document number does not match the ID number provided in your application.",
    },
    {
        id: "dob-mismatch",
        category: "Data Mismatch",
        label: "The date of birth does not match the document.",
        customerMessage: "The date of birth provided does not match your identification document.",
    },
    {
        id: "face-mismatch",
        category: "Data Mismatch",
        label: "The face on the identification document does not match the biometric selfie.",
        customerMessage: "The face on your identification document does not sufficiently match the selfie provided.",
    },

    // ── INDICES DE FRAUDE ──
    // 🆕 Catégorie entièrement absente, alors que ce sont les deux cas de
    // fraude documentaire les plus courants.
    //
    // ⚠️ Message client volontairement ADOUCI : accuser explicitement quelqu'un
    // de falsification par email est juridiquement risqué (diffamation) et
    // inutile. On énonce le fait constaté — le document ne peut pas être
    // authentifié — sans qualifier l'intention. La formulation précise reste
    // dans l'audit trail.
    {
        id: "doc-tampered",
        category: "Fraud Indicators",
        label: "The document shows signs of alteration or tampering.",
        customerMessage: "We were unable to authenticate the document provided. Please submit an original, unaltered document.",
    },
    {
        id: "doc-not-original",
        category: "Fraud Indicators",
        label: "The submitted file appears to be a photocopy or a screenshot, not an original.",
        customerMessage: "The file submitted appears to be a photocopy or a screen capture. Please provide a photograph of the original physical document.",
    },

    // ── CONFORMITÉ — LA VRAIE RAISON NE SORT JAMAIS ──
    // 🆕 Catégorie critique et totalement absente jusqu'ici, alors que le moteur
    // de règles DÉTECTE DÉJÀ ces trois cas : correspondance sur listes de
    // sanctions, statut de personne politiquement exposée, et minorité (règle
    // hard_kill). L'agent devait donc rédiger un texte libre sur les dossiers
    // les plus sensibles juridiquement de tout le produit.
    //
    // 🔒 `isConfidential: true` : ces motifs déclenchent un message client
    // strictement générique, IDENTIQUE pour les deux. C'est délibéré — si les
    // messages différaient, on pourrait déduire la raison par recoupement, ce
    // qui reviendrait au même problème.
    {
        id: "aml-sanctions",
        category: "Compliance",
        label: "Sanctions or watchlist match confirmed after review.",
        customerMessage: "We are unable to complete your verification at this time. Please contact our support team for assistance.",
        isConfidential: true,
    },
    {
        id: "pep-review",
        category: "Compliance",
        label: "Politically Exposed Person — enhanced due diligence not satisfied.",
        customerMessage: "We are unable to complete your verification at this time. Please contact our support team for assistance.",
        isConfidential: true,
    },
    {
        id: "underage",
        category: "Compliance",
        // 💡 Seule exception de cette catégorie : la minorité n'a rien de
        // confidentiel, elle relève d'une condition d'éligibilité publique.
        // Le client a le droit — et l'intérêt — de la connaître.
        label: "Applicant is below the minimum age requirement.",
        customerMessage: "You do not currently meet the minimum age requirement to use this service.",
    },
];

// Regroupement par catégorie, calculé une seule fois au chargement du module
// plutôt qu'à chaque rendu de la modale.
const REASON_CATEGORIES = Array.from(
    new Set(PREDEFINED_REASONS.map((r) => r.category))
);

// 🆕 [PHASE B] Nombre maximal de renouvellements automatiques des liens.
// Garde-fou anti-boucle infinie : si les liens fraîchement obtenus échouent
// eux aussi, le problème n'est pas l'expiration (fichier supprimé du bucket,
// Supabase indisponible, réseau coupé). Réessayer indéfiniment ne ferait que
// marteler le serveur sans jamais afficher l'image.
const MAX_URL_REFRESH_ATTEMPTS = 2;

export default function CustomerReviewPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const customerId = resolvedParams.id;
    
    const { data: session } = useSession(); 
    const router = useRouter();

    const [customer, setCustomer] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // États pour le "Verification Studio"
    const [isViewerOpen, setIsViewerOpen] = useState(false);
    const [idZoom, setIdZoom] = useState(1);
    const [selfieZoom, setSelfieZoom] = useState(1);

    // 🆕 [PHASE B] Suivi du renouvellement des liens signés
    const [isRefreshingUrls, setIsRefreshingUrls] = useState(false);
    const [urlRefreshAttempts, setUrlRefreshAttempts] = useState(0);

    // États pour la Modal de Rejet
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    // 🆕 On stocke désormais l'OBJET motif entier, plus une simple chaîne.
    // C'est ce qui permet d'accéder à la fois au `label` (pour l'audit) et au
    // `customerMessage` (pour l'email) au moment de l'envoi.
    const [selectedReason, setSelectedReason] = useState<RejectionReason>(PREDEFINED_REASONS[0]);
    const [customReason, setCustomReason] = useState("");
    const [isCustom, setIsCustom] = useState(false);

    useEffect(() => {
        async function loadCustomer() {
            try {
                const res = await fetch(`/api/customers/${customerId}`);
                if (res.ok) setCustomer(await res.json());
                else router.push("/dashboard/customers");
            } catch (err) { 
                console.error("Loading error", err); 
            } finally { 
                setLoading(false); 
            }
        }
        loadCustomer();
    }, [customerId, router]);

    // ========================================================================
    // 🆕 [PHASE B] RENOUVELLEMENT AUTOMATIQUE DES LIENS EXPIRÉS
    // ========================================================================
    // LE PROBLÈME QUE ÇA RÉSOUT, ET IL EST BIEN RÉEL :
    // les liens signés expirent au bout de 5 minutes. Or un agent de conformité
    // ne consulte pas un dossier en 30 secondes — il lit le score, parcourt
    // l'audit trail, réfléchit, va chercher un collègue, puis ouvre le
    // Verification Studio pour comparer les visages. Quinze minutes plus tard,
    // les liens obtenus au chargement de la page sont morts depuis longtemps :
    // les images ne s'afficheraient plus, sans la moindre explication.
    //
    // LA PARADE : quand une image échoue à charger, on redemande simplement au
    // serveur des liens frais. Le serveur revérifie la session et le companyId
    // au passage — ce n'est donc pas un contournement du contrôle d'accès, c'est
    // exactement le même chemin que le chargement initial.
    //
    // 💡 On ne met à jour QUE les deux liens, pas tout l'objet `customer` : le
    // statut ou l'audit trail pourraient avoir changé entre-temps (une décision
    // prise dans un autre onglet), et les écraser silencieusement ferait
    // disparaître de l'écran quelque chose que l'agent vient peut-être de faire.
    //
    // ⚠️ CHOIX ASSUMÉ : cette approche est RÉACTIVE (on attend l'échec) plutôt
    // que PROACTIVE (renouveler avant expiration via un minuteur). Conséquence :
    // l'agent peut voir brièvement une image cassée avant qu'elle ne réapparaisse.
    // C'est le compromis retenu — un minuteur exigerait de suivre l'heure de
    // chargement, de gérer son nettoyage, et de rafraîchir même quand personne
    // ne regarde. Pour un gain d'une fraction de seconde, ça ne vaut pas la
    // complexité ajoutée.
    const refreshDocumentUrls = async () => {
        if (isRefreshingUrls || urlRefreshAttempts >= MAX_URL_REFRESH_ATTEMPTS) return;

        setIsRefreshingUrls(true);
        setUrlRefreshAttempts((n) => n + 1);

        try {
            const res = await fetch(`/api/customers/${customerId}`);
            if (res.ok) {
                const fresh = await res.json();
                setCustomer((prev: any) =>
                    prev
                        ? {
                              ...prev,
                              idCardDisplayUrl: fresh.idCardDisplayUrl,
                              selfieDisplayUrl: fresh.selfieDisplayUrl,
                          }
                        : fresh
                );
            }
        } catch (err) {
            console.error("[DOCUMENTS] Échec du renouvellement des liens signés :", err);
        } finally {
            setIsRefreshingUrls(false);
        }
    };

    // 🆕 [CONFORMITÉ] Deux textes distincts au lieu d'un seul :
    //   `internalReason`  → piste d'audit, visible des agents uniquement
    //   `customerMessage` → contenu réel de l'email envoyé au client
    const handleDecision = async (
        newStatus: "verified" | "rejected",
        internalReason?: string,
        customerMessage?: string
    ) => {
        setActionLoading(newStatus);
        
        if (newStatus === "rejected") {
            setIsRejectModalOpen(false);
        }

        const actionPromise = new Promise(async (resolve, reject) => {
            try {
                const res = await fetch(`/api/customers/${customerId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        status: newStatus,
                        // 🆕 [PHASE B] `agentId` retiré du corps de la requête.
                        // Le serveur l'ignorait déjà et dérivait l'identité de la
                        // session (`serverAgentId`) — bon réflexe, jamais confiance
                        // au body pour dire QUI agit. L'envoyer quand même laissait
                        // croire l'inverse à quiconque lit ce code : que le client
                        // peut désigner l'auteur d'une décision de conformité.
                        //
                        // 🆕 [CONFORMITÉ] `rejectionReason` conserve son nom : c'est
                        // le motif INTERNE, celui qui alimente la piste d'audit. Le
                        // renommer aurait cassé la compatibilité avec la route sans
                        // aucun bénéfice.
                        rejectionReason: internalReason,
                        // 🆕 [CONFORMITÉ] Nouveau champ : le seul texte que le client
                        // verra. La route l'utilisera pour l'email, et n'enverra
                        // JAMAIS `rejectionReason` à l'extérieur.
                        customerMessage: customerMessage
                    }),
                });
                
                if (res.ok) {
                    const updatedCustomer = await res.json();
                    // ⚠️ La réponse du PATCH ne contient PAS les liens signés
                    // (seul le GET en fabrique). On préserve donc ceux déjà en
                    // mémoire, sans quoi les documents disparaîtraient de l'écran
                    // juste après une approbation ou un rejet.
                    setCustomer((prev: any) => ({
                        ...updatedCustomer,
                        idCardDisplayUrl: prev?.idCardDisplayUrl ?? null,
                        selfieDisplayUrl: prev?.selfieDisplayUrl ?? null,
                    }));
                    resolve(updatedCustomer);
                } else {
                    const errData = await res.json();
                    reject(errData.message || "Failed to update profile status.");
                }
            } catch (err) {
                reject("Network error. Please try again.");
            } finally {
                setActionLoading(null);
            }
        });

        toast.promise(actionPromise, {
            loading: `Updating compliance record to ${newStatus}...`,
            success: () => `Profile successfully ${newStatus === "verified" ? "approved" : "rejected"}!`,
            error: (err) => `${err}`,
        });
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center flex-col gap-4"><Loader2 className="animate-spin w-8 h-8 text-blue-600" /><p className="text-gray-500 font-medium">Loading compliance file...</p></div>;
    if (!customer) return <div className="min-h-screen flex items-center justify-center text-gray-500">Customer not found.</div>;

    const riskColors = {
        High: "bg-red-50 border-red-200 text-red-700",
        Medium: "bg-yellow-50 border-yellow-200 text-yellow-700",
        Low: "bg-green-50 border-green-200 text-green-700"
    };
    const currentRiskColor = riskColors[customer.riskLevel as keyof typeof riskColors] || riskColors.Medium;
    const isHighRisk = customer.riskLevel === "High";
    const isMediumRisk = customer.riskLevel === "Medium";

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            <Header />
            
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                
                {/* BACK BUTTON & EN-TÊTE PAGE */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <Link href="/dashboard/customers" className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-700 font-medium transition-colors w-max">
                        <ArrowLeft className="w-4 h-4" /> Back to Directory
                    </Link>
                </div>

                {/* 💡 LA NOUVELLE GRILLE RESPONSIVE */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    
                    {/* ============================================================ */}
                    {/* COLONNE GAUCHE (DOCUMENTS & METADATA) - Prend 8 colonnes sur 12 */}
                    {/* ============================================================ */}
                    <div className="lg:col-span-8 flex flex-col gap-6">
                        
                        {/* EN-TÊTE PROFIL */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold shrink-0 shadow-inner">
                                    {customer.customerName?.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="flex flex-col">
                                    <h1 className="text-2xl font-bold text-gray-900 leading-tight">{customer.customerName}</h1>
                                    <p className="text-sm text-gray-500 font-mono mt-0.5">Case ID: {customer.id}</p>
                                </div>
                            </div>
                            <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm border ${
                                customer.status === "verified" ? "bg-green-100 text-green-800 border-green-200" :
                                customer.status === "rejected" ? "bg-red-100 text-red-800 border-red-200" : "bg-yellow-100 text-yellow-800 border-yellow-200"
                            }`}>
                                {customer.status}
                            </span>
                        </div>

                        {/* DOCUMENTS */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-5">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-100 pb-4">
                                <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-gray-800">
                                    <FileText className="w-4 h-4 text-blue-600" /> Provided Documents
                                </h3>
                                {/* 🆕 [PHASE B] Condition basée sur les liens d'affichage, plus sur les anciennes URLs */}
                                {(customer.idCardDisplayUrl || customer.selfieDisplayUrl) && (
                                    <button onClick={() => setIsViewerOpen(true)} className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition-colors cursor-pointer w-full sm:w-auto justify-center">
                                        <Maximize2 className="w-3.5 h-3.5" /> Compare & Verify
                                    </button>
                                )}
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                {/* Front ID */}
                                <div className="flex flex-col gap-2">
                                    <p className="text-xs font-bold uppercase text-gray-500 pl-1">Front ID Document</p>
                                    <div className="border border-gray-200 rounded-xl bg-gray-50 h-56 relative overflow-hidden group">
                                        {customer.idCardDisplayUrl ? (
                                            <>
                                                {/* 🆕 onError : si le lien signé a expiré pendant que l'agent
                                                    consultait la page, on en redemande un frais au serveur. */}
                                                <Image src={customer.idCardDisplayUrl} alt="ID Card" fill className="object-cover transition-transform duration-500 group-hover:scale-105" unoptimized onError={refreshDocumentUrls} />
                                                <button onClick={() => setIsViewerOpen(true)} className="absolute inset-0 w-full h-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                                                    <div className="bg-white text-gray-900 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform shadow-lg">
                                                        <Maximize2 className="w-4 h-4" /> Open Studio
                                                    </div>
                                                </button>
                                            </>
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                                                <FileText className="w-8 h-8 mb-2 opacity-50" />
                                                <p className="text-xs font-medium">No document</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Selfie */}
                                <div className="flex flex-col gap-2">
                                    <p className="text-xs font-bold uppercase text-gray-500 pl-1">Biometric Selfie</p>
                                    <div className="border border-gray-200 rounded-xl bg-gray-50 h-56 relative overflow-hidden group">
                                        {customer.selfieDisplayUrl ? (
                                            <>
                                                <Image src={customer.selfieDisplayUrl} alt="Selfie" fill className="object-cover transition-transform duration-500 group-hover:scale-105" unoptimized onError={refreshDocumentUrls} />
                                                <button onClick={() => setIsViewerOpen(true)} className="absolute inset-0 w-full h-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                                                    <div className="bg-white text-gray-900 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform shadow-lg">
                                                        <Maximize2 className="w-4 h-4" /> Open Studio
                                                    </div>
                                                </button>
                                            </>
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                                                <User className="w-8 h-8 mb-2 opacity-50" />
                                                <p className="text-xs font-medium">No selfie</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* METADATA */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden p-6">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-800 mb-6 border-b border-gray-100 pb-3 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-blue-600" /> Applicant Metadata
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                <div className="flex items-start gap-3">
                                    <User className="w-5 h-5 text-gray-400 mt-0.5" />
                                    <div><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Full Name</p><p className="text-gray-900 font-medium mt-1">{customer.customerName}</p></div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <ShieldAlert className="w-5 h-5 text-gray-400 mt-0.5" />
                                    <div><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">ID Number (CIN)</p><p className="text-gray-900 font-medium mt-1">{customer.cin}</p></div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Mail className="w-5 h-5 text-gray-400 mt-0.5" />
                                    <div className="min-w-0 flex-1"><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Email Address</p><p className="text-gray-900 font-medium truncate mt-1" title={customer.email}>{customer.email}</p></div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                                    <div><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Date of Birth</p><p className="text-gray-900 font-medium mt-1">{customer.dateOfBirth || "N/A"}</p></div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Phone className="w-5 h-5 text-gray-400 mt-0.5" />
                                    <div><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Phone Number</p><p className="text-gray-900 font-medium mt-1">{customer.phoneNumber || "N/A"}</p></div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Flag className="w-5 h-5 text-gray-400 mt-0.5" />
                                    <div><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Nationality</p><p className="text-gray-900 font-medium mt-1">{customer.nationality || "N/A"}</p></div>
                                </div>
                            </div>
                        </div>

                        {/* AUDIT LOGS */}
                        {/* 🆕 [CONFORMITÉ] C'est ICI que le motif de rejet PRÉCIS apparaît.
                            L'agent y lit "Sanctions or watchlist match confirmed" tandis
                            que le client n'aura reçu qu'un message générique. Cette
                            asymétrie est exactement le but recherché. */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-6">
                            <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-gray-800 border-b border-gray-100 pb-3">
                                <History className="w-4 h-4 text-blue-600" /> System Audit Trail
                            </h3>
                            <div className="flex flex-col gap-5 pl-2">
                                {customer.auditLogs && customer.auditLogs.length > 0 ? (
                                    customer.auditLogs.map((log: any, index: number) => (
                                        <div key={log.id} className={`flex gap-5 relative border-l-2 ${index === customer.auditLogs.length - 1 ? 'border-transparent' : 'border-gray-200'} pl-6 pb-2`}>
                                            <span className={`absolute -left-[7px] top-1.5 w-3 h-3 rounded-full ring-4 ring-white ${
                                                log.action === "CREATED" ? "bg-blue-500" :
                                                log.action === "APPROVED" ? "bg-green-500" :
                                                log.action === "REJECTED" ? "bg-red-500" : "bg-gray-400"
                                            }`}></span>
                                            <div className="flex flex-col">
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                                                    <p className="text-sm font-bold text-gray-900">{log.action}</p>
                                                    <span className="text-[10px] text-gray-500 font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-100 flex items-center gap-1 w-max">
                                                        <Clock className="w-3 h-3" /> {new Date(log.timestamp).toLocaleString()}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{log.details}</p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-gray-500 italic bg-gray-50 p-4 rounded-lg border border-gray-100">No audit logs available for this profile.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ============================================================ */}
                    {/* COLONNE DROITE (IA & DÉCISIONS) - Prend 4 colonnes sur 12 */}
                    {/* ============================================================ */}
                    <div className="lg:col-span-4 flex flex-col gap-6 lg:sticky lg:top-6">
                        
                        {/* WIDGET : AI SCORE */}
                        <div className={`p-6 rounded-2xl border shadow-sm flex flex-col transition-colors ${currentRiskColor}`}>
                            <h3 className="text-sm font-bold uppercase tracking-wider mb-5 flex items-center gap-2">
                                {isHighRisk ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />} AI Risk Analysis
                            </h3>
                            <div className="flex items-baseline gap-1 mb-2">
                                <span className="text-7xl font-black tracking-tighter">{parseInt(customer.score)}</span>
                                <span className="text-2xl opacity-50 font-bold">/100</span>
                            </div>
                            <div className="flex items-center gap-2 mb-6">
                                <span className="w-2 h-2 rounded-full bg-current opacity-70 animate-pulse"></span>
                                <p className="text-xs font-bold uppercase tracking-widest opacity-80">{customer.riskLevel} Risk Detected</p>
                            </div>
                            <div className="bg-white/60 rounded-xl p-5 border border-black/5 shadow-inner">
                                <p className="text-sm font-medium leading-relaxed opacity-90">{customer.aiRationale}</p>
                            </div>
                        </div>

                        {/* WIDGET : DÉCISION AGENT */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-4">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-800 mb-2 border-b border-gray-100 pb-3">Compliance Decision</h3>
                            
                            {customer.status === "pending" ? (
                                <div className="flex flex-col gap-3">
                                    <button 
                                        onClick={() => handleDecision("verified")} 
                                        disabled={actionLoading !== null} 
                                        className="w-full bg-green-600 text-white font-bold py-3.5 rounded-xl hover:bg-green-700 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm border border-transparent hover:border-green-800 cursor-pointer"
                                    >
                                        {actionLoading === "verified" ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />} Approve Profile
                                    </button>
                                    <button 
                                        onClick={() => setIsRejectModalOpen(true)} 
                                        disabled={actionLoading !== null} 
                                        className="w-full bg-white border-2 border-red-100 text-red-600 font-bold py-3.5 rounded-xl hover:bg-red-50 hover:border-red-200 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm cursor-pointer"
                                    >
                                        {actionLoading === "rejected" ? <Loader2 className="w-5 h-5 animate-spin" /> : <XCircle className="w-5 h-5" />} Reject Profile
                                    </button>
                                    <p className="text-[10px] text-gray-400 text-center leading-tight mt-2">Decision is permanently recorded in the immutable audit trail.</p>
                                </div>
                            ) : (
                                <div className={`p-4 rounded-xl flex items-center justify-center gap-2 font-bold ${
                                    customer.status === "verified" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
                                }`}>
                                    {customer.status === "verified" ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                                    Profile {customer.status}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* MODALE DE REJET */}
            {isRejectModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-lg w-full border border-gray-200 shadow-2xl p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 text-red-600 border-b border-gray-100 pb-3">
                            <AlertCircle className="w-6 h-6" />
                            <h3 className="text-lg font-bold text-gray-900">Specify Rejection Reason</h3>
                        </div>
                        {/* 🆕 [CONFORMITÉ] Texte corrigé. L'ancien affirmait "This precise
                            text will be sent to the client" — désormais faux, et
                            dangereusement faux : un agent s'y fiant croirait avoir
                            informé le client d'un problème de conformité alors que
                            celui-ci n'aura reçu qu'un message générique. */}
                        <p className="text-sm text-gray-500">Select the non-compliance marker. The reason you pick is recorded in the audit trail; the message sent to the applicant may be worded differently for legal reasons.</p>
                        
                        {/* 🆕 [CONFORMITÉ] MOTIFS GROUPÉS PAR CATÉGORIE.
                            Douze motifs en liste plate seraient illisibles ; les
                            regrouper permet à l'agent de trouver le bon en balayant
                            les intitulés de section.
                            💡 `max-h` + `overflow-y-auto` : la liste dépasse désormais
                            la hauteur d'écran, il faut pouvoir la faire défiler sans
                            perdre de vue les boutons de validation en bas. */}
                        <div className="flex flex-col gap-4 my-2 max-h-[45vh] overflow-y-auto pr-1">
                            {REASON_CATEGORIES.map((category) => (
                                <div key={category} className="flex flex-col gap-2">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pl-1">
                                        {category}
                                    </p>
                                    {PREDEFINED_REASONS.filter((r) => r.category === category).map((reason) => (
                                        <label
                                            key={reason.id}
                                            className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                                        >
                                            <input
                                                type="radio"
                                                name="rejection_reason"
                                                // 💡 Comparaison par `id` et non par référence d'objet :
                                                // plus lisible, et robuste si la liste venait un jour
                                                // d'une API plutôt que d'une constante.
                                                checked={!isCustom && selectedReason.id === reason.id}
                                                onChange={() => { setIsCustom(false); setSelectedReason(reason); }}
                                                className="mt-1 accent-blue-600"
                                            />
                                            <span className="text-sm text-gray-700 font-medium flex-1">
                                                {reason.label}
                                                {/* 🆕 Badge signalant que le client ne verra PAS ce texte.
                                                    L'agent doit le savoir — sinon il croirait avoir
                                                    informé le client d'un problème de conformité et
                                                    n'assurerait aucun suivi. */}
                                                {reason.isConfidential && (
                                                    <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold rounded border border-amber-200 align-middle">
                                                        INTERNAL ONLY
                                                    </span>
                                                )}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            ))}

                            <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                                <input 
                                    type="radio" 
                                    name="rejection_reason" 
                                    checked={isCustom} 
                                    onChange={() => setIsCustom(true)} 
                                    className="mt-1 accent-blue-600" 
                                />
                                <span className="text-sm text-gray-700 font-bold">Custom Reason...</span>
                            </label>
                        </div>

                        {/* 🆕 [CONFORMITÉ] APERÇU DE CE QUE LE CLIENT RECEVRA RÉELLEMENT.
                            Affiché uniquement pour les motifs confidentiels, là où les
                            deux textes divergent. Sans cet aperçu, l'agent n'aurait
                            aucun moyen de savoir ce qui part vraiment — et découvrirait
                            l'écart en lisant une réclamation. */}
                        {!isCustom && selectedReason.isConfidential && (
                            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <div className="flex flex-col gap-1">
                                    <p className="text-xs font-bold text-amber-800">
                                        The applicant will receive a generic message
                                    </p>
                                    <p className="text-xs text-amber-700 leading-relaxed italic">
                                        "{selectedReason.customerMessage}"
                                    </p>
                                    <p className="text-[10px] text-amber-600 mt-1">
                                        Disclosing a compliance-related rejection reason to the applicant may constitute unlawful tipping off. The full reason is recorded in the audit trail.
                                    </p>
                                </div>
                            </div>
                        )}

                        {isCustom && (
                            <>
                                <textarea 
                                    value={customReason} 
                                    onChange={(e) => setCustomReason(e.target.value)} 
                                    placeholder="Type the specific regulatory compliance failure reason..." 
                                    className="w-full border border-gray-300 rounded-lg p-3 text-sm outline-none focus:border-blue-600 h-24 text-gray-800 transition-all resize-none shadow-inner" 
                                />
                                {/* 🆕 [CONFORMITÉ] Avertissement sur le mode libre.
                                    En mode personnalisé, le MÊME texte part dans l'audit
                                    ET dans l'email — impossible de deviner ce que l'agent
                                    voulait garder confidentiel. Il doit donc savoir que ce
                                    qu'il écrit sera lu par le client. */}
                                <p className="text-[10px] text-gray-500 leading-relaxed -mt-2">
                                    ⚠️ A custom reason is sent to the applicant exactly as written. Never mention sanctions, watchlists or suspected money laundering here.
                                </p>
                            </>
                        )}

                        <div className="flex gap-3 justify-end border-t border-gray-100 pt-4 mt-2">
                            <button 
                                onClick={() => setIsRejectModalOpen(false)} 
                                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={() => handleDecision(
                                    "rejected",
                                    // Motif interne : le texte libre, ou le label du motif choisi.
                                    isCustom ? customReason : selectedReason.label,
                                    // 🆕 Message client. En mode personnalisé, c'est le même
                                    // texte — l'agent est alors seul responsable de ce qu'il
                                    // écrit, et l'avertissement ci-dessus le lui rappelle.
                                    isCustom ? customReason : selectedReason.customerMessage
                                )} 
                                disabled={isCustom && !customReason.trim()} 
                                className="px-5 py-2 text-sm font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                            >
                                Confirm Rejection
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* VERIFICATION STUDIO (MODAL IMAGE) */}
            {isViewerOpen && (
                <div className="fixed inset-0 z-50 bg-black/95 flex flex-col backdrop-blur-md">
                    <div className="h-16 border-b border-white/10 flex justify-between items-center px-6 shrink-0">
                        <div className="flex items-center gap-3">
                            <ShieldAlert className="w-5 h-5 text-blue-400" />
                            <h2 className="font-bold tracking-widest uppercase text-sm text-white">Verification Studio : Face Matching</h2>
                        </div>
                        <button onClick={() => { setIsViewerOpen(false); setIdZoom(1); setSelfieZoom(1); }} className="p-2 text-gray-400 hover:text-white hover:bg-red-500 rounded-full transition-all cursor-pointer">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex-1 flex flex-col md:flex-row p-4 gap-4 overflow-hidden">
                        <div className="flex-1 bg-gray-900 rounded-2xl border border-white/10 flex flex-col relative overflow-hidden">
                            <div className="absolute top-4 left-4 z-10 bg-black/70 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 flex items-center gap-4 shadow-xl">
                                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Front ID</span>
                                <div className="w-px h-4 bg-white/20"></div>
                                <button onClick={() => setIdZoom(z => Math.max(0.5, z - 0.5))} className="text-gray-400 hover:text-white cursor-pointer"><ZoomOut className="w-4 h-4"/></button>
                                <span className="text-xs font-mono text-white w-8 text-center">{Math.round(idZoom * 100)}%</span>
                                <button onClick={() => setIdZoom(z => Math.min(4, z + 0.5))} className="text-gray-400 hover:text-white cursor-pointer"><ZoomIn className="w-4 h-4"/></button>
                                <div className="w-px h-4 bg-white/20"></div>
                                <button onClick={() => setIdZoom(1)} className="text-gray-400 hover:text-white cursor-pointer"><RotateCcw className="w-4 h-4"/></button>
                            </div>
                            <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                                {customer.idCardDisplayUrl ? (
                                    <img src={customer.idCardDisplayUrl} alt="ID Document" onError={refreshDocumentUrls} className="max-w-full max-h-full object-contain transition-transform duration-200" style={{ transform: `scale(${idZoom})`, transformOrigin: 'center' }} />
                                ) : (
                                    <p className="text-gray-600 font-medium">No document provided</p>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 bg-gray-900 rounded-2xl border border-white/10 flex flex-col relative overflow-hidden">
                            <div className="absolute top-4 left-4 z-10 bg-black/70 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 flex items-center gap-4 shadow-xl">
                                {/* ⚠️ Libellé trompeur : c'est un fichier uploadé, pas une capture live — voir note en tête de fichier */}
                                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Live Selfie</span>
                                <div className="w-px h-4 bg-white/20"></div>
                                <button onClick={() => setSelfieZoom(z => Math.max(0.5, z - 0.5))} className="text-gray-400 hover:text-white cursor-pointer"><ZoomOut className="w-4 h-4"/></button>
                                <span className="text-xs font-mono text-white w-8 text-center">{Math.round(selfieZoom * 100)}%</span>
                                <button onClick={() => setSelfieZoom(z => Math.min(4, z + 0.5))} className="text-gray-400 hover:text-white cursor-pointer"><ZoomIn className="w-4 h-4"/></button>
                                <div className="w-px h-4 bg-white/20"></div>
                                <button onClick={() => setSelfieZoom(1)} className="text-gray-400 hover:text-white cursor-pointer"><RotateCcw className="w-4 h-4"/></button>
                            </div>
                            <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                                {customer.selfieDisplayUrl ? (
                                    <img src={customer.selfieDisplayUrl} alt="Selfie" onError={refreshDocumentUrls} className="max-w-full max-h-full object-contain transition-transform duration-200" style={{ transform: `scale(${selfieZoom})`, transformOrigin: 'center' }} />
                                ) : (
                                    <p className="text-gray-600 font-medium">No selfie provided</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}