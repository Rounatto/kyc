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
//   5. Screening AML/PEP (sanctions financières) via OpenSanctions
//   6. Vérification biométrique (⚠️ voir note critique sur `biometricScore` plus bas)
//   7. Moteur de règles déclaratif (json-rules-engine + lib/kyc-rules.json) qui
//      transforme tous ces "facts" en un score de risque 0-100 + un rationale humain
//   8. Écriture du dossier + de sa première ligne d'audit + notification si High Risk
//
// 🆕 [AUDIT MOTEUR] Ce fichier a été revu en profondeur. Quatre corrections
// structurelles, détaillées à leur emplacement :
//   • FAIL-CLOSED sur le screening AML (la panne ne passe plus pour un succès)
//   • Suppression de la fausse détection de "document volé"
//   • Biométrie graduée + pénalité quand elle est absente
//   • Le PEP et les juridictions à risque passent dans le moteur de règles
//
// ⚠️ FAILLE CONNUE (roadmap Phase C, non corrigée ici) : `biometricScore` est
// calculé CÔTÉ CLIENT par face-api.js dans new-verification/page.tsx, puis
// envoyé tel quel dans le body. Le schéma Zod ci-dessous le valide juste comme
// un nombre — rien n'empêche un client malveillant d'envoyer
// `biometricScore: 99.9` sans aucune photo réelle. Le calcul devrait être refait
// ici, côté serveur, en même temps que l'ajout du liveness.
//
// ⚠️ LIMITE CONNUE — COMPARAISON OCR EN ÉCRITURE ARABE : les CIN tunisiennes
// portent le nom en arabe, alors que le formulaire le collecte en alphabet
// latin. La comparaison `ocrText.includes("rayen")` sur un texte arabe échoue
// donc SYSTÉMATIQUEMENT, et pénalise à tort tous les dossiers tunisiens de 40
// points. Correction prévue : ajouter un champ "nom en arabe" au formulaire, et
// comparer l'OCR à celui-là plutôt qu'à la graphie latine.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Engine } from "json-rules-engine";
import kycRules from "@/lib/kyc-rules.json";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";
import { createSignedDocumentUrl } from "@/lib/storage";
// 🆕 [ARABE] Comparaison de noms tolérante aux erreurs d'OCR et aux variantes
// d'écriture arabe (voir lib/arabic.ts).
import { matchNameAgainstOcr, matchIdNumberAgainstOcr, containsArabic } from "@/lib/arabic";
// 🆕 [OCR] Tesseract n'est plus appelé directement : il est encapsulé dans
// lib/document-ocr.ts comme repli derrière Gemini Vision.
import { extractDocumentData, isDocumentExpired } from "@/lib/document-ocr";

// 🆕 [FIX PROD] Durée max d'exécution de cette fonction sur Vercel.
// Sans cette ligne, le plan Hobby coupe la fonction à 10 secondes — or l'OCR
// Tesseract (3 langues, téléchargement des modèles + analyse) dépasse
// largement ce délai, ce qui laissait le formulaire bloqué indéfiniment sur
// "Analyzing AI Risk..." en production alors que tout marchait en local.
// 60s est le maximum autorisé sur le plan Hobby.
// ⚠️ Solution temporaire : la vraie correction est de sortir l'OCR et le
// screening du cycle requête/réponse (roadmap Phase C — pipeline asynchrone).
export const maxDuration = 60;

