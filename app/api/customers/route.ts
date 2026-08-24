// ============================================================================
// 📁 MOTEUR KYC — LISTE (GET) + CRÉATION DE DOSSIER (POST)
// ============================================================================
// C'est le cœur métier de TrustVerify. POST orchestre tout le pipeline de
// vérification d'identité en une seule requête synchrone :
//   1. Validation Zod du payload + garde RBAC (isolation multi-tenant)
//   2. Anti-doublon (email/CIN déjà en cours de traitement pour CETTE entreprise)
//   3. OCR du document d'identité (Gemini Vision, Tesseract en repli)
//   4. Résolution de la date de naissance et de l'âge (formulaire OU document)
//   5. Screening AML/PEP + comparaison faciale + LIVENESS, EN PARALLÈLE
//   6. Moteur de règles déclaratif (json-rules-engine + lib/kyc-rules.json)
//   7. Écriture du dossier + première ligne d'audit + notification si High Risk
//
// ✅ [PHASE C — RÉSOLU] LA BIOMÉTRIE N'EST PLUS CALCULÉE PAR LE CLIENT.
// Le champ `biometricScore` envoyé par le formulaire est IGNORÉ. Le serveur
// télécharge lui-même les images depuis le bucket privé et fait réaliser la
// comparaison par Gemini Vision.
//
// ✅ [PHASE C — RÉSOLU] L'ÂGE NE PEUT PLUS ÊTRE CONTOURNÉ EN OMETTANT LA DATE.
//
// ✅ [PHASE C — LIVENESS, ÉTAPE 5/5] LA PRÉSENCE PHYSIQUE EST VÉRIFIÉE.
//
// ❌ CE QUI EXISTAIT : le selfie était un fichier uploadé. Quelqu'un possédant
// une photo de sa victime — Facebook, LinkedIn, une capture d'écran — l'envoyait,
// et la comparaison faciale confirmait consciencieusement que c'était bien elle.
// Le contrôle biométrique fonctionnait parfaitement et VALIDAIT UNE USURPATION.
//
// ✅ MAINTENANT : le client doit exécuter DEUX actions tirées au hasard par le
// serveur, devant la caméra. Une photo imprimée ne tourne pas la tête. Le verdict
// est rendu côté serveur par lib/liveness-verify.ts et alimente trois nouveaux
// facts du moteur de règles.
//
// ⚠️ LIMITE DOCUMENTÉE : une VIDÉO pré-enregistrée de la vraie personne pourrait
// passer. Ce n'est pas une faiblesse du modèle mais de l'information disponible —
// une image 2D ne contient pas la profondeur. Voir lib/liveness-verify.ts.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Engine } from "json-rules-engine";
import kycRules from "@/lib/kyc-rules.json";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";
import { createSignedDocumentUrls } from "@/lib/storage";
import { matchNameAgainstOcr, matchIdNumberAgainstOcr, containsArabic } from "@/lib/arabic";
import { extractDocumentData, isDocumentExpired } from "@/lib/document-ocr";
import { compareFacesServerSide } from "@/lib/face-match";
// 🆕 [PHASE C — LIVENESS] Vérification serveur de la séquence de présence.
import { verifyLivenessSequence } from "@/lib/liveness-verify";

