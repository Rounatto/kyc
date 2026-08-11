// ============================================================================
// 📁 MOTEUR KYC — LISTE (GET) + CRÉATION DE DOSSIER (POST)
// ============================================================================
// C'est le cœur métier de TrustVerify. POST orchestre tout le pipeline de
// vérification d'identité en une seule requête synchrone :
//   1. Validation Zod du payload + garde RBAC (isolation multi-tenant)
//   2. Anti-doublon (email/CIN déjà en cours de traitement pour CETTE entreprise)
//   3. Calcul de l'âge à partir de la date de naissance
//   4. OCR du document d'identité (Gemini Vision, Tesseract en repli) pour
//      cross-vérifier le nom/CIN saisis au formulaire
//   5. Screening AML/PEP (sanctions financières) via OpenSanctions
//   6. Comparaison faciale SERVEUR (lib/face-match.ts)
//   7. Moteur de règles déclaratif (json-rules-engine + lib/kyc-rules.json) qui
//      transforme tous ces "facts" en un score de risque 0-100 + un rationale humain
//   8. Écriture du dossier + de sa première ligne d'audit + notification si High Risk
//
// ✅ [PHASE C — RÉSOLU] LA BIOMÉTRIE N'EST PLUS CALCULÉE PAR LE CLIENT.
// Le champ `biometricScore` envoyé par le formulaire est désormais IGNORÉ. Le
// serveur télécharge lui-même les deux images depuis le bucket privé et fait
// réaliser la comparaison par Gemini Vision. Avant ce correctif, il suffisait
// d'intercepter la requête et de remplacer le score par 99.9 pour annuler
// toute pénalité biométrique.
//
// ⚠️ FAILLE RESTANTE (Phase C — point 4) : le liveness. Le "selfie" reste un
// fichier uploadé, pas une capture caméra en direct. Rien n'empêche encore
// d'envoyer une photo de la personne trouvée en ligne.
//
// 🆕 [AUDIT MOTEUR] Ce fichier a été revu en profondeur. Quatre corrections
// structurelles, détaillées à leur emplacement :
//   • FAIL-CLOSED sur le screening AML (la panne ne passe plus pour un succès)
//   • Suppression de la fausse détection de "document volé"
//   • Biométrie graduée + pénalité quand elle est absente
//   • Le PEP et les juridictions à risque passent dans le moteur de règles
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Engine } from "json-rules-engine";
import kycRules from "@/lib/kyc-rules.json";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";
// 🆕 [PHASE C] `createSignedDocumentUrls` (au pluriel) : on signe désormais les
// DEUX documents en un seul aller-retour, puisque le selfie doit lui aussi être
// lisible par le serveur.
import { createSignedDocumentUrls } from "@/lib/storage";
import { matchNameAgainstOcr, matchIdNumberAgainstOcr, containsArabic } from "@/lib/arabic";
import { extractDocumentData, isDocumentExpired } from "@/lib/document-ocr";
// 🆕 [PHASE C] Comparaison faciale côté serveur.
import { compareFacesServerSide } from "@/lib/face-match";

// 🆕 [FIX PROD] Durée max d'exécution de cette fonction sur Vercel.
// Sans cette ligne, le plan Hobby coupe la fonction à 10 secondes — largement
// insuffisant pour l'OCR, le screening AML et la comparaison faciale.
//
// 🆕 [PHASE C] BUDGET APRÈS AJOUT DE LA BIOMÉTRIE SERVEUR :
//   OCR (15 s max) + max(AML 8 s, visage 20 s) = ~35 s de pire cas.
// Les deux derniers tournent EN PARALLÈLE — voir plus bas. Enchaînés, on serait
// à 43 s, soit à quelques secondes du plafond.
// ⚠️ Solution temporaire : la vraie correction est de sortir ces trois modules
// du cycle requête/réponse (pipeline asynchrone).
export const maxDuration = 60;

const customerRegistrationSchema = z.object({
    customerName: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
    customerNameAr: z.string().optional().or(z.literal('')),
    email: z.string().email("Format d'email invalide"),
    type: z.string().min(1, "Le type de procédure est requis"),
    cin: z.string().min(4, "Le numéro d'identification est trop court"),
    documentType: z.string().min(1, "Le type de document est requis"),
    nationality: z.string().min(1, "La nationalité est requise"),
    dateOfBirth: z.string().optional().or(z.literal('')),
    phoneNumber: z.string().optional().or(z.literal('')),
    idCardPath: z.string().min(1, "Le document d'identité est manquant"),
    selfiePath: z.string().min(1, "Le selfie est manquant"),

    // 🆕 [PHASE C] CHAMP CONSERVÉ MAIS TOTALEMENT IGNORÉ.
    //
    // ⚠️ POURQUOI NE PAS LE SUPPRIMER PUREMENT ET SIMPLEMENT : le formulaire
    // actuel l'envoie encore. Si Zod le rejetait, toute création de dossier
    // échouerait tant que le frontend n'est pas redéployé — un déploiement raté
    // à cause d'un champ devenu inutile. On l'accepte donc, et on ne le lit
    // nulle part. Il pourra disparaître d'ici une fois le formulaire nettoyé.
    //
    // 💡 Les bornes .min(0).max(100) sont ajoutées par pure hygiène : la valeur
    // n'est plus utilisée, mais un champ numérique sans borne est le genre de
    // détail qui redevient dangereux le jour où quelqu'un le rebranche.
    // L'ancienne version acceptait `biometricScore: 100000`, ce qui produisait
    // "✅ BIOMETRIC SUCCESS: 100000.0% similarity" dans la piste d'audit.
    biometricScore: z.number().min(0).max(100).nullable().optional()
});