const customerRegistrationSchema = z.object({
    customerName: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
    // 🆕 [ARABE] Nom tel qu'il figure SUR LA CARTE, en écriture arabe.
    //
    // ⚠️ OPTIONNEL, et c'est essentiel : tous les postes n'ont pas de clavier
    // arabe installé, et un client étranger (passeport français) n'a aucun nom
    // arabe à saisir. Quand le champ est vide, le système retombe simplement
    // sur la comparaison latine — le comportement actuel.
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
    biometricScore: z.number().nullable().optional() 
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
//
// 💡 Les noms sont en anglais car c'est ce que le formulaire transmet : il
// convertit le code pays en libellé via la locale `en` de
// react-phone-number-input (voir new-verification/page.tsx).

// LISTE NOIRE — "appel à l'action". Aucune institution financière ne peut
// légalement entrer en relation d'affaires avec ces juridictions sans
// autorisation spécifique. D'où le `hard_kill` dans kyc-rules.json.
const FATF_BLACKLIST = ["Iran", "North Korea", "Korea, North", "Myanmar", "Burma"];

// LISTE GRISE — "surveillance renforcée". La relation reste possible, mais elle
// impose une vigilance accrue. D'où une pénalité forte sans rejet automatique.
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
// totalement inventé passait sans le moindre signal — un contrôle de format
// n'existant que pour un pays sur deux cents ne protège pas grand-chose.
//
// 💡 Volontairement limité aux pays réalistes de ce marché. Couvrir 200 pays
// demanderait une bibliothèque dédiée, et des règles approximatives
// produiraient surtout des faux positifs sur des clients légitimes.
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
// comportement en cas de panne est inversé. Voici pourquoi.
//
// ❌ CE QUI EXISTAIT : une liste de neuf mots codés en dur
// (["malicious", "fraud", "vladimir", "putin", ...]) comparés par SOUS-CHAÎNE.
// Elle produisait exactement l'inverse de ce qu'on attend d'un filet de
// sécurité :
//   • Des FAUX POSITIFS sur des clients innocents — un "Vladimir Ben Salah"
//     tunisien était signalé à la fois comme correspondance sanctions ET comme
//     personne politiquement exposée, à cause de son prénom.
//   • AUCUN vrai positif — aucun nom réellement sanctionné ne figure dans ces
//     neuf mots.
//
// ❌ PIRE ENCORE — LE "FAIL-OPEN" : quand l'API ne répondait pas (panne,
// timeout de 8s, clé absente) et que la liste locale ne trouvait rien, la
// fonction renvoyait `sanctioned: false`. Le moteur de règles ne voyait donc
// AUCUNE différence entre "vérifié, rien trouvé" et "pas vérifié du tout".
// Concrètement : OpenSanctions tombe deux heures, vingt dossiers passent en
// Low Risk sans qu'un seul nom n'ait été comparé à la moindre liste — et
// l'audit trail affirme que le screening a eu lieu.
//
// ✅ CE QUI LE REMPLACE : un drapeau `screeningFailed` explicite. Quand le
// contrôle n'a pas pu s'exécuter, on le DIT, et le moteur de règles impose une
// revue manuelle (+45 points). C'est le principe du FAIL-CLOSED : en cas de
// doute, on ne laisse pas passer silencieusement.
// Vérifie si un nom apparaît sur des listes de sanctions financières (AML) ou
// est une "Personne Politiquement Exposée" (PEP) — obligation légale en KYC.
//
// 🆕 [AUDIT MOTEUR] LA LISTE DE REPLI LOCALE A ÉTÉ SUPPRIMÉE, et le
// comportement en cas de panne est inversé. Voici pourquoi.
//
// ❌ CE QUI EXISTAIT : une liste de neuf mots codés en dur
// (["malicious", "fraud", "vladimir", "putin", ...]) comparés par SOUS-CHAÎNE.
// Elle produisait exactement l'inverse de ce qu'on attend d'un filet de
// sécurité : des FAUX POSITIFS sur des clients innocents (un "Vladimir Ben
// Salah" tunisien était signalé comme correspondance sanctions ET comme PEP,
// à cause de son prénom) et AUCUN vrai positif.
//
// ❌ PIRE ENCORE — LE "FAIL-OPEN" : quand l'API ne répondait pas et que la
// liste locale ne trouvait rien, la fonction renvoyait `sanctioned: false`. Le
// moteur de règles ne voyait donc AUCUNE différence entre "vérifié, rien
// trouvé" et "pas vérifié du tout".
//
// ✅ CE QUI LE REMPLACE : un drapeau `screeningFailed` explicite. Quand le
// contrôle n'a pas pu s'exécuter, on le DIT, et le moteur de règles impose une
// revue manuelle (+45 points).
//
// 🆕 [FIX API] DEUX BUGS CORRIGÉS QUI EMPÊCHAIENT TOUT APPEL D'ABOUTIR DEPUIS
// LE PREMIER JOUR — détails à leur emplacement plus bas. Conséquence : aucun
// nom n'avait jamais été comparé à une liste de sanctions. L'ancien code
// retombait silencieusement sur la liste de neuf mots, ce qui masquait
// complètement le problème.
async function performGlobalSanctionsLookup(name: string, country: string) {
    let apiSanctioned = false;
    let apiPep = false;
    let topScore = 0.0;

    // 🆕 Part du principe que le screening a ÉCHOUÉ, et ne repasse à `false`
    // qu'après une réponse valide de l'API. C'est l'inverse de l'ancienne
    // logique optimiste — et c'est délibéré : un oubli dans le code produira
    // désormais une alerte, pas un silence.
    let screeningFailed = true;
    let lookupSource = "Screening unavailable";

    const apiKey = process.env.OPENSANCTIONS_API_KEY;

    // 🆕 [FIX API] COURT-CIRCUIT SI LA CLÉ EST ABSENTE.
    //
    // Sans ce garde-fou, on partait quand même en appel réseau — avec un
    // en-tête d'autorisation vide — pour récolter un 401 après plusieurs
    // secondes d'attente. C'est du temps perdu sur un budget d'exécution déjà
    // tendu (60s au total sur Vercel, dont 35 réservées à l'OCR).
    //
    // 💡 Le résultat métier est identique : screening non effectué, revue
    // manuelle imposée. On l'obtient simplement sans gaspiller de temps.
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
            // API OpenSanctions lente bloquait toute la création du dossier
            // jusqu'à la mort de la fonction serverless.
            signal: AbortSignal.timeout(8000),
            headers: {
                "Content-Type": "application/json",
                // 🆕 [FIX API — BUG 1/2] Le préfixe était `Bearer`, or
                // OpenSanctions attend `ApiKey`.
                //
                // ⚠️ C'ÉTAIT LA CAUSE DU 401. Le schéma "Bearer" est celui
                // d'OAuth 2.0, tellement répandu qu'on l'écrit par réflexe —
                // mais chaque API choisit son propre mot-clé, et celui-ci fait
                // partie de la valeur envoyée : le serveur compare la chaîne
                // entière. `Bearer abc123` et `ApiKey abc123` sont donc deux
                // valeurs différentes, même avec une clé parfaitement valide.
                //
                // Source : opensanctions.org/docs/api/authentication/
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

            // 🆕 [FIX API — BUG 2/2] La réponse se lit dans `responses`, pas
            // dans `queries`.
            //
            // ⚠️ L'API est ASYMÉTRIQUE, et c'est le piège : on ENVOIE un objet
            // `queries`, mais elle RÉPOND dans un objet `responses`. Les clés
            // internes (`q1` ici) sont conservées, ce qui permet d'envoyer
            // plusieurs recherches d'un coup et de retrouver chaque résultat.
            //
            // L'ancien code lisait `data.queries?.q1?.results` — une clé qui
            // n'existe tout simplement pas dans la réponse. Le `|| []` faisait
            // le reste : jamais d'erreur, jamais de résultat, aucun signe
            // extérieur de dysfonctionnement. Même avec une clé valide, le
            // screening n'aurait rien trouvé.
            const results = data.responses?.q1?.results || [];

            // 🆕 LE SEUL ENDROIT OÙ LE SCREENING EST DÉCLARÉ RÉUSSI.
            // Une réponse HTTP 200 signifie que l'API a bel et bien comparé le
            // nom à ses index — qu'elle ait trouvé quelque chose ou non. C'est
            // exactement l'information qui manquait : "zéro résultat" et
            // "aucune recherche effectuée" sont deux situations radicalement
            // différentes, indiscernables jusqu'ici.
            screeningFailed = false;
            lookupSource = "OpenSanctions API (Live Production Index)";

            // 🆕 [FIX API] Journal de diagnostic — développement uniquement.
            //
            // ⚠️ Ce texte contient le nom du client. L'écrire dans les journaux
            // de production reviendrait à déverser des données personnelles
            // dans les logs Vercel, consultables par quiconque a accès au
            // tableau de bord. Même précaution que pour le journal OCR.
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
            // 🆕 [FIX API] On lit le corps de la réponse d'erreur.
            //
            // 💡 Sans ce détail, un 401 pouvait signifier trois choses très
            // différentes — clé expirée, mauvais format d'en-tête, compte
            // suspendu — sans aucun moyen de trancher. C'est précisément ce qui
            // a rendu le diagnostic de ces deux bugs si long.
            //
            // 💡 Rappel des codes attendus : 401 = clé refusée,
            // 429 = quota mensuel épuisé (il se réinitialise au 1er du mois).
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
        // 🆕 Le drapeau qui alimente la règle `amlScreeningFailed`.
        screeningFailed,
        source: lookupSource,
        confidenceScore: topScore,
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

        const { customerName, customerNameAr, email, type, cin, documentType, nationality, dateOfBirth, phoneNumber, idCardPath, selfiePath, biometricScore } = validationResult.data;
        // ====================================================================
        // 🔒 VÉRIFICATION D'APPARTENANCE DES CHEMINS
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
        // Tesseract.js lit l'image de la pièce d'identité en 3 langues (EN/FR/AR)
        // et on vérifie que le nom et le CIN SAISIS AU FORMULAIRE apparaissent
        // bien DANS le texte extrait de l'image — ça détecte un formulaire rempli
        // avec un nom qui ne correspond pas au document uploadé.
        //
        // 🆕 Tesseract a besoin d'une URL téléchargeable — or on ne dispose plus
        // que d'un chemin vers un bucket PRIVÉ. On fabrique donc ici, côté
        // serveur, une URL signée de courte durée juste pour cette lecture.
        let ocrText = "";
        let ocrFailed = false;
        let isNameOnDoc = false;
        let isCinOnDoc = false;
        let nameMatchDetails: ReturnType<typeof matchNameAgainstOcr> | null = null;

        // 🆕 [OCR] Résultat de l'extraction, conservé pour le rationale.
        let extraction: Awaited<ReturnType<typeof extractDocumentData>> | null = null;
        let documentExpired: boolean | null = null;

        // 🆕 [ARABE] QUEL NOM COMPARER AU DOCUMENT ?
        // On privilégie le nom arabe saisi par l'agent dès qu'il contient
        // réellement des caractères arabes — le second test compte, un agent
        // pressé pourrait y retaper le nom latin par réflexe.
        const useArabicName = Boolean(customerNameAr && containsArabic(customerNameAr));
        const nameForOcrComparison = useArabicName ? customerNameAr! : customerName;

        try {
            const signedIdCardUrl = await createSignedDocumentUrl(idCardPath, 60);

            // 🆕 [OCR] Gemini Vision d'abord, Tesseract en repli — voir
            // lib/document-ocr.ts pour le détail de la stratégie.
            extraction = await extractDocumentData(signedIdCardUrl);

            if (!extraction.success) {
                ocrFailed = true;
            } else {
                ocrText = extraction.rawText;

                // 🆕 [OCR] SI GEMINI A FOURNI LE NOM ARABE, ON L'UTILISE EN
                // PRIORITÉ — même quand l'agent n'a pas rempli le champ.
                //
                // 💡 C'est un gain inattendu : la vérification du nom devient
                // possible sur un document arabe SANS aucune saisie manuelle.
                // Le champ reste utile comme référence croisée, mais il n'est
                // plus indispensable au fonctionnement du contrôle.
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

                // 🆕 [OCR] Contrôle d'expiration, impossible jusqu'ici faute de
                // collecter cette date.
                documentExpired = isDocumentExpired(extraction.expiryDate);
            }

            // ================================================================
            // 🆕 JOURNAL DE DIAGNOSTIC — DÉVELOPPEMENT UNIQUEMENT
            // ================================================================
            // ⚠️ Ce contenu comprend le nom complet et le numéro de CIN du
            // client. L'écrire dans les journaux de production reviendrait à
            // déverser des données personnelles dans les logs Vercel.
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

        // --- MODULE 3 : AML/PEP (sanctions financières) ---
        const amlScreening = await performGlobalSanctionsLookup(customerName, nationality || "");
        const normalizedEmail = String(email).toLowerCase();

        // ====================================================================
        // 🆕 [AUDIT MOTEUR] BIOMÉTRIE GRADUÉE, ET ABSENCE PÉNALISÉE
        // ====================================================================
        // ❌ CE QUI EXISTAIT : un seul booléen, `biometricScore < 60`. Deux
        // défauts majeurs.
        //
        //   1. BINAIRE : un score de 59% et un score de 5% produisaient
        //      exactement la même pénalité. Or 59% est un doute qui mérite un
        //      œil humain ; 5% est une fraude évidente.
        //
        //   2. PIRE — L'ABSENCE NE COÛTAIT RIEN : quand aucun visage n'était
        //      détectable (`biometricScore === null`), la condition
        //      `score !== null && score < 60` valait `false`, donc AUCUNE
        //      pénalité. Un dossier SANS AUCUNE vérification biométrique
        //      obtenait donc un meilleur score qu'un dossier avec une
        //      correspondance faible. L'absence de preuve devenait plus
        //      avantageuse qu'une preuve douteuse — exactement l'inverse de ce
        //      qu'un moteur de risque doit produire.
        //
        // ✅ QUATRE ÉTATS DISTINCTS, dont un pour l'indisponibilité. Les seuils
        // (40/60/75) reflètent le comportement réel de face-api.js : au-delà de
        // 75% la correspondance est solide, en dessous de 40% il s'agit
        // quasi-certainement de deux personnes différentes.
        //
        // 💡 Ces quatre facts resteront valides quand la biométrie deviendra un
        // vrai liveness (Phase C) : seule la façon de CALCULER le score
        // changera, pas la façon de l'interpréter.
        const hasBiometricScore = biometricScore !== null && biometricScore !== undefined;

        const biometricUnavailable = !hasBiometricScore;
        const faceMatchFailed = hasBiometricScore && biometricScore < 40;
        const faceMatchWeak = hasBiometricScore && biometricScore >= 40 && biometricScore < 60;
        const faceMatchBorderline = hasBiometricScore && biometricScore >= 60 && biometricScore < 75;

        // Conservé pour les règles COMBINÉES du moteur (nom + visage), qui
        // raisonnent sur "le visage ne correspond pas" sans distinguer le degré.
        const faceMismatch = faceMatchFailed || faceMatchWeak;

        // ====================================================================
        // 🆕 [AUDIT MOTEUR] VALIDATION DU FORMAT D'IDENTIFIANT — MULTI-PAYS
        // ====================================================================
        // ❌ AVANT : `(nationality === "Tunisia" || nationality === "TN") && !/^[0-9]{8}$/`
        // Un seul pays vérifié. Pour tous les autres, un numéro totalement
        // inventé passait sans le moindre signal.
        //
        // 💡 On ne pénalise QUE si un format est connu pour le pays déclaré.
        // Signaler un pays absent de la table reviendrait à sanctionner un
        // client parce que NOUS n'avons pas encodé sa règle — un faux positif
        // dont il n'est en rien responsable.
        const idFormat = ID_FORMATS[nationality];
        const invalidIdFormat = idFormat ? !idFormat.test(cin) : false;

        // 🆕 [AUDIT MOTEUR] Juridictions à risque (voir les listes en haut).
        const isBlacklistedJurisdiction = FATF_BLACKLIST.includes(nationality);
        const isGreylistedJurisdiction = FATF_GREYLIST.includes(nationality);

        // --- MODULE 4 : MOTEUR DE RÈGLES ---
        // Tous les signaux calculés ci-dessus sont regroupés en un seul objet
        // "facts", passé au moteur déclaratif (json-rules-engine + kyc-rules.json)
        // qui décide des pénalités à appliquer. Ce découplage permet de modifier
        // les règles métier (points, seuils, messages) sans toucher au code.
        //
        // 🆕 [AUDIT MOTEUR] `isStolenDocument` A ÉTÉ SUPPRIMÉ.
        // Son calcul était : `cin.endsWith("999") || cin.endsWith("000")`.
        // Aucune base de documents volés n'était consultée — mais le message
        // associé affirmait "matched stolen/lost databases". C'était une
        // DÉCLARATION FAUSSE inscrite dans la piste d'audit, ce qui est bien
        // plus grave qu'une règle manquante : un auditeur vérifiant cette
        // allégation n'aurait trouvé aucune source derrière. Et le déclenchement
        // touchait ~1% des CIN choisies au hasard.
        // 📋 Une vraie détection exigerait un accès à la base Interpol SLTD,
        // réservée aux forces de l'ordre.
        const facts = {
            isSanctionedName: amlScreening.sanctioned,
            // 🆕 Le PEP entre dans le moteur (il était codé en dur à +15 points).
            isPep: amlScreening.isPep,
            // 🆕 Le fail-closed du screening AML.
            amlScreeningFailed: amlScreening.screeningFailed,

            isDisposableEmail: ["yopmail.com", "mailinator.com", "trashmail.com"].some(d => normalizedEmail.endsWith(d)),
            invalidIdFormat,
            missingPhone: !phoneNumber || phoneNumber === "Not specified" || phoneNumber.trim() === "",
            isPassport: documentType === "Passport",
            isUnderage,
            isYoungAdult,

            // 🆕 Juridictions GAFI.
            isBlacklistedJurisdiction,
            isGreylistedJurisdiction,

            ocrNameMismatch: !ocrFailed && !isNameOnDoc,
            ocrCinMismatch: !ocrFailed && !isCinOnDoc,
            // 🆕 Même principe que pour l'AML : une lecture impossible n'est pas
            // une lecture réussie. L'ancien code se contentait d'un message dans
            // le rationale, sans aucun impact sur le score.
            ocrUnavailable: ocrFailed,
            // 🆕 [OCR] Document expiré. `documentExpired === true` uniquement :
            // `null` signifie "date illisible", pas "document valide". Traiter
            // une information manquante comme rassurante serait exactement le
            // travers qu'on a corrigé sur le screening AML.
            documentExpired: documentExpired === true,

            // 🆕 Biométrie graduée.
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

        // 🆕 [AUDIT MOTEUR] LE BLOC PEP CODÉ EN DUR A ÉTÉ RETIRÉ D'ICI.
        // Il faisait `riskScore += 15` directement dans le code, contournant
        // entièrement le moteur de règles. Deux problèmes : c'était une entorse
        // au principe même de l'architecture (les règles métier doivent être
        // modifiables sans développeur), et 15 points était très en dessous de
        // la pratique du secteur — un PEP impose une vigilance renforcée
        // systématique. La règle vaut désormais 60 points dans kyc-rules.json,
        // ce qui bascule seule le dossier en High Risk.

        // 🆕 [AUDIT MOTEUR] Rationale biométrique aligné sur les quatre états.
        // `unshift` place ce message en TÊTE du rationale : c'est le premier
        // élément que l'agent lit dans le panneau d'analyse.
        if (!hasBiometricScore) {
            rationale.unshift(`⚠️ BIOMETRIC UNAVAILABLE: No face could be extracted from the document or the selfie. Identity was NOT biometrically verified.`);
        } else if (faceMatchFailed) {
            rationale.unshift(`⛔ BIOMETRIC FAILURE: Face match score is ${biometricScore.toFixed(1)}%. The person in the selfie is almost certainly not the document holder.`);
        } else if (faceMatchWeak) {
            rationale.unshift(`⚠️ BIOMETRIC INCONCLUSIVE: Face match score is ${biometricScore.toFixed(1)}%. Manual visual comparison required.`);
        } else if (faceMatchBorderline) {
            rationale.unshift(`🟡 BIOMETRIC BORDERLINE: Face match score is ${biometricScore.toFixed(1)}%. Accepted, but below the high-confidence threshold.`);
        } else {
            rationale.unshift(`✅ BIOMETRIC SUCCESS: Face match verified with ${biometricScore.toFixed(1)}% similarity.`);
        }

        // 🆕 [AUDIT MOTEUR] Traçabilité de la SOURCE du screening AML.
        // L'agent doit pouvoir distinguer "vérifié contre l'index OpenSanctions"
        // de "non vérifié" — c'est précisément l'information qui manquait, et
        // qui rendait les deux situations indiscernables dans l'audit trail.
        if (amlScreening.screeningFailed) {
            rationale.push(`⚠️ AML SCREENING SOURCE: ${amlScreening.source}. No watchlist comparison was performed for this applicant.`);
        } else {
            rationale.push(`✅ AML SCREENING SOURCE: ${amlScreening.source}. Applicant name was compared against global sanctions and PEP indexes.`);
        }

        // 🆕 [ARABE] Rationale enrichi : l'agent doit savoir QUELLE écriture a
        // servi à la comparaison et QUELS mots ont manqué. Sans ces deux
        // informations, un échec reste impossible à diagnostiquer — il ne peut
        // pas distinguer une photo floue d'une faute de frappe dans le champ.
        if (ocrFailed) {
            rationale.push("NOTICE: Image parsing skipped or image unreadable. Manual document verification required.");
        } else if (nameMatchDetails) {
            const scriptLabel = nameMatchDetails.script === "arabic" ? "Arabic" : "Latin";
            const percent = Math.round(nameMatchDetails.ratio * 100);

            if (!isNameOnDoc) {
                // 💡 Les mots manquants sont listés tels quels : c'est
                // l'information la plus utile pour l'agent, qui peut alors
                // comparer visuellement avec le document.
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

            // 🆕 Avertissement quand la comparaison s'est faite en latin alors
            // que la nationalité laisse attendre un document arabe. Sans lui,
            // l'agent verrait un échec sans en comprendre la cause.
            if (!useArabicName && nationality === "Tunisia") {
                rationale.push(
                    "NOTICE: The Arabic name field was left empty. The name was compared in Latin script against a document that is likely written in Arabic — this check is unreliable for this file."
                );
            }
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
                // 🆕 [ARABE] Conservé pour l'affichage sur la fiche client et
                // pour toute re-vérification ultérieure du dossier.
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
                        details: `KYC Pipeline initialized. Modules processed: Biometrics, Age Check (${clientAge}yo), AML Screening, OCR Document Analysis. Calculated Risk Score: ${riskScore}/100.`,
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