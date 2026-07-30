// ============================================================================
// 📁 MOTEUR KYC — LISTE (GET) + CRÉATION DE DOSSIER (POST)
// ============================================================================
// C'est le cœur métier de TrustVerify. POST orchestre tout le pipeline de
// vérification d'identité en une seule requête synchrone :
//   1. Validation Zod du payload + garde RBAC (isolation multi-tenant)
//   2. Anti-doublon (email/CIN déjà en cours de traitement pour CETTE entreprise)
//   3. Calcul de l'âge à partir de la date de naissance
//   4. OCR du document d'identité (Tesseract.js, FR/EN/AR) pour cross-vérifier
//      le nom/CIN saisis au formulaire contre le texte réellement présent sur l'image
//   5. Screening AML/PEP (sanctions financières) via OpenSanctions + repli local
//   6. Vérification biométrique (⚠️ voir note critique sur `biometricScore` plus bas)
//   7. Moteur de règles déclaratif (json-rules-engine + lib/kyc-rules.json) qui
//      transforme tous ces "facts" en un score de risque 0-100 + un rationale humain
//   8. Écriture du dossier + de sa première ligne d'audit + notification si High Risk
//
// ✅ [PHASE B — RÉSOLU] Les documents ne sont plus stockés derrière des URLs
// publiques permanentes. Cette route reçoit désormais des CHEMINS vers un
// bucket Supabase privé, et génère elle-même une URL signée temporaire quand
// elle a besoin de lire un fichier (voir le module OCR plus bas).
//
// ⚠️ FAILLE CONNUE (roadmap Phase C, non corrigée ici) : `biometricScore` est
// calculé CÔTÉ CLIENT par face-api.js dans new-verification/page.tsx, puis
// envoyé tel quel dans le body. Le schéma Zod ci-dessous le valide juste comme
// un nombre — rien n'empêche un client malveillant d'envoyer
// `biometricScore: 99.9` sans aucune photo réelle. Le calcul devrait être refait
// ici, côté serveur, en même temps que l'ajout du liveness.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Engine } from "json-rules-engine";
import kycRules from "@/lib/kyc-rules.json";
import Tesseract from "tesseract.js";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";
// 🆕 [PHASE B] Génération d'URLs signées vers le bucket privé.
import { createSignedDocumentUrl } from "@/lib/storage";

// 🆕 [FIX PROD] Durée max d'exécution de cette fonction sur Vercel.
// Sans cette ligne, le plan Hobby coupe la fonction à 10 secondes — or l'OCR
// Tesseract (3 langues, téléchargement des modèles + analyse) dépasse
// largement ce délai, ce qui laissait le formulaire bloqué indéfiniment sur
// "Analyzing AI Risk..." en production alors que tout marchait en local.
// 60s est le maximum autorisé sur le plan Hobby.
// ⚠️ Solution temporaire : la vraie correction est de sortir l'OCR et le
// screening du cycle requête/réponse (roadmap Phase C — pipeline asynchrone).
export const maxDuration = 60;

// Le body accepté à la création d'un dossier KYC.
//
// 🆕 [PHASE B] `idCardPath`/`selfiePath` remplacent `idCardUrl`/`selfieUrl`.
// Ce sont des CHEMINS internes au bucket privé Supabase (ex:
// "cmp_a1b2/9f8e7d-idcard.jpg"), obtenus par le formulaire auprès de
// /api/kyc-documents/upload-url. Cette route ne reçoit toujours pas les
// fichiers eux-mêmes — ils sont partis directement du navigateur vers Supabase.
//
// 💡 Noter le changement de validateur : `.url()` est devenu `.min(1)`. Un
// chemin n'est PAS une URL — il n'a ni protocole ni domaine. Garder `.url()`
// rejetterait systématiquement les chemins valides.
const customerRegistrationSchema = z.object({
    customerName: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
    email: z.string().email("Format d'email invalide"),
    type: z.string().min(1, "Le type de procédure est requis"),
    cin: z.string().min(4, "Le numéro d'identification est trop court"),
    documentType: z.string().min(1, "Le type de document est requis"),
    nationality: z.string().min(1, "La nationalité est requise"),
    dateOfBirth: z.string().optional().or(z.literal('')),
    phoneNumber: z.string().optional().or(z.literal('')),
    idCardPath: z.string().min(1, "Le document d'identité est manquant"),
    selfiePath: z.string().min(1, "Le selfie est manquant"),
    biometricScore: z.number().nullable().optional() 
});