// 🆕 [FIX PROD] Durée max d'exécution sur Vercel. Sans cette ligne, le plan
// Hobby coupe la fonction à 10 secondes.
//
// BUDGET APRÈS AJOUT DU LIVENESS :
//   OCR (15 s max) + max(AML 8 s, visage 20 s, liveness 25 s) = ~40 s de pire cas.
// Les trois derniers tournent EN PARALLÈLE. Enchaînés, on serait à 68 s — donc
// au-delà du plafond. Le parallélisme n'est pas une optimisation ici, c'est ce
// qui rend le pipeline possible.
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

    // 🆕 [PHASE C — LIVENESS] LE SELFIE N'EST PLUS FOURNI DIRECTEMENT.
    //
    // ⚠️ IL EST DEVENU OPTIONNEL DANS LE SCHÉMA, mais ce n'est PAS un
    // assouplissement : il est désormais dérivé de l'image de RÉFÉRENCE de la
    // séquence de liveness (voir plus bas). Cette image EST un selfie — un visage
    // de face, en pose neutre — à ceci près qu'elle est capturée en direct au lieu
    // d'être uploadée. Strictement meilleure qu'avant.
    //
    // 💡 Le champ reste accepté pour ne pas casser un onglet resté ouvert avec
    // l'ancienne version du formulaire, mais il n'est plus jamais utilisé quand
    // une séquence de liveness est fournie.
    selfiePath: z.string().optional(),

    // 🆕 [PHASE C — LIVENESS] LA SÉQUENCE DE PRÉSENCE.
    //
    // ⚠️ OPTIONNELLE AU NIVEAU DE ZOD, ET C'EST DÉLIBÉRÉ : son absence n'est pas
    // une erreur de validation, c'est un FAIT MÉTIER qui coûte 40 ou 45 points
    // dans le moteur de règles. Un 400 ferait perdre toute la saisie de l'agent
    // pour un cas qui doit au contraire produire un dossier — signalé, pénalisé,
    // mais existant. Rejeter ici reviendrait à traiter un signal de risque comme
    // un bug de formulaire.
    liveness: z
        .object({
            token: z.string().min(1),
            referencePath: z.string().min(1),
            action1Path: z.string().min(1),
            action2Path: z.string().min(1),
            attempts: z.number().int().min(1).max(50),
        })
        .optional(),

    // 🆕 [PHASE C — LIVENESS] CONTOURNEMENT TRACÉ.
    // Renseigné quand l'agent crée le dossier sans capture caméra. La longueur
    // minimale reprend celle imposée côté composant : une justification de deux
    // caractères ne justifie rien.
    livenessSkipReason: z.string().min(15).max(300).optional(),

    // 🆕 [PHASE C] CHAMP CONSERVÉ MAIS TOTALEMENT IGNORÉ.
    biometricScore: z.number().min(0).max(100).nullable().optional()
});

// ============================================================================
// 🆕 [AUDIT MOTEUR] JURIDICTIONS À RISQUE — LISTES DU GAFI
// ============================================================================
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
// ⚠️ Un format valide ne prouve RIEN sur l'existence réelle du document : il
// détecte les saisies manifestement erronées, pas la fraude.
const ID_FORMATS: Record<string, RegExp> = {
    Tunisia: /^[0-9]{8}$/,
    Morocco: /^[A-Z]{1,2}[0-9]{5,6}$/i,
    Algeria: /^[0-9]{18}$/,
    France: /^[0-9A-Z]{12}$/i,
    Egypt: /^[0-9]{14}$/,
};