// ============================================================================
// 🆕 [AUDIT MOTEUR] JURIDICTIONS À RISQUE — LISTES DU GAFI
// ============================================================================
// Le GAFI (Groupe d'Action Financière) publie deux listes officielles que TOUS
// les acteurs KYC intègrent. Elles sont publiques et gratuites — leur absence
// était un manque réel : le système traitait jusqu'ici l'Iran et la Suisse
// exactement de la même façon.
//
// ⚠️ MAINTENANCE OBLIGATOIRE : le GAFI révise ces listes environ trois fois par
// an (février, juin, octobre). Une liste périmée est pire qu'inutile — elle
// donne l'illusion d'un contrôle à jour. Source officielle : fatf-gafi.org
const FATF_BLACKLIST = ["Iran", "North Korea", "Korea, North", "Myanmar", "Burma"];

const FATF_GREYLIST = [
    "Algeria", "Angola", "Bulgaria", "Burkina Faso", "Cameroon", "Côte d'Ivoire",
    "Croatia", "Democratic Republic of the Congo", "Haiti", "Kenya", "Laos",
    "Lebanon", "Mali", "Monaco", "Mozambique", "Namibia", "Nepal", "Nigeria",
    "South Africa", "South Sudan", "Syria", "Tanzania", "Venezuela", "Vietnam", "Yemen",
];

// ============================================================================
// 🆕 [AUDIT MOTEUR] FORMATS D'IDENTIFIANT PAR PAYS
// ============================================================================
// Avant, seule la Tunisie était vérifiée. Pour tous les autres pays, un numéro
// totalement inventé passait sans le moindre signal.
//
// ⚠️ Un format valide ne prouve RIEN sur l'existence réelle du document : il
// détecte les saisies manifestement erronées, pas la fraude.
const ID_FORMATS: Record<string, RegExp> = {
    Tunisia: /^[0-9]{8}$/,
    Morocco: /^[A-Z]{1,2}[0-9]{5,6}$/i,
    Algeria: /^[0-9]{18}$/,
    France: /^[0-9A-Z]{12}$/i,
    Egypt: /^[0-9]{14}$/,
};