// Vérifie si un nom apparaît sur des listes de sanctions financières (AML) ou
// est une "Personne Politiquement Exposée" (PEP) — obligation légale en KYC.
// Stratégie à deux niveaux :
//   - Niveau 1 (préféré) : appel à l'API OpenSanctions, la vraie base de
//     référence utilisée par l'industrie (sanctions ONU/UE/US + PEP mondiaux).
//   - Niveau 2 (repli) : si l'API échoue/timeout/clé absente, on retombe sur
//     une liste de mots-clés codée en dur ci-dessous — un filet de sécurité
//     TRÈS approximatif (matching par sous-chaîne), à ne pas confondre avec un
//     vrai screening. ⚠️ Un "Vladimir Ben Salah" innocent serait par exemple
//     faussement flaggé PEP à cause du mot "vladimir". Un vrai produit
//     international ferait "fail-closed" ici (forcer une revue manuelle)
//     plutôt que de faire confiance à cette liste.
async function performGlobalSanctionsLookup(name: string, country: string) {
    let apiSanctioned = false;
    let apiPep = false;
    let lookupSource = "Local Heuristic Engine";
    let topScore = 0.0;

    const normalized = name.toLowerCase().trim();
    const localSanctionList = ["malicious", "scam", "fraud", "hacker", "fake", "darknet", "vladimir", "putin", "al capone"];
    const localPepList = ["politician", "minister", "president", "gouverneur", "putin", "vladimir"];

    const localSanctionMatch = localSanctionList.some(badWord => normalized.includes(badWord));
    const localPepMatch = localPepList.some(pepWord => normalized.includes(pepWord));

    try {
        const apiKey = process.env.OPENSANCTIONS_API_KEY;

        const response = await fetch("https://api.opensanctions.org/match/default", {
            method: "POST",
            // 🆕 [FIX PROD] Abandon au bout de 8 secondes. Sans ce garde-fou, une
            // API OpenSanctions lente bloquait toute la création du dossier
            // jusqu'à la mort de la fonction serverless. Le `catch` en dessous
            // bascule automatiquement sur la liste locale de repli.
            signal: AbortSignal.timeout(8000),
            headers: {
                "Content-Type": "application/json",
                ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {})
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
            const results = data.queries?.q1?.results || [];
            
            if (results.length > 0) {
                const sortedCandidates = results.sort((a: any, b: any) => b.score - a.score);
                const candidate = sortedCandidates[0];
                topScore = candidate.score;

                if (topScore > 0.50) {
                    const topics = [
                        ...(candidate.topics || []),
                        ...(candidate.properties?.topics || [])
                    ];

                    apiSanctioned = topics.includes("sanction") || topics.includes("sanctions");
                    apiPep = topics.includes("role.pep") || topics.includes("pep");
                    lookupSource = "OpenSanctions API (Live Production Index)";
                }
            }
        } else {
            console.warn("OpenSanctions API HTTP Error:", response.status);
        }
    } catch (error) {
        console.error("OpenSanctions connection timeout or failure:", error);
    }

    return {
        sanctioned: apiSanctioned || localSanctionMatch,
        isPep: apiPep || localPepMatch,
        source: (apiSanctioned || apiPep) ? lookupSource : (localSanctionMatch || localPepMatch ? "Local Hardcoded Match" : lookupSource),
        confidenceScore: topScore > 0 ? topScore : (localSanctionMatch || localPepMatch ? 1.0 : 0.0)
    };
}

// Liste paginée + filtrée des dossiers KYC de l'entreprise de l'appelant, avec
// les compteurs affichés en haut du dashboard (`stats`). Tout est scopé par
// `companyId` dérivé de la session (jamais du query string) : impossible pour
// un agent de l'entreprise A de lister/compter les dossiers de l'entreprise B.
//
// 💡 Cette liste ne renvoie PAS d'URLs signées : elle n'affiche que des
// métadonnées textuelles (nom, statut, score). Signer deux URLs par dossier
// pour une page de 5 résultats coûterait 10 appels inutiles à Supabase. Les
// documents ne sont signés qu'à l'ouverture d'une fiche précise.
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
        if (!guard.isValid) return guard.response!;

        const { companyId } = guard;

        // Paramètres de recherche/pagination/tri, tous optionnels avec valeurs
        // par défaut raisonnables (page 1, 5 par page, tri par ancienneté).
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

        // ⚠️ Ces 4 compteurs de stats sont exécutés en SÉRIE (await un par un)
        // alors qu'ils sont indépendants — ils pourraient être parallélisés
        // dans un seul Promise.all (comme requests/filteredTotal juste
        // au-dessus) pour réduire la latence totale de la requête.
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

// Crée un nouveau dossier KYC et exécute tout le pipeline de scoring en une
// seule requête (voir le résumé en tête de fichier). Appelé par le formulaire
// dashboard/customers/new-verification/page.tsx une fois les fichiers déjà
// envoyés dans le bucket privé Supabase.
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
        if (!guard.isValid) return guard.response!;

        // companyId/serverAgentId viennent de la SESSION SERVEUR, jamais du
        // body — c'est ce qui empêche un client de falsifier "pour qui" ou
        // "au nom de qui" ce dossier est créé (cloisonnement B2B + intégrité
        // de la piste d'audit).
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

        const { customerName, email, type, cin, documentType, nationality, dateOfBirth, phoneNumber, idCardPath, selfiePath, biometricScore } = validationResult.data;

        // ====================================================================
        // 🆕 [PHASE B] 🔒 VÉRIFICATION D'APPARTENANCE DES CHEMINS
        // ====================================================================
        // Les chemins arrivent du CLIENT (le formulaire les a reçus de
        // /api/kyc-documents/upload-url et les renvoie ici). On ne peut donc
        // pas leur faire aveuglément confiance.
        //
        // Le scénario à bloquer : un agent malveillant de l'entreprise A qui
        // connaîtrait le chemin d'un document de l'entreprise B pourrait
        // l'attacher à SON dossier — et le verrait ensuite s'afficher
        // légitimement, puisque le contrôle d'accès à l'affichage se base sur
        // le propriétaire du DOSSIER, pas sur celui du fichier.
        //
        // La parade est directe : tous nos chemins commencent par le companyId
        // (voir buildDocumentPath dans lib/storage.ts). Un chemin qui ne
        // commence pas par CELUI DE LA SESSION est forcément illégitime.
        //
        // 💡 En pratique cette attaque est déjà très difficile (les chemins
        // contiennent 32 caractères aléatoires, impossibles à deviner), mais
        // c'est exactement le principe de défense en profondeur : on ne fait
        // pas reposer la sécurité sur le seul fait qu'une valeur soit dure à
        // deviner.
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
                OR: [ { email: email }, { cin: cin } ],
                status: { in: ["pending", "verified"] }
            }
        });
        if (existingRecord) {
            return NextResponse.json({ error: "This applicant or identification document is already linked to an active KYC pipeline." }, { status: 409 });
        }

        // --- MODULE 1 : VÉRIFICATION D'ÂGE ---
        // Calcul d'âge précis (tient compte du mois/jour, pas juste l'année),
        // car un mineur (<18) doit être bloqué (hard_kill dans le moteur de
        // règles) et un jeune adulte (<25) génère un malus statistique.
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

        // --- MODULE 2 : OCR (Reconnaissance de texte sur le document) ---
        // Tesseract.js lit l'image de la pièce d'identité en 3 langues (EN/FR/AR,
        // pertinent pour le marché tunisien) et on vérifie que le nom et le CIN
        // SAISIS AU FORMULAIRE apparaissent bien DANS le texte extrait de l'image
        // — ça détecte un formulaire rempli avec un nom qui ne correspond pas
        // au document uploadé. Si l'OCR échoue (image illisible, etc.), on ne
        // bloque pas le dossier : on le marque pour revue manuelle (`ocrFailed`).
        //
        // 🆕 [PHASE B] Tesseract a besoin d'une URL téléchargeable — or on ne
        // dispose plus que d'un chemin vers un bucket PRIVÉ. On fabrique donc
        // ici, côté serveur, une URL signée de courte durée juste pour cette
        // lecture. Elle ne quitte jamais le serveur et expire d'elle-même.
        let ocrText = "";
        let ocrFailed = false;
        let isNameOnDoc = false;
        let isCinOnDoc = false;

        try {
            // 🆕 60 secondes de validité : largement au-delà du budget OCR de
            // 35s ci-dessous, pour qu'une lenteur réseau ne fasse jamais
            // expirer le lien EN COURS de téléchargement — ce qui produirait un
            // échec impossible à diagnostiquer.
            const signedIdCardUrl = await createSignedDocumentUrl(idCardPath, 60);

            // 🆕 [FIX PROD] Course entre l'OCR et un chronomètre de 35 secondes.
            // Sur Vercel, Tesseract doit télécharger ses modèles de langue à
            // froid (l'arabe est volumineux) puis analyser sur 2 cœurs — ça
            // pouvait dépasser la limite de la fonction et laisser l'utilisateur
            // bloqué à l'infini. Si le délai est dépassé, la promesse est
            // rejetée, le `catch` juste en dessous passe `ocrFailed = true`,
            // et le dossier est créé normalement mais marqué pour revue
            // manuelle. Mieux vaut un dossier créé et signalé qu'un formulaire
            // figé. Le budget de 35s laisse ~25s pour le reste du pipeline
            // (AML, moteur de règles, écritures Prisma) sous le plafond de 60s.
            const OCR_TIMEOUT_MS = 35000;
            const { data } = await Promise.race([
                Tesseract.recognize(signedIdCardUrl, 'eng+fra+ara'),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error("OCR timeout")), OCR_TIMEOUT_MS)
                ),
            ]);
            ocrText = data.text.toLowerCase();

            const nameParts = String(customerName).toLowerCase().split(" ");
            isNameOnDoc = nameParts.every((part: string) => ocrText.includes(part));
            isCinOnDoc = ocrText.includes(String(cin).toLowerCase());
        } catch (error) {
            // 💡 Ce `catch` couvre désormais DEUX familles d'échec : l'OCR
            // lui-même (image illisible, dépassement du délai) et la signature
            // de l'URL (variables d'environnement Supabase manquantes, fichier
            // absent du bucket). Dans les deux cas, la conséquence métier est
            // identique — on ne peut pas lire le document — donc le traitement
            // est le même : revue manuelle, sans bloquer la création du dossier.
            console.error("Critical OCR Extraction failed. Falling back to manual review:", error);
            ocrFailed = true;
        }

        // --- MODULE 3 : AML/PEP (sanctions financières) ---
        const amlScreening = await performGlobalSanctionsLookup(customerName, nationality || "");
        const normalizedEmail = String(email).toLowerCase();
        // Seuil arbitraire : en dessous de 60% de similarité faciale, on
        // considère que le selfie et la photo du document ne correspondent
        // pas. Rappel : `biometricScore` vient du client (voir note critique
        // en tête de fichier) — ce seuil est donc contournable pour l'instant.
        const faceMismatchDetected = biometricScore !== null && biometricScore !== undefined && biometricScore < 60;

        // --- MODULE 4 : MOTEUR DE RÈGLES ---
        // Tous les signaux calculés ci-dessus sont regroupés en un seul objet
        // "facts", passé au moteur déclaratif (json-rules-engine + kyc-rules.json)
        // qui décide des pénalités à appliquer. Ce découplage permet de modifier
        // les règles métier (points, seuils, messages) sans toucher au code.
        const facts = {
            isSanctionedName: amlScreening.sanctioned,
            isStolenDocument: String(cin).endsWith("999") || String(cin).endsWith("000"),
            isDisposableEmail: ["yopmail.com", "mailinator.com", "trashmail.com"].some(d => normalizedEmail.endsWith(d)),
            invalidCinFormat: (nationality === "Tunisia" || nationality === "TN") && !/^[0-9]{8}$/.test(cin),
            missingPhone: !phoneNumber || phoneNumber === "Not specified" || phoneNumber.trim() === "",
            isPassport: documentType === "Passport",
            isUnderage: isUnderage,
            isYoungAdult: isYoungAdult,
            ocrNameMismatch: !ocrFailed && !isNameOnDoc,
            ocrCinMismatch: !ocrFailed && !isCinOnDoc,
            faceMismatch: faceMismatchDetected 
        };

        const engine = new Engine(kycRules);
        const { events } = await engine.run(facts);

        let riskScore = 0;
        let rationale: string[] = [];
        let isHardKilled = false;

        // Chaque règle déclenchée ajoute un message au rationale (traçabilité
        // humaine de la décision) et soit un "hard_kill" (rejet automatique
        // immédiat, ex: mineur ou nom sanctionné — le score est forcé à 100
        // quels que soient les autres points), soit des points de risque
        // cumulatifs (ex: email jetable, incohérence OCR...).
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

        if (amlScreening.isPep) {
            riskScore += 15;
            rationale.push(`NOTICE: Applicant verified as a Politically Exposed Person (PEP). Detection Source: ${amlScreening.source}.`);
        }

        if (biometricScore !== null && biometricScore !== undefined) {
            if (faceMismatchDetected) {
                rationale.unshift(`⛔ BIOMETRIC FAILURE: Face match score is ${biometricScore.toFixed(1)}%. The face on the Live Selfie does NOT match the ID Document photo.`);
            } else {
                rationale.unshift(`✅ BIOMETRIC SUCCESS: Face match verified with ${biometricScore.toFixed(1)}% similarity.`);
            }
        } else {
            rationale.unshift(`⚠️ BIOMETRIC WARNING: Face detection skipped or failed to extract geometric landmarks.`);
        }

        if (ocrFailed) {
            rationale.push("NOTICE: Image parsing skipped or image unreadable. Manual document verification required.");
        } else if (facts.ocrNameMismatch || facts.ocrCinMismatch) {
            rationale.push("⚠️ OCR COMPLETED: Structural inconsistencies found. Form metadata does not match document text extraction.");
        } else {
            rationale.push("✅ OCR COMPLETED: High correspondence. Form data matches document text extraction.");
        }

        // Le score est borné [0, 100] puis formaté en chaîne de 3 chiffres
        // ("007", "085"...) — c'est ce format que le score est stocké tel quel
        // (voir schema.prisma, `score String?`), d'où les helpers de parsing
        // (`getNumericScore`) côté frontend pour le retransformer en nombre.
        riskScore = Math.min(100, Math.max(0, riskScore));
        const formattedScore = riskScore.toString().padStart(3, '0');

        // Seuils métier : 0-19 = Low, 20-49 = Medium, 50-100 = High.
        // C'est ce riskLevel qui déclenche (ou non) la notification ci-dessous.
        let riskLevel = "Low";
        if (riskScore >= 50) riskLevel = "High";
        else if (riskScore >= 20) riskLevel = "Medium";

        const aiRationaleString = rationale.length > 0 
            ? rationale.join(" ") 
            : `Profile analyzed successfully. Source: ${amlScreening.source}. Client Age: ${clientAge}. Document validation successful.`;

        const newRequest = await prisma.verificationRequest.create({
            data: {
                customerName,
                email,
                type,
                cin,
                documentType,
                nationality,
                dateOfBirth,
                phoneNumber,
                userId: serverAgentId!, 
                companyId: companyId!,  
                // 🆕 [PHASE B] On enregistre les CHEMINS. Les colonnes
                // idCardUrl/selfieUrl restent volontairement nulles pour tout
                // nouveau dossier : elles n'existent plus que pour les dossiers
                // antérieurs à cette migration, qui n'ont pas de chemin.
                // C'est ce qui permet à l'affichage de trancher simplement :
                // chemin présent → URL signée, sinon → ancien lien public.
                idCardPath,
                selfiePath,
                status: "pending", 
                score: formattedScore,
                riskLevel: riskLevel,
                aiRationale: aiRationaleString,
                
                auditLogs: {
                    create: {
                        action: "CREATED",
                        details: `KYC Pipeline initialized. Modules processed: Biometrics, Age Check (${clientAge}yo), AML Screening, OCR Document Analysis. Calculated Risk Score: ${riskScore}/100.`,
                        agentId: serverAgentId!, 
                        companyId: companyId!
                    }
                }
            },
        });

        // 💡 NOUVEAU : ALERTE HIGH RISK
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