// ----------------------------------------------------------------------------
// CALCUL D'ÂGE — FONCTION AUTONOME
// ----------------------------------------------------------------------------
// Appelée DEUX FOIS : sur la date saisie au formulaire, et sur celle lue par
// l'OCR. Le calcul tient compte du mois et du jour, pas seulement de l'année : à
// quelques jours près, un mineur passerait pour majeur.
//
// Renvoie `null` sur une date illisible plutôt qu'un NaN silencieux.
function computeAge(isoDate: string): number | null {
    const birthDate = new Date(isoDate);
    if (isNaN(birthDate.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }

    // Une date future ou aberrante n'est pas un âge valide.
    if (age < 0 || age > 130) return null;

    return age;
}

// Vérifie si un nom apparaît sur des listes de sanctions financières (AML) ou
// est une "Personne Politiquement Exposée" (PEP) — obligation légale en KYC.
//
// 🆕 [AUDIT MOTEUR] LA LISTE DE REPLI LOCALE A ÉTÉ SUPPRIMÉE, et le
// comportement en cas de panne est inversé.
//
// ❌ CE QUI EXISTAIT : une liste de neuf mots codés en dur comparés par
// SOUS-CHAÎNE. Elle produisait l'inverse d'un filet de sécurité : des FAUX
// POSITIFS sur des clients innocents (un "Vladimir Ben Salah" tunisien était
// signalé comme correspondance sanctions ET comme PEP) et AUCUN vrai positif.
//
// ❌ PIRE — LE "FAIL-OPEN" : quand l'API ne répondait pas et que la liste locale
// ne trouvait rien, la fonction renvoyait `sanctioned: false`. Le moteur ne
// voyait AUCUNE différence entre "vérifié, rien trouvé" et "pas vérifié".
//
// ✅ CE QUI LE REMPLACE : un drapeau `screeningFailed` explicite (+45 points).
//
// 🆕 [FIX API] DEUX BUGS CORRIGÉS QUI EMPÊCHAIENT TOUT APPEL D'ABOUTIR DEPUIS
// LE PREMIER JOUR — détails à leur emplacement plus bas.
async function performGlobalSanctionsLookup(name: string, country: string) {
    let apiSanctioned = false;
    let apiPep = false;
    let topScore = 0.0;

    // 🆕 Part du principe que le screening a ÉCHOUÉ, et ne repasse à `false`
    // qu'après une réponse valide — un oubli produira une alerte, pas un silence.
    let screeningFailed = true;
    let lookupSource = "Screening unavailable";

    const apiKey = process.env.OPENSANCTIONS_API_KEY;

    // 🆕 [FIX API] COURT-CIRCUIT SI LA CLÉ EST ABSENTE. Sans ce garde-fou, on
    // partait en appel réseau avec un en-tête vide pour récolter un 401 après
    // plusieurs secondes — du temps perdu sur un budget déjà tendu.
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
            // 🆕 [FIX PROD] Abandon au bout de 8 secondes.
            signal: AbortSignal.timeout(8000),
            headers: {
                "Content-Type": "application/json",
                // 🆕 [FIX API — BUG 1/2] Le préfixe était `Bearer`, or
                // OpenSanctions attend `ApiKey`. C'ÉTAIT LA CAUSE DU 401 : le
                // mot-clé fait partie de la valeur envoyée, le serveur compare la
                // chaîne entière. opensanctions.org/docs/api/authentication/
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
            // `queries`. L'API est ASYMÉTRIQUE. L'ancien code lisait
            // `data.queries?.q1?.results` — une clé inexistante. Le `|| []`
            // faisait le reste : jamais d'erreur, jamais de résultat.
            const results = data.responses?.q1?.results || [];

            // 🆕 LE SEUL ENDROIT OÙ LE SCREENING EST DÉCLARÉ RÉUSSI. Un HTTP 200
            // signifie que l'API a comparé le nom à ses index — qu'elle ait
            // trouvé ou non. "Zéro résultat" et "aucune recherche" sont deux
            // situations radicalement différentes.
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
            // 🆕 [FIX API] On lit le corps de la réponse d'erreur : un 401 pouvait
            // signifier trois choses très différentes sans moyen de trancher.
            // 401 = clé refusée, 429 = quota mensuel épuisé.
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

// Liste paginée + filtrée des dossiers KYC de l'entreprise de l'appelant. Tout
// est scopé par `companyId` dérivé de la session (jamais du query string) :
// impossible pour un agent de l'entreprise A de lister ceux de l'entreprise B.
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

        // 🆕 [PHASE C] `biometricScore` N'EST VOLONTAIREMENT PAS EXTRAIT.
        // Ne pas le destructurer est le meilleur garde-fou possible — TypeScript
        // refusera toute tentative future de l'utiliser par inadvertance.
        const {
            customerName, customerNameAr, email, type, cin, documentType, nationality,
            dateOfBirth, phoneNumber, idCardPath, selfiePath, liveness, livenessSkipReason,
        } = validationResult.data;

        // ====================================================================
        // 🆕 [PHASE C — LIVENESS] LE SELFIE EST L'IMAGE DE RÉFÉRENCE
        // ====================================================================
        // ⚠️ CETTE LIGNE DOIT VENIR AVANT TOUT LE RESTE : la comparaison faciale
        // en dépend, et elle est lancée plus bas dans le bloc parallèle. La
        // résoudre plus tard reviendrait à comparer la pièce d'identité à rien.
        //
        // 💡 L'image neutre de la séquence EST un selfie — un visage de face, en
        // pose neutre. La seule différence avec l'ancien champ, c'est qu'elle a
        // été capturée en direct au lieu d'être choisie dans une galerie. Toute
        // la comparaison faciale existante fonctionne donc sans modification, sur
        // une source strictement meilleure.
        //
        // Le repli sur `selfiePath` ne sert qu'aux appels sans séquence de
        // liveness : contournement tracé, ou onglet resté ouvert avec l'ancienne
        // version du formulaire.
        const effectiveSelfiePath = liveness?.referencePath ?? selfiePath ?? null;

        // ====================================================================
        // 🔒 VÉRIFICATION D'APPARTENANCE DES CHEMINS
        // ====================================================================
        // Le scénario à bloquer : un agent de l'entreprise A qui connaîtrait le
        // chemin d'un document de l'entreprise B pourrait l'attacher à SON
        // dossier — et le verrait s'afficher légitimement, puisque le contrôle
        // d'accès se base sur le propriétaire du DOSSIER, pas du fichier.
        //
        // 🆕 [PHASE C] LA LISTE À CONTRÔLER S'EST ALLONGÉE. Le serveur télécharge
        // désormais jusqu'à quatre fichiers pour ce dossier. Sans cette barrière,
        // on lui ferait analyser — et donc valider — des images appartenant à une
        // autre entreprise.
        const pathPrefix = `${companyId}/`;
        const pathsToCheck = [
            idCardPath,
            effectiveSelfiePath,
            liveness?.referencePath,
            liveness?.action1Path,
            liveness?.action2Path,
        ].filter((p): p is string => typeof p === "string" && p.length > 0);

        if (!pathsToCheck.every((p) => p.startsWith(pathPrefix))) {
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
        // qu'un dossier est encore "pending" ou "verified" pour CETTE entreprise
        // (un dossier "rejected" peut être resoumis).
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

        // ====================================================================
        // SIGNATURE DES DOCUMENTS, EN AMONT
        // ====================================================================
        // Deux modules ont besoin de ces URLs — l'OCR (pièce d'identité) et la
        // comparaison faciale (pièce d'identité + selfie). La vérification de
        // liveness, elle, signe ses propres URLs dans lib/liveness-verify.ts.
        //
        // 💡 120 secondes de validité : ces liens doivent survivre à toute la
        // durée du pipeline.
        //
        // 🔒 L'ÉCHEC N'EST PAS FATAL. Si la signature échoue, les URLs restent à
        // `null` : l'OCR se déclarera indisponible (+25) et la biométrie aussi
        // (+40). Le dossier part en revue manuelle — bien mieux qu'une erreur 500
        // qui ferait perdre toute la saisie de l'agent.
        let signedIdCardUrl: string | null = null;
        let signedSelfieUrl: string | null = null;

        try {
            const toSign = [idCardPath, effectiveSelfiePath].filter(
                (p): p is string => typeof p === "string" && p.length > 0
            );
            const signedUrls = await createSignedDocumentUrls(toSign, 120);
            signedIdCardUrl = signedUrls[idCardPath] ?? null;
            signedSelfieUrl = effectiveSelfiePath ? signedUrls[effectiveSelfiePath] ?? null : null;
        } catch (error) {
            console.error("[STORAGE] Signature des documents impossible :", error);
        }

        // --- MODULE 1 : OCR (lecture du document d'identité) ---
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

        try {
            if (!signedIdCardUrl) {
                throw new Error("Signed URL unavailable for the ID document.");
            }

            extraction = await extractDocumentData(signedIdCardUrl);

            if (!extraction.success) {
                ocrFailed = true;
            } else {
                // 🆕 [OCR] SI GEMINI A FOURNI LE NOM ARABE, ON L'UTILISE EN
                // PRIORITÉ — même quand l'agent n'a pas rempli le champ.
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

                // ⚠️ Les CIN tunisiennes ne portent PAS de date d'expiration : ce
                // contrôle renverra `null` sur la quasi-totalité du marché
                // principal. Il ne sert réellement que pour les passeports.
                documentExpired = isDocumentExpired(extraction.expiryDate);
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
        // MODULE 2 : RÉSOLUTION DE LA DATE DE NAISSANCE
        // ====================================================================
        // ⚠️ CE BLOC VIENT APRÈS L'OCR, ET CE N'EST PAS COSMÉTIQUE : il peut
        // s'appuyer sur la date lue sur le document.
        //
        // ❌ CE QUI EXISTAIT : `let clientAge = 30;`. Sans date saisie, le client
        // était traité comme un adulte de 30 ans et AUCUN signal n'était levé.
        //
        // ⚠️ POURQUOI C'ÉTAIT LE PLUS GRAVE DES FAIL-OPEN : la règle `isUnderage`
        // est un HARD_KILL — une obligation réglementaire. Omettre la date de
        // naissance DÉSACTIVAIT ce contrôle, silencieusement, sans la moindre
        // pénalité. Le champ étant optionnel, il suffisait de le laisser vide.
        const documentDob = extraction?.success ? extraction.dateOfBirth : undefined;
        const formDob = dateOfBirth?.trim() || undefined;

        // ⚠️ On ne compare QUE si les deux existent : une date absente n'est pas
        // une incohérence, c'est une information manquante.
        const dobMismatch = Boolean(formDob && documentDob && formDob !== documentDob.trim());

        const formAge = formDob ? computeAge(formDob) : null;
        const documentAge = documentDob ? computeAge(documentDob) : null;

        // ⚠️ ON RETIENT LE PLUS JEUNE DES DEUX ÂGES DISPONIBLES. C'est du
        // fail-closed appliqué à la minorité : quelqu'un qui saisit 1990 alors que
        // sa carte indique 2010 ne doit pas échapper au blocage. Une pénalité ne
        // remplace pas une interdiction.
        const availableAges = [formAge, documentAge].filter(
            (age): age is number => age !== null
        );

        const clientAge = availableAges.length > 0 ? Math.min(...availableAges) : null;

        const dobSource: "form" | "document" | "none" =
            formAge !== null ? "form" : documentAge !== null ? "document" : "none";

        const dobMissing = clientAge === null;
        const isUnderage = clientAge !== null && clientAge < 18;
        const isYoungAdult = clientAge !== null && clientAge >= 18 && clientAge < 25;

        // ====================================================================
        // 🆕 MODULES 3, 4 ET 5 EN PARALLÈLE — AML + BIOMÉTRIE + LIVENESS
        // ====================================================================
        // ⚠️ POURQUOI EN PARALLÈLE : ces trois contrôles sont totalement
        // indépendants. L'AML interroge OpenSanctions avec un NOM, la comparaison
        // faciale et le liveness interrogent Gemini avec des IMAGES DIFFÉRENTES —
        // aucun n'a besoin du résultat d'un autre.
        //
        // Enchaînés : 8 + 20 + 25 = 53 s, à ajouter aux 15 s de l'OCR, soit 68 s —
        // AU-DELÀ du plafond de 60 s de Vercel. En parallèle, le pire cas retombe
        // à 25 s, donc ~40 s au total. Le parallélisme n'est pas une optimisation
        // ici, c'est ce qui rend le pipeline possible.
        //
        // 💡 `Promise.all` n'échoue jamais ici : les trois fonctions rattrapent
        // leurs propres erreurs et renvoient un état d'indisponibilité explicite
        // plutôt que de lever.
        //
        // 💡 Quand aucune séquence n'est fournie (contournement tracé), on ne
        // lance pas la vérification : il n'y a rien à vérifier. On renvoie
        // directement un résultat "skipped" traité plus bas.
        const [amlScreening, faceMatch, livenessResult] = await Promise.all([
            performGlobalSanctionsLookup(customerName, nationality || ""),
            compareFacesServerSide(signedIdCardUrl, signedSelfieUrl),
            liveness
                ? verifyLivenessSequence(liveness.token, {
                      reference: liveness.referencePath,
                      action1: liveness.action1Path,
                      action2: liveness.action2Path,
                  })
                : Promise.resolve(null),
        ]);

        const normalizedEmail = String(email).toLowerCase();

        // ====================================================================
        // 🆕 [PHASE C — LIVENESS] LES QUATRE ÉTATS DE LA PRÉSENCE PHYSIQUE
        // ====================================================================
        // ⚠️ LA DISTINCTION ENTRE `livenessSkipped` ET `livenessUnavailable` EST
        // ESSENTIELLE, et elle n'est pas cosmétique :
        //
        //   • SKIPPED — l'agent a DÉCIDÉ de ne pas faire la capture et l'a
        //     justifié par écrit. C'est un choix humain, tracé, attribuable. Il
        //     coûte 45 points (aligné sur amlScreeningFailed).
        //
        //   • UNAVAILABLE — la capture a EU LIEU mais n'a pas pu être analysée
        //     (service injoignable, images illisibles, jeton expiré). Personne
        //     n'a rien décidé, c'est notre outil qui n'a pas su conclure. 40
        //     points, aligné sur biometricUnavailable.
        //
        // 💡 Les confondre reviendrait à traiter une décision humaine comme une
        // panne technique — et à rendre invisible un agent qui contourne
        // systématiquement le contrôle.
        //
        // ⚠️ ET SURTOUT : L'ABSENCE TOTALE DE SÉQUENCE, SANS JUSTIFICATION, EST
        // TRAITÉE COMME UN CONTOURNEMENT. Sans ça, il suffirait d'appeler cette
        // route directement en omettant le champ `liveness` pour échapper à toute
        // pénalité — exactement le fail-open qu'on a corrigé sur l'AML, l'OCR, la
        // biométrie et la date de naissance.
        const livenessSkipped = !liveness;
        const livenessPassed = livenessResult?.verdict === "passed";
        const livenessFailed = livenessResult?.verdict === "failed";
        const livenessUnavailable = livenessResult?.verdict === "unavailable";

        // Le verdict stocké en base. "skipped" n'est pas produit par
        // lib/liveness-verify.ts — c'est un état propre au dossier, pas au
        // contrôle.
        const storedLivenessVerdict = liveness ? livenessResult?.verdict ?? "unavailable" : "skipped";

        // ====================================================================
        // LES QUATRE FACTS BIOMÉTRIQUES DÉRIVENT DU VERDICT SERVEUR
        // ====================================================================
        // Les anciens seuils numériques (40/60/75) ont disparu : ils étaient
        // calibrés sur une distance euclidienne entre vecteurs — une mesure
        // mathématique. Gemini ne mesure pas, il juge.
        const biometricUnavailable = faceMatch.verdict === "unavailable";
        const faceMatchFailed = faceMatch.verdict === "different_person";
        const faceMatchWeak = faceMatch.verdict === "inconclusive";
        const faceMatchBorderline = faceMatch.verdict === "likely_same_person";

        // Conservé pour les règles COMBINÉES du moteur (nom + visage).
        const faceMismatch = faceMatchFailed || faceMatchWeak;

        // 💡 On ne pénalise QUE si un format est connu pour le pays déclaré.
        // Signaler un pays absent de la table reviendrait à sanctionner un client
        // parce que NOUS n'avons pas encodé sa règle.
        const idFormat = ID_FORMATS[nationality];
        const invalidIdFormat = idFormat ? !idFormat.test(cin) : false;

        const isBlacklistedJurisdiction = FATF_BLACKLIST.includes(nationality);
        const isGreylistedJurisdiction = FATF_GREYLIST.includes(nationality);

        // --- MODULE 6 : MOTEUR DE RÈGLES ---
        // 🆕 [AUDIT MOTEUR] `isStolenDocument` A ÉTÉ SUPPRIMÉ. Son calcul était
        // `cin.endsWith("999") || cin.endsWith("000")`, mais le message affirmait
        // "matched stolen/lost databases" — une DÉCLARATION FAUSSE inscrite dans
        // la piste d'audit, déclenchée sur ~1% des CIN au hasard.
        const facts = {
            isSanctionedName: amlScreening.sanctioned,
            isPep: amlScreening.isPep,
            amlScreeningFailed: amlScreening.screeningFailed,

            isDisposableEmail: ["yopmail.com", "mailinator.com", "trashmail.com"].some(d => normalizedEmail.endsWith(d)),
            invalidIdFormat,
            missingPhone: !phoneNumber || phoneNumber === "Not specified" || phoneNumber.trim() === "",
            isPassport: documentType === "Passport",

            isUnderage,
            // 🆕 [PHASE C] `isYoungAdult` NE COÛTE PLUS 20 POINTS À LUI SEUL : à
            // ce tarif, tout client de moins de 25 ans au dossier propre basculait
            // AUTOMATIQUEMENT en Medium Risk. Sur un marché à population jeune,
            // c'est une part importante des dossiers signalés à tort — et un
            // moteur qui alerte sur tout le monde n'alerte plus sur personne. Le
            // signal reste réel (le recrutement de mules cible les 18-25 ans) mais
            // n'est scoré qu'en COMBINAISON avec un email jetable.
            isYoungAdult,
            dobMissing,

            isBlacklistedJurisdiction,
            isGreylistedJurisdiction,

            ocrNameMismatch: !ocrFailed && !isNameOnDoc,
            ocrCinMismatch: !ocrFailed && !isCinOnDoc,
            ocrUnavailable: ocrFailed,
            // ⚠️ `documentExpired === true` uniquement : `null` signifie "date
            // illisible", pas "document valide".
            documentExpired: documentExpired === true,
            dobMismatch,

            faceMismatch,
            faceMatchFailed,
            faceMatchWeak,
            faceMatchBorderline,
            biometricUnavailable,

            // 🆕 [PHASE C — LIVENESS] Les quatre états de la présence physique.
            livenessPassed,
            livenessFailed,
            livenessUnavailable,
            livenessSkipped,
        };

        const engine = new Engine(kycRules);
        const { events } = await engine.run(facts);

        let riskScore = 0;
        let rationale: string[] = [];
        let isHardKilled = false;

        // Chaque règle déclenchée ajoute un message au rationale (traçabilité
        // humaine) et soit un "hard_kill" (score forcé à 100), soit des points
        // cumulatifs.
        //
        // 💡 Les événements "informational" (points: 0) et "trust_bonus" (points
        // négatifs) passent par la même branche.
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
        // 🆕 [PHASE C — LIVENESS] RATIONALE DE PRÉSENCE — EN TÊTE
        // ====================================================================
        // ⚠️ `unshift` LE PLACE AVANT MÊME LE RATIONALE BIOMÉTRIQUE, et c'est
        // délibéré : savoir si la personne était PHYSIQUEMENT LÀ prime sur toute
        // comparaison de visages. Un visage qui correspond parfaitement à une
        // photo trouvée en ligne ne prouve rien du tout.
        if (livenessSkipped) {
            rationale.unshift(
                livenessSkipReason
                    ? `⚠️ LIVENESS BYPASSED by the agent. Stated reason: "${livenessSkipReason}" — no evidence exists that the applicant was physically present.`
                    : "⚠️ NO LIVENESS SEQUENCE was submitted with this file, and no justification was recorded. Physical presence is entirely unproven."
            );
        } else if (livenessFailed) {
            rationale.unshift(
                `⛔ LIVENESS FAILED: ${livenessResult?.reason ?? "The requested actions were not performed."}`
            );
        } else if (livenessUnavailable) {
            rationale.unshift(
                `⚠️ LIVENESS UNVERIFIED: ${livenessResult?.reason ?? "The sequence could not be analysed."}`
            );
        } else if (livenessPassed) {
            rationale.unshift(`✅ LIVENESS CONFIRMED: ${livenessResult?.reason}`);
        }

        // 🆕 [PHASE C] LE NOMBRE DE TENTATIVES, SIGNALÉ AU-DELÀ DE TROIS.
        //
        // ⚠️ ON NE PÉNALISE PAS, ON REND VISIBLE. Une personne réelle rate parfois
        // une pose — deux ou trois essais sont parfaitement normaux, et les
        // plafonner pénaliserait des clients légitimes. Mais dix essais sur un
        // même dossier est un signal : un fraudeur qui relance jusqu'à tomber sur
        // les deux actions qu'il sait imiter. À charge de l'agent qui relit.
        if (liveness && liveness.attempts > 3) {
            rationale.push(
                `🔍 LIVENESS RETRIES (informational, no score impact): the sequence was restarted ${liveness.attempts} times before completing. Repeated retries can be legitimate (poor lighting, applicant not understanding the instruction) but an unusually high count may indicate someone waiting for a favourable pair of actions.`
            );
        }

        // 🔭 [PHASE C] Indices d'usurpation relevés pendant la séquence.
        //
        // ⚠️ SIGNALÉS SANS PÉNALITÉ ASSOCIÉE. Un modèle de langage n'est pas un
        // détecteur d'attaque par présentation : un reflet de fenêtre, des
        // lunettes ou la retouche automatique d'un téléphone produisent
        // régulièrement de faux positifs. On observe la fiabilité du signal sur de
        // vrais dossiers avant d'en faire un critère.
        const allSpoofingSignals = [
            ...(livenessResult?.spoofingSignals ?? []),
            ...faceMatch.spoofingSignals,
        ];

        if (allSpoofingSignals.length > 0) {
            rationale.push(
                `🔍 PRESENTATION NOTICE (informational, no score impact): possible signs that the captured images are not live — ${[...new Set(allSpoofingSignals)].join(", ")}.`
            );
        }

        // ====================================================================
        // RATIONALE BIOMÉTRIQUE — ALIGNÉ SUR LE VERDICT
        // ====================================================================
        // 💡 LA SIMILARITÉ EST AFFICHÉE ENTRE PARENTHÈSES, JAMAIS SEULE. Le
        // verdict est la décision, le pourcentage n'est qu'un ordre de grandeur
        // fourni par le modèle. Les présenter au même niveau laisserait croire
        // qu'on dispose d'une mesure calibrée.
        const similarityNote =
            faceMatch.similarity !== null ? ` (model estimate: ${faceMatch.similarity}%)` : "";

        if (biometricUnavailable) {
            rationale.push(
                `⚠️ BIOMETRIC UNAVAILABLE: ${faceMatch.reason} Identity was NOT biometrically verified — manual visual comparison is mandatory.`
            );
        } else if (faceMatchFailed) {
            rationale.push(
                `⛔ BIOMETRIC FAILURE${similarityNote}: server-side comparison concluded the face and the document portrait show different people. ${faceMatch.reason}`
            );
        } else if (faceMatchWeak) {
            rationale.push(
                `⚠️ BIOMETRIC INCONCLUSIVE${similarityNote}: the comparison could not be settled automatically. ${faceMatch.reason} Manual visual comparison required.`
            );
        } else if (faceMatchBorderline) {
            rationale.push(
                `🟡 BIOMETRIC BORDERLINE${similarityNote}: likely the same person, but below the high-confidence threshold. ${faceMatch.reason}`
            );
        } else {
            rationale.push(
                `✅ BIOMETRIC MATCH${similarityNote}: the captured face matches the document portrait. ${faceMatch.reason}`
            );
        }

        // ⚠️ CE MESSAGE EST IMPORTANT POUR L'AUDIT : il indique noir sur blanc que
        // la comparaison a eu lieu SUR LE SERVEUR. Les anciens dossiers reposaient
        // sur un calcul navigateur non vérifiable — un auditeur doit pouvoir faire
        // la différence entre les deux périodes.
        rationale.push(
            faceMatch.source === "gemini"
                ? "✅ BIOMETRIC SOURCE: Server-side facial comparison (Gemini Vision). The client-supplied score was ignored."
                : "⚠️ BIOMETRIC SOURCE: Server-side comparison could not be performed. No biometric evidence exists for this file."
        );

        // ====================================================================
        // TRAÇABILITÉ DE LA DATE DE NAISSANCE
        // ====================================================================
        // ⚠️ L'AGENT DOIT SAVOIR D'OÙ VIENT LA DATE QUI A FONDÉ LA DÉCISION. Sans
        // cette mention, un dossier vérifié depuis la date lue sur la carte serait
        // indiscernable d'un dossier vérifié depuis une saisie manuelle — alors
        // que ce ne sont pas du tout les mêmes garanties.
        if (dobMissing) {
            rationale.push(
                "⚠️ AGE CHECK: no date of birth was available from either the application form or the identity document. The mandatory minor check could NOT be performed."
            );
        } else if (dobSource === "document") {
            rationale.push(
                `✅ AGE CHECK: the application form had no date of birth, so the age (${clientAge}) was derived from the date printed on the identity document — a stronger source than manual entry.`
            );
        } else {
            rationale.push(`✅ AGE CHECK: applicant age is ${clientAge}, verified from the declared date of birth.`);
        }

        // Traçabilité de la SOURCE du screening AML.
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
        //
        // 💡 LA BORNE INFÉRIEURE COMPTE DEPUIS L'AJOUT DU BONUS DE LIVENESS
        // (-10) : sans elle, un dossier parfait descendrait sous zéro et le
        // formatage produirait "-15". Elle empêche aussi qu'un crédit accumulé ne
        // masque un problème réel apparu plus tard.
        riskScore = Math.min(100, Math.max(0, riskScore));
        const formattedScore = riskScore.toString().padStart(3, '0');

        // Seuils métier : 0-19 = Low, 20-49 = Medium, 50-100 = High.
        let riskLevel = "Low";
        if (riskScore >= 50) riskLevel = "High";
        else if (riskScore >= 20) riskLevel = "Medium";

        const aiRationaleString = rationale.length > 0
            ? rationale.join(" ")
            : `Profile analyzed successfully. Source: ${amlScreening.source}. Document validation successful.`;

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
                // 🆕 [PHASE C] L'image de référence du liveness sert de selfie.
                selfiePath: effectiveSelfiePath,

                // 🆕 [PHASE C — LIVENESS] Les preuves et le verdict.
                //
                // 💡 POURQUOI CONSERVER LES TROIS IMAGES ALORS QUE LE VERDICT
                // SUFFIRAIT À LA DÉCISION : parce qu'un verdict sans les pièces qui
                // l'ont produit n'est pas auditable. Un compliance officer qui
                // conteste un rejet — ou un régulateur qui contrôle un dossier
                // accepté — doit pouvoir REGARDER ce sur quoi la machine s'est
                // prononcée. Et le contrôle n'est PAS rejouable a posteriori : il
                // dépend d'un jeton qui expire en trois minutes.
                livenessReferencePath: liveness?.referencePath ?? null,
                livenessAction1Path: liveness?.action1Path ?? null,
                livenessAction2Path: liveness?.action2Path ?? null,
                livenessVerdict: storedLivenessVerdict,
                livenessSkipReason: livenessSkipReason ?? null,
                livenessAttempts: liveness?.attempts ?? null,

                status: "pending",
                score: formattedScore,
                riskLevel: riskLevel,
                aiRationale: aiRationaleString,
                auditLogs: {
                    create: {
                        action: "CREATED",
                        // 🆕 [PHASE C] Le verdict de liveness et la source de la
                        // date de naissance figurent explicitement dans la piste
                        // d'audit.
                        details: `KYC Pipeline initialized. Modules processed: Liveness (${storedLivenessVerdict}${liveness?.attempts && liveness.attempts > 1 ? `, ${liveness.attempts} attempts` : ""}), Server-side Biometrics (${faceMatch.source}, verdict: ${faceMatch.verdict}), Age Check (${clientAge ?? "unavailable"}, source: ${dobSource}), AML Screening, OCR Document Analysis. Calculated Risk Score: ${riskScore}/100.`,
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