// Vérifie si un nom apparaît sur des listes de sanctions financières (AML) ou
// est une "Personne Politiquement Exposée" (PEP) — obligation légale en KYC.
//
// 🆕 [AUDIT MOTEUR] LA LISTE DE REPLI LOCALE A ÉTÉ SUPPRIMÉE, et le
// comportement en cas de panne est inversé.
//
// ❌ CE QUI EXISTAIT : une liste de neuf mots codés en dur
// (["malicious", "fraud", "vladimir", "putin", ...]) comparés par SOUS-CHAÎNE.
// Elle produisait exactement l'inverse d'un filet de sécurité : des FAUX
// POSITIFS sur des clients innocents (un "Vladimir Ben Salah" tunisien était
// signalé comme correspondance sanctions ET comme PEP, à cause de son prénom)
// et AUCUN vrai positif.
//
// ❌ PIRE ENCORE — LE "FAIL-OPEN" : quand l'API ne répondait pas et que la
// liste locale ne trouvait rien, la fonction renvoyait `sanctioned: false`. Le
// moteur de règles ne voyait donc AUCUNE différence entre "vérifié, rien
// trouvé" et "pas vérifié du tout".
//
// ✅ CE QUI LE REMPLACE : un drapeau `screeningFailed` explicite. Quand le
// contrôle n'a pas pu s'exécuter, on le DIT, et le moteur impose une revue
// manuelle (+45 points).
//
// 🆕 [FIX API] DEUX BUGS CORRIGÉS QUI EMPÊCHAIENT TOUT APPEL D'ABOUTIR DEPUIS
// LE PREMIER JOUR — détails à leur emplacement plus bas. Conséquence : aucun
// nom n'avait jamais été comparé à une liste de sanctions.
//
// 🧹 [PHASE C] Ce bloc de commentaire était DUPLIQUÉ à l'identique juste
// au-dessus de la fonction (un copier-coller lors du lot précédent). Fusionné.
async function performGlobalSanctionsLookup(name: string, country: string) {
    let apiSanctioned = false;
    let apiPep = false;
    let topScore = 0.0;

    // 🆕 Part du principe que le screening a ÉCHOUÉ, et ne repasse à `false`
    // qu'après une réponse valide de l'API. C'est l'inverse de l'ancienne
    // logique optimiste — un oubli dans le code produira désormais une alerte,
    // pas un silence.
    let screeningFailed = true;
    let lookupSource = "Screening unavailable";

    const apiKey = process.env.OPENSANCTIONS_API_KEY;

    // 🆕 [FIX API] COURT-CIRCUIT SI LA CLÉ EST ABSENTE.
    // Sans ce garde-fou, on partait quand même en appel réseau — avec un
    // en-tête d'autorisation vide — pour récolter un 401 après plusieurs
    // secondes. Le résultat métier est identique, on l'obtient sans gaspiller
    // de temps sur un budget d'exécution déjà tendu.
    if (!apiKey) {
        console.warn("[AML] OPENSANCTIONS_API_KEY is missing — screening skipped entirely.");
        return {
            sanctioned: false,
            isPep: false,
            screeningFailed: true,
            source: "Screening unavailable (no API key configured)",
            confidenceScore: 0,
        };
    }

    try {
        const response = await fetch("https://api.opensanctions.org/match/default", {
            method: "POST",
            // 🆕 [FIX PROD] Abandon au bout de 8 secondes. Sans ce garde-fou, une
            // API lente bloquait toute la création du dossier jusqu'à la mort de
            // la fonction serverless.
            signal: AbortSignal.timeout(8000),
            headers: {
                "Content-Type": "application/json",
                // 🆕 [FIX API — BUG 1/2] Le préfixe était `Bearer`, or
                // OpenSanctions attend `ApiKey`. C'ÉTAIT LA CAUSE DU 401 : le
                // mot-clé fait partie de la valeur envoyée, le serveur compare
                // la chaîne entière. Source : opensanctions.org/docs/api/authentication/
                "Authorization": `ApiKey ${apiKey}`,
            },
            body: JSON.stringify({
                queries: {
                    q1: {
                        schema: "Person",
                        properties: {
                            name: [name],
                            jurisdiction: country ? [country] : []
                        }
                    }
                }
            })
        });

        if (response.ok) {
            const data = await response.json();

            // 🆕 [FIX API — BUG 2/2] La réponse se lit dans `responses`, pas dans
            // `queries`. L'API est ASYMÉTRIQUE : on ENVOIE un objet `queries`,
            // elle RÉPOND dans un objet `responses`. L'ancien code lisait
            // `data.queries?.q1?.results` — une clé inexistante. Le `|| []`
            // faisait le reste : jamais d'erreur, jamais de résultat.
            const results = data.responses?.q1?.results || [];

            // 🆕 LE SEUL ENDROIT OÙ LE SCREENING EST DÉCLARÉ RÉUSSI.
            // Un HTTP 200 signifie que l'API a comparé le nom à ses index —
            // qu'elle ait trouvé quelque chose ou non. "Zéro résultat" et
            // "aucune recherche effectuée" sont deux situations radicalement
            // différentes, indiscernables jusqu'ici.
            screeningFailed = false;
            lookupSource = "OpenSanctions API (Live Production Index)";

            // ⚠️ Ce journal contient le nom du client — développement uniquement.
            if (process.env.NODE_ENV !== "production") {
                console.log("\n──────── AML DIAGNOSTIC ────────");
                console.log("Nom recherché :", name);
                console.log("Correspondances trouvées :", results.length);
                if (results.length > 0) {
                    console.log("Meilleur score :", results[0].score);
                    console.log("Sujets associés :", results[0].topics ?? results[0].properties?.topics);
                }
                console.log("────────────────────────────────\n");
            }

            if (results.length > 0) {
                const sortedCandidates = results.sort((a: any, b: any) => b.score - a.score);
                const candidate = sortedCandidates[0];
                topScore = candidate.score;

                // Seuil de 0.50 : en dessous, la correspondance de nom est trop
                // lâche pour être exploitable (homonymies fréquentes).
                if (topScore > 0.50) {
                    const topics = [
                        ...(candidate.topics || []),
                        ...(candidate.properties?.topics || [])
                    ];

                    apiSanctioned = topics.includes("sanction") || topics.includes("sanctions");
                    apiPep = topics.includes("role.pep") || topics.includes("pep");
                }
            }
        } else {
            // 🆕 [FIX API] On lit le corps de la réponse d'erreur. Sans ce détail,
            // un 401 pouvait signifier trois choses très différentes — clé
            // expirée, mauvais format d'en-tête, compte suspendu — sans moyen de
            // trancher. 401 = clé refusée, 429 = quota mensuel épuisé.
            const errorBody = await response.text().catch(() => "");
            console.warn("[AML] OpenSanctions HTTP error:", response.status, errorBody.slice(0, 300));
        }
    } catch (error) {
        // Timeout, DNS, réseau coupé : `screeningFailed` reste à `true`.
        console.error("[AML] OpenSanctions unreachable:", error);
    }

    return {
        sanctioned: apiSanctioned,
        isPep: apiPep,
        screeningFailed,
        source: lookupSource,
        confidenceScore: topScore,
    };
}

// Liste paginée + filtrée des dossiers KYC de l'entreprise de l'appelant, avec
// les compteurs affichés en haut du dashboard (`stats`). Tout est scopé par
// `companyId` dérivé de la session (jamais du query string) : impossible pour
// un agent de l'entreprise A de lister/compter les dossiers de l'entreprise B.
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
        if (!guard.isValid) return guard.response!;

        const { companyId } = guard;

        const { searchParams } = new URL(req.url);
        const search = searchParams.get("search") || "";
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "5");
        const status = searchParams.get("status") || "all";
        const risk = searchParams.get("risk") || "all";
        const sort = searchParams.get("sort") || "oldest";
        const skip = (page - 1) * limit;

        const whereCondition: any = { companyId: companyId };

        if (search) {
            whereCondition.OR = [
                { customerName: { contains: search, mode: "insensitive" as const } },
                { email: { contains: search, mode: "insensitive" as const } },
                { cin: { contains: search } },
                { phoneNumber: { contains: search } }
            ]
        }

        if (status !== "all") {
            whereCondition.status = status;
        }

        if (risk === "high") whereCondition.riskLevel = "High";
        else if (risk === "medium") whereCondition.riskLevel = "Medium";
        else if (risk === "low") whereCondition.riskLevel = "Low";

        let orderByCondition: any = { submittedAt: 'asc' };

        if (sort === "newest") {
            orderByCondition = { submittedAt: 'desc' };
        } else if (sort === "highest_score") {
            orderByCondition = { score: 'desc' };
        } else if (sort === "lowest_score") {
            orderByCondition = { score: 'asc' };
        }

        const [requests, filteredTotal] = await Promise.all([
            prisma.verificationRequest.findMany({
                where: whereCondition,
                take: limit,
                skip: skip,
                orderBy: orderByCondition
            }),
            prisma.verificationRequest.count({ where: whereCondition })
        ]);

        // ⚠️ Ces 4 compteurs sont exécutés en SÉRIE alors qu'ils sont
        // indépendants — ils pourraient être parallélisés dans un Promise.all.
        const pendingCount = await prisma.verificationRequest.count({
            where: { status: "pending", companyId: companyId }
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const verifiedTodayCount = await prisma.verificationRequest.count({
            where: {
                status: "verified",
                updatedAt: { gte: today },
                companyId: companyId
            } as any
        });

        const totalAbsolute = await prisma.verificationRequest.count({
            where: { companyId: companyId } as any
        });

        const highRiskCount = await prisma.verificationRequest.count({
            where: { riskLevel: "High", companyId: companyId } as any
        });

        return NextResponse.json({
            requests,
            total: filteredTotal,
            page,
            limit,
            stats: {
                totalCustomers: totalAbsolute,
                verifiedToday: verifiedTodayCount,
                pendingReviews: pendingCount,
                highRisk: highRiskCount
            }
        });

    } catch (error: any) {
        console.error("GET Error:", error);
        return NextResponse.json({ error: "Failed to fetch data." }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
        if (!guard.isValid) return guard.response!;

        // companyId/serverAgentId viennent de la SESSION SERVEUR, jamais du
        // body — c'est ce qui empêche un client de falsifier "pour qui" ou
        // "au nom de qui" ce dossier est créé.
        const { companyId, userId: serverAgentId } = guard;

        const body = await req.json();
        const validationResult = customerRegistrationSchema.safeParse(body);

        if (!validationResult.success) {
            const errorMessages = validationResult.error.issues
                .map((err) => `${err.path.map(String).join('.')}: ${err.message}`)
                .join(' | ');
            console.error("❌ Zod Security Block:", errorMessages);
            return NextResponse.json({ error: `Security Validation Failed: ${errorMessages}` }, { status: 400 });
        }

        // 🆕 [PHASE C] `biometricScore` N'EST VOLONTAIREMENT PAS EXTRAIT ICI.
        // Il est validé par Zod (donc accepté sans erreur) mais jamais lu : la
        // valeur biométrique est recalculée plus bas, côté serveur. Ne pas le
        // destructurer est le meilleur garde-fou possible — TypeScript refusera
        // toute tentative future de l'utiliser par inadvertance.
        const { customerName, customerNameAr, email, type, cin, documentType, nationality, dateOfBirth, phoneNumber, idCardPath, selfiePath } = validationResult.data;

        // ====================================================================
        // 🔒 VÉRIFICATION D'APPARTENANCE DES CHEMINS
        // ====================================================================
        // Les chemins arrivent du CLIENT. Le scénario à bloquer : un agent de
        // l'entreprise A qui connaîtrait le chemin d'un document de l'entreprise
        // B pourrait l'attacher à SON dossier — et le verrait ensuite s'afficher
        // légitimement, puisque le contrôle d'accès se base sur le propriétaire
        // du DOSSIER, pas sur celui du fichier.
        //
        // 🆕 [PHASE C] CE CONTRÔLE PREND UNE IMPORTANCE NOUVELLE. Le serveur
        // télécharge désormais lui-même ces deux fichiers pour la comparaison
        // faciale. Sans cette barrière, on lui ferait analyser — et donc
        // valider — des images appartenant à une autre entreprise.
        const pathPrefix = `${companyId}/`;
        if (!idCardPath.startsWith(pathPrefix) || !selfiePath.startsWith(pathPrefix)) {
            console.error(
                `🔴 Sécurité : tentative de rattachement d'un document hors périmètre (company ${companyId})`
            );
            return NextResponse.json(
                { error: "Document reference does not belong to your workspace." },
                { status: 403 }
            );
        }

        const agent = await prisma.user.findUnique({ where: { id: serverAgentId } });
        if (!agent) {
            return NextResponse.json({ error: "Agent session invalid or revoked." }, { status: 401 });
        }

        // Anti-doublon : empêche de soumettre 2 fois le même email/CIN tant
        // qu'un dossier précédent est encore "pending" ou déjà "verified" pour
        // CETTE entreprise (un dossier "rejected" peut être resoumis).
        const existingRecord = await prisma.verificationRequest.findFirst({
            where: {
                companyId: companyId,
                OR: [{ email: email }, { cin: cin }],
                status: { in: ["pending", "verified"] }
            }
        });
        if (existingRecord) {
            return NextResponse.json({ error: "This applicant or identification document is already linked to an active KYC pipeline." }, { status: 409 });
        }

        // --- MODULE 1 : VÉRIFICATION D'ÂGE ---
        // Calcul d'âge précis (tient compte du mois/jour, pas juste l'année),
        // car un mineur (<18) doit être bloqué (hard_kill) et un jeune adulte
        // (<25) génère un malus statistique.
        let clientAge = 30;
        let isUnderage = false;
        let isYoungAdult = false;

        if (dateOfBirth) {
            const birthDate = new Date(dateOfBirth);
            const today = new Date();
            clientAge = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();

            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                clientAge--;
            }

            if (clientAge < 18) isUnderage = true;
            else if (clientAge < 25) isYoungAdult = true;
        }

        // ====================================================================
        // 🆕 [PHASE C] SIGNATURE DES DEUX DOCUMENTS, EN AMONT
        // ====================================================================
        // ⚠️ CE BLOC SORT DÉSORMAIS DU TRY/CATCH DE L'OCR, et c'est structurel :
        // deux modules distincts ont maintenant besoin de ces URLs — l'OCR (pièce
        // d'identité) et la comparaison faciale (les deux images). Les signer à
        // l'intérieur du bloc OCR rendrait le selfie inaccessible ailleurs.
        //
        // 💡 `createSignedDocumentUrls` au pluriel : un seul aller-retour vers
        // Supabase pour les deux fichiers, au lieu de deux appels successifs.
        //
        // 💡 120 secondes de validité au lieu de 60 : ces liens doivent survivre
        // à toute la durée du pipeline, y compris le téléchargement des images
        // par Gemini pour la comparaison faciale, qui arrive bien après l'OCR.
        //
        // 🔒 L'ÉCHEC N'EST PAS FATAL. Si la signature échoue, on laisse les deux
        // URLs à `null` : l'OCR se déclarera indisponible (+25) et la biométrie
        // aussi (+40). Le dossier part en revue manuelle avec 65 points, ce qui
        // est le comportement correct — bien mieux qu'une erreur 500 qui ferait
        // perdre toute la saisie de l'agent.
        let signedIdCardUrl: string | null = null;
        let signedSelfieUrl: string | null = null;

        try {
            const signedUrls = await createSignedDocumentUrls([idCardPath, selfiePath], 120);
            signedIdCardUrl = signedUrls[idCardPath] ?? null;
            signedSelfieUrl = signedUrls[selfiePath] ?? null;
        } catch (error) {
            console.error("[STORAGE] Signature des documents impossible :", error);
        }

        // --- MODULE 2 : OCR (lecture du document d'identité) ---
        let ocrText = "";
        let ocrFailed = false;
        let isNameOnDoc = false;
        let isCinOnDoc = false;
        let nameMatchDetails: ReturnType<typeof matchNameAgainstOcr> | null = null;

        let extraction: Awaited<ReturnType<typeof extractDocumentData>> | null = null;
        let documentExpired: boolean | null = null;

        // 🆕 [ARABE] QUEL NOM COMPARER AU DOCUMENT ?
        // On privilégie le nom arabe saisi par l'agent dès qu'il contient
        // réellement des caractères arabes — le second test compte, un agent
        // pressé pourrait y retaper le nom latin par réflexe.
        const useArabicName = Boolean(customerNameAr && containsArabic(customerNameAr));
        const nameForOcrComparison = useArabicName ? customerNameAr! : customerName;
        let dobMismatch = false;

        try {
            // 🆕 [PHASE C] L'URL est signée en amont. Si elle est absente, la
            // lecture est déclarée impossible plutôt que tentée dans le vide.
            if (!signedIdCardUrl) {
                throw new Error("Signed URL unavailable for the ID document.");
            }

            extraction = await extractDocumentData(signedIdCardUrl);

            if (!extraction.success) {
                ocrFailed = true;
            } else {
                ocrText = extraction.rawText;

                // 🆕 [OCR] SI GEMINI A FOURNI LE NOM ARABE, ON L'UTILISE EN
                // PRIORITÉ — même quand l'agent n'a pas rempli le champ. La
                // vérification du nom devient donc possible sur un document
                // arabe SANS aucune saisie manuelle.
                const documentText = extraction.source === "gemini"
                    ? [extraction.nameArabic, extraction.nameLatin].filter(Boolean).join(" ")
                    : extraction.rawText;

                nameMatchDetails = matchNameAgainstOcr(nameForOcrComparison, documentText);
                isNameOnDoc = nameMatchDetails.matched;

                // 🆕 [OCR] Gemini renvoie le numéro déjà isolé et converti en
                // chiffres latins : la comparaison est directe. Avec Tesseract,
                // on repasse par le nettoyage de lib/arabic.ts.
                isCinOnDoc = extraction.idNumber
                    ? matchIdNumberAgainstOcr(cin, extraction.idNumber)
                    : matchIdNumberAgainstOcr(cin, extraction.rawText);

                documentExpired = isDocumentExpired(extraction.expiryDate);

                // ⚠️ On ne compare QUE si les deux dates existent : une date
                // absente n'est pas une incohérence, c'est une information
                // manquante.
                if (extraction.dateOfBirth && dateOfBirth) {
                    dobMismatch = extraction.dateOfBirth.trim() !== dateOfBirth.trim();
                }
            }

            // ⚠️ Ce journal comprend le nom complet et le CIN du client —
            // développement uniquement.
            if (process.env.NODE_ENV !== "production") {
                console.log("\n──────── OCR DIAGNOSTIC ────────");
                console.log("Méthode :", extraction?.source ?? "none");
                if (extraction?.source === "gemini") {
                    console.log("Nom arabe extrait :", extraction.nameArabic);
                    console.log("Nom latin extrait :", extraction.nameLatin);
                    console.log("Numéro extrait    :", extraction.idNumber);
                    console.log("Date de naissance :", extraction.dateOfBirth);
                    console.log("Date d'expiration :", extraction.expiryDate);
                } else {
                    console.log("Texte brut :", extraction?.rawText?.slice(0, 500));
                }
                console.log("────────────────────────────────");
                console.log(`Nom comparé (${useArabicName ? "ARABE" : "LATIN"}) :`, nameForOcrComparison);
                if (nameMatchDetails) {
                    console.log("Résultat nom :", {
                        trouvés: `${nameMatchDetails.foundCount}/${nameMatchDetails.totalCount}`,
                        ratio: `${Math.round(nameMatchDetails.ratio * 100)}%`,
                        manquants: nameMatchDetails.missingWords,
                        validé: isNameOnDoc,
                    });
                }
                console.log("Résultat CIN :", isCinOnDoc ? "trouvé" : "NON trouvé");
                console.log("Document expiré :", documentExpired);
                console.log("────────────────────────────────\n");
            }
        } catch (error) {
            console.error("Critical OCR Extraction failed. Falling back to manual review:", error);
            ocrFailed = true;
        }

        // ====================================================================
        // 🆕 [PHASE C] MODULES 3 ET 4 EN PARALLÈLE — AML + BIOMÉTRIE
        // ====================================================================
        // ⚠️ POURQUOI EN PARALLÈLE, ET PAS L'UN APRÈS L'AUTRE : ces deux contrôles
        // sont totalement indépendants. Le screening AML interroge OpenSanctions
        // avec un NOM, la comparaison faciale interroge Gemini avec deux IMAGES —
        // aucun n'a besoin du résultat de l'autre.
        //
        // Les enchaîner coûterait 8 s + 20 s = 28 s dans le pire cas, à ajouter
        // aux 15 s de l'OCR : 43 s, soit à quelques secondes du plafond de 60 s
        // de Vercel. En parallèle, le pire cas retombe à 20 s, donc ~35 s au
        // total. C'est la différence entre "ça tient" et "ça casse dès que le
        // réseau tousse".
        //
        // 💡 `Promise.all` n'échoue jamais ici : les deux fonctions rattrapent
        // leurs propres erreurs et renvoient un état d'indisponibilité explicite
        // plutôt que de lever. C'est ce qui rend cet appel sûr — un `Promise.all`
        // sur des fonctions qui lèvent ferait échouer toute la création.
        const [amlScreening, faceMatch] = await Promise.all([
            performGlobalSanctionsLookup(customerName, nationality || ""),
            compareFacesServerSide(signedIdCardUrl, signedSelfieUrl),
        ]);

        const normalizedEmail = String(email).toLowerCase();

        // ====================================================================
        // 🆕 [PHASE C] LES QUATRE FACTS BIOMÉTRIQUES DÉRIVENT DU VERDICT
        // ====================================================================
        // ❌ CE QUI EXISTAIT : des seuils numériques (40/60/75) appliqués à un
        // score envoyé par le navigateur. Deux défauts, dont un rédhibitoire.
        //
        //   1. LE SCORE ÉTAIT FALSIFIABLE. Calculé par face-api.js dans le
        //      navigateur puis transmis dans le corps de la requête, il suffisait
        //      d'intercepter l'appel et d'écrire 99.9 pour annuler toute pénalité
        //      biométrique. Tout le travail de gradation était contournable par
        //      une seule valeur modifiée.
        //
        //   2. LES SEUILS N'ONT PLUS DE SENS AVEC UN MODÈLE DE LANGAGE. Ils
        //      étaient calibrés sur une distance euclidienne entre vecteurs — une
        //      mesure mathématique. Gemini ne mesure pas, il juge. Lui réclamer un
        //      pourcentage puis le comparer à 40/60/75 donnerait une fausse
        //      impression de rigueur : on aurait remplacé une valeur falsifiable
        //      par une valeur inventée.
        //
        // ✅ CE QUI LE REMPLACE : un VERDICT à quatre valeurs, produit côté
        // serveur, qui correspond à ce que le modèle sait réellement rendre.
        //
        // 💡 `lib/kyc-rules.json` N'EST PAS MODIFIÉ. Les quatre facts et leurs
        // pénalités (55/35/15/40) sont inchangés — seule la façon de les dériver
        // change. C'est tout l'intérêt d'un moteur de règles déclaratif : on peut
        // remplacer entièrement le moteur biométrique sans toucher aux règles
        // métier.
        const biometricUnavailable = faceMatch.verdict === "unavailable";
        const faceMatchFailed = faceMatch.verdict === "different_person";
        const faceMatchWeak = faceMatch.verdict === "inconclusive";
        const faceMatchBorderline = faceMatch.verdict === "likely_same_person";

        // Conservé pour les règles COMBINÉES du moteur (nom + visage), qui
        // raisonnent sur "le visage ne correspond pas" sans distinguer le degré.
        const faceMismatch = faceMatchFailed || faceMatchWeak;

        // ====================================================================
        // 🆕 [AUDIT MOTEUR] VALIDATION DU FORMAT D'IDENTIFIANT — MULTI-PAYS
        // ====================================================================
        // 💡 On ne pénalise QUE si un format est connu pour le pays déclaré.
        // Signaler un pays absent de la table reviendrait à sanctionner un client
        // parce que NOUS n'avons pas encodé sa règle.
        const idFormat = ID_FORMATS[nationality];
        const invalidIdFormat = idFormat ? !idFormat.test(cin) : false;

        const isBlacklistedJurisdiction = FATF_BLACKLIST.includes(nationality);
        const isGreylistedJurisdiction = FATF_GREYLIST.includes(nationality);

        // --- MODULE 5 : MOTEUR DE RÈGLES ---
        // 🆕 [AUDIT MOTEUR] `isStolenDocument` A ÉTÉ SUPPRIMÉ. Son calcul était
        // `cin.endsWith("999") || cin.endsWith("000")`, mais le message affirmait
        // "matched stolen/lost databases" — une DÉCLARATION FAUSSE inscrite dans
        // la piste d'audit, et déclenchée sur ~1% des CIN au hasard.
        const facts = {
            isSanctionedName: amlScreening.sanctioned,
            isPep: amlScreening.isPep,
            amlScreeningFailed: amlScreening.screeningFailed,

            isDisposableEmail: ["yopmail.com", "mailinator.com", "trashmail.com"].some(d => normalizedEmail.endsWith(d)),
            invalidIdFormat,
            missingPhone: !phoneNumber || phoneNumber === "Not specified" || phoneNumber.trim() === "",
            isPassport: documentType === "Passport",
            isUnderage,
            isYoungAdult,

            isBlacklistedJurisdiction,
            isGreylistedJurisdiction,

            ocrNameMismatch: !ocrFailed && !isNameOnDoc,
            ocrCinMismatch: !ocrFailed && !isCinOnDoc,
            ocrUnavailable: ocrFailed,
            // ⚠️ `documentExpired === true` uniquement : `null` signifie "date
            // illisible", pas "document valide". Traiter une information
            // manquante comme rassurante serait le travers corrigé sur l'AML.
            documentExpired: documentExpired === true,
            dobMismatch,

            // 🆕 [PHASE C] Dérivés du verdict serveur, plus d'un score client.
            faceMismatch,
            faceMatchFailed,
            faceMatchWeak,
            faceMatchBorderline,
            biometricUnavailable,
        };

        const engine = new Engine(kycRules);
        const { events } = await engine.run(facts);

        let riskScore = 0;
        let rationale: string[] = [];
        let isHardKilled = false;

        // Chaque règle déclenchée ajoute un message au rationale (traçabilité
        // humaine de la décision) et soit un "hard_kill" (rejet automatique, le
        // score est forcé à 100), soit des points cumulatifs.
        events.forEach(event => {
            const points = event.params?.points as number || 0;
            const message = event.params?.message as string;

            rationale.push(message);

            if (event.type === 'hard_kill') {
                isHardKilled = true;
            } else {
                riskScore += points;
            }
        });

        if (isHardKilled) {
            riskScore = 100;
        }

        // ====================================================================
        // 🆕 [PHASE C] RATIONALE BIOMÉTRIQUE — ALIGNÉ SUR LE VERDICT
        // ====================================================================
        // `unshift` place ce message en TÊTE : c'est le premier élément que
        // l'agent lit dans le panneau d'analyse.
        //
        // 💡 LA SIMILARITÉ EST AFFICHÉE ENTRE PARENTHÈSES, JAMAIS SEULE. C'est
        // délibéré : le verdict est la décision, le pourcentage n'est qu'un ordre
        // de grandeur fourni par le modèle. Les présenter au même niveau
        // laisserait croire qu'on dispose d'une mesure calibrée — précisément ce
        // qu'on a renoncé à prétendre.
        //
        // 💡 La MENTION DE LA MÉTHODE compte autant que le résultat : un agent
        // doit pouvoir distinguer un contrôle réellement effectué d'un service
        // indisponible. Même principe que pour la source du screening AML.
        const similarityNote =
            faceMatch.similarity !== null ? ` (model estimate: ${faceMatch.similarity}%)` : "";

        if (biometricUnavailable) {
            rationale.unshift(
                `⚠️ BIOMETRIC UNAVAILABLE: ${faceMatch.reason} Identity was NOT biometrically verified — manual visual comparison is mandatory.`
            );
        } else if (faceMatchFailed) {
            rationale.unshift(
                `⛔ BIOMETRIC FAILURE${similarityNote}: server-side comparison concluded the selfie and the document portrait show different people. ${faceMatch.reason}`
            );
        } else if (faceMatchWeak) {
            rationale.unshift(
                `⚠️ BIOMETRIC INCONCLUSIVE${similarityNote}: the comparison could not be settled automatically. ${faceMatch.reason} Manual visual comparison required.`
            );
        } else if (faceMatchBorderline) {
            rationale.unshift(
                `🟡 BIOMETRIC BORDERLINE${similarityNote}: likely the same person, but below the high-confidence threshold. ${faceMatch.reason}`
            );
        } else {
            rationale.unshift(
                `✅ BIOMETRIC MATCH${similarityNote}: the selfie matches the document portrait. ${faceMatch.reason}`
            );
        }

        // 🆕 [PHASE C] TRAÇABILITÉ DE LA MÉTHODE BIOMÉTRIQUE.
        // ⚠️ CE MESSAGE EST IMPORTANT POUR L'AUDIT : il indique noir sur blanc
        // que la comparaison a eu lieu SUR LE SERVEUR. Les anciens dossiers, eux,
        // reposaient sur un calcul navigateur non vérifiable — un auditeur doit
        // pouvoir faire la différence entre les deux périodes.
        rationale.push(
            faceMatch.source === "gemini"
                ? "✅ BIOMETRIC SOURCE: Server-side facial comparison (Gemini Vision). The client-supplied score was ignored."
                : "⚠️ BIOMETRIC SOURCE: Server-side comparison could not be performed. No biometric evidence exists for this file."
        );

        // 🔭 [PHASE C — PRÉPARATION LIVENESS] Indices d'usurpation, signalés SANS
        // pénalité associée.
        //
        // ⚠️ POURQUOI AUCUN POINT N'EST RETIRÉ : un modèle de langage n'est pas
        // un détecteur d'attaque par présentation. Pénaliser sur cette base
        // produirait des faux positifs sur des selfies parfaitement légitimes
        // (reflet de fenêtre, lunettes, retouche automatique du téléphone). On
        // observe d'abord la fiabilité du signal sur de vrais dossiers ; on en
        // fera un critère seulement s'il se révèle solide.
        if (faceMatch.spoofingSignals.length > 0) {
            rationale.push(
                `🔍 PRESENTATION NOTICE (informational, no score impact): the selfie shows possible signs of not being a live capture — ${faceMatch.spoofingSignals.join(", ")}. Liveness detection is not yet implemented.`
            );
        }

        // 🆕 [AUDIT MOTEUR] Traçabilité de la SOURCE du screening AML.
        if (amlScreening.screeningFailed) {
            rationale.push(`⚠️ AML SCREENING SOURCE: ${amlScreening.source}. No watchlist comparison was performed for this applicant.`);
        } else {
            rationale.push(`✅ AML SCREENING SOURCE: ${amlScreening.source}. Applicant name was compared against global sanctions and PEP indexes.`);
        }

        // 🆕 [ARABE] Rationale enrichi : l'agent doit savoir QUELLE écriture a
        // servi à la comparaison et QUELS mots ont manqué. Sans ces deux
        // informations, un échec reste impossible à diagnostiquer.
        if (ocrFailed) {
            rationale.push("NOTICE: Image parsing skipped or image unreadable. Manual document verification required.");
        } else if (nameMatchDetails) {
            const scriptLabel = nameMatchDetails.script === "arabic" ? "Arabic" : "Latin";
            const percent = Math.round(nameMatchDetails.ratio * 100);

            if (!isNameOnDoc) {
                rationale.push(
                    `⚠️ OCR NAME CHECK (${scriptLabel}): only ${nameMatchDetails.foundCount}/${nameMatchDetails.totalCount} name parts (${percent}%) were found on the document. Not located: ${nameMatchDetails.missingWords.join(", ")}.`
                );
            } else {
                rationale.push(
                    `✅ OCR NAME CHECK (${scriptLabel}): ${nameMatchDetails.foundCount}/${nameMatchDetails.totalCount} name parts (${percent}%) matched the document text.`
                );
            }

            if (!isCinOnDoc) {
                rationale.push("⚠️ OCR ID CHECK: the identification number was not found in the extracted document text.");
            } else {
                rationale.push("✅ OCR ID CHECK: the identification number matches the document.");
            }

            if (!useArabicName && nationality === "Tunisia") {
                rationale.push(
                    "NOTICE: The Arabic name field was left empty. The name was compared in Latin script against a document that is likely written in Arabic — this check is unreliable for this file."
                );
            }
        }

        // Le score est borné [0, 100] puis formaté en chaîne de 3 chiffres
        // ("007", "085"...) — c'est le format stocké en base (schema.prisma,
        // `score String?`), d'où les helpers de parsing côté frontend.
        riskScore = Math.min(100, Math.max(0, riskScore));
        const formattedScore = riskScore.toString().padStart(3, '0');

        // Seuils métier : 0-19 = Low, 20-49 = Medium, 50-100 = High.
        let riskLevel = "Low";
        if (riskScore >= 50) riskLevel = "High";
        else if (riskScore >= 20) riskLevel = "Medium";

        const aiRationaleString = rationale.length > 0
            ? rationale.join(" ")
            : `Profile analyzed successfully. Source: ${amlScreening.source}. Client Age: ${clientAge}. Document validation successful.`;

        const newRequest = await prisma.verificationRequest.create({
            data: {
                customerName,
                customerNameAr: customerNameAr || null,
                email,
                type,
                cin,
                documentType,
                nationality,
                dateOfBirth,
                phoneNumber,
                userId: serverAgentId!,
                companyId: companyId!,
                // On enregistre les CHEMINS. Les colonnes idCardUrl/selfieUrl
                // restent volontairement nulles pour tout nouveau dossier.
                idCardPath,
                selfiePath,
                status: "pending",
                score: formattedScore,
                riskLevel: riskLevel,
                aiRationale: aiRationaleString,
                auditLogs: {
                    create: {
                        action: "CREATED",
                        // 🆕 [PHASE C] La méthode biométrique figure explicitement
                        // dans la piste d'audit. C'est ce qui permettra, plus tard,
                        // de distinguer les dossiers vérifiés côté serveur de ceux
                        // qui reposaient sur un calcul navigateur non fiable.
                        details: `KYC Pipeline initialized. Modules processed: Server-side Biometrics (${faceMatch.source}, verdict: ${faceMatch.verdict}), Age Check (${clientAge}yo), AML Screening, OCR Document Analysis. Calculated Risk Score: ${riskScore}/100.`,
                        agentId: serverAgentId!,
                        companyId: companyId!
                    }
                }
            },
        });

        // 💡 ALERTE HIGH RISK
        if (riskLevel === "High") {
            await prisma.notification.create({
                data: {
                    type: "HIGH_RISK_ALERT",
                    title: "High Risk Profile Detected",
                    message: `${customerName} generated a critical risk score of ${riskScore}/100. Immediate review required.`,
                    companyId: companyId!
                }
            });
        }

        return NextResponse.json(newRequest, { status: 201 });
    } catch (error: any) {
        console.error("POST Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}