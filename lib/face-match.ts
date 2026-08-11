// ============================================================================
// 🆕 [PHASE C] 🧬 COMPARAISON FACIALE — CÔTÉ SERVEUR
// ============================================================================
// Pourquoi ce fichier existe : jusqu'ici, le score biométrique était calculé
// DANS LE NAVIGATEUR par face-api.js, puis envoyé au serveur dans le corps de
// la requête. Le serveur le recopiait tel quel dans le moteur de règles.
//
// ⚠️ CE QUE ÇA SIGNIFIAIT CONCRÈTEMENT : n'importe qui pouvait ouvrir les
// outils de développement, intercepter l'appel à /api/customers et remplacer
// `biometricScore: 12.4` par `biometricScore: 99.9`. Deux photos de personnes
// totalement différentes passaient alors sans la moindre pénalité. Tout le
// travail de gradation (quatre états, seuils calibrés, pénalité en cas
// d'absence) était contourné par une seule valeur falsifiée.
//
// 💡 LA RÈGLE GÉNÉRALE, VALABLE BIEN AU-DELÀ DE CE FICHIER : un contrôle de
// sécurité exécuté sur une machine que l'utilisateur contrôle n'est pas un
// contrôle, c'est un affichage. Le navigateur peut afficher un résultat pour le
// confort ; seule une décision prise sur le serveur engage quoi que ce soit.
//
// ============================================================================
// POURQUOI GEMINI ET PAS face-api.js CÔTÉ SERVEUR
// ============================================================================
// C'était le plan évident, et il ne tient pas sur cette infrastructure :
//   • face-api.js@0.22.2 est la dernière version publiée (2020), le projet est
//     abandonné et repose sur une version de TensorFlow.js qui n'est plus
//     maintenue.
//   • Le faire tourner sur Node exige @tensorflow/tfjs-node (binaire natif
//     compilé) et `canvas` (qui dépend de Cairo, une bibliothèque système),
//     puis de remplacer à la main les objets Image/Canvas/ImageData du
//     navigateur, absents côté serveur.
//   • Sur Vercel en plan gratuit, ces binaires font dépasser la taille maximale
//     de la fonction et alourdissent chaque démarrage à froid de plusieurs
//     secondes.
//
// Gemini Vision est déjà installé, déjà configuré, déjà éprouvé sur tes
// documents (voir lib/document-ocr.ts) et reste dans le palier gratuit.
//
// ============================================================================
// ⚠️ CE QUE CE MODULE NE FAIT PAS — À LIRE AVANT DE LUI FAIRE CONFIANCE
// ============================================================================
// Gemini N'EST PAS un modèle de reconnaissance faciale. face-api.js calculait
// une DISTANCE EUCLIDIENNE entre deux vecteurs de 128 nombres : une mesure
// mathématique, reproductible, comparable d'un dossier à l'autre. Gemini, lui,
// porte un JUGEMENT. Si on lui réclamait un pourcentage, il en produirait un —
// mais ce serait un avis déguisé en mesure, potentiellement différent d'un
// appel à l'autre sur les mêmes images.
//
// 💡 D'OÙ LE CHOIX DE RENVOYER UN VERDICT ET NON UN SCORE. Un verdict à quatre
// valeurs correspond à ce que le modèle sait réellement produire : une
// appréciation. Prétendre à une précision décimale qu'il n'a pas serait pire
// que le problème d'origine — on aurait remplacé une valeur falsifiable par une
// valeur inventée, en croyant avoir gagné en rigueur.
//
// ⚠️ IL N'Y A TOUJOURS AUCUN LIVENESS ICI. Ce module compare deux images
// fixes. Il ne sait pas si le "selfie" a été pris en direct ou téléchargé
// depuis les réseaux sociaux de la personne. C'est l'objet du point 4 de la
// Phase C, et le champ `spoofingSignals` ci-dessous prépare le terrain sans
// encore alimenter la moindre règle.
//
// ⚠️ CONFIDENTIALITÉ : même réserve que pour l'OCR. Sur le palier gratuit,
// Google se réserve le droit d'utiliser les requêtes pour entraîner ses
// modèles. On envoie ici DEUX images de la personne au lieu d'une seule.
// Acceptable pour une démo avec des documents fictifs, incompatible avec de
// vrais clients — le palier payant exclut cet usage.
import { GoogleGenerativeAI } from "@google/generative-ai";

// ----------------------------------------------------------------------------
// LE CONTRAT DE SORTIE
// ----------------------------------------------------------------------------
// Quatre verdicts, qui correspondent exactement aux quatre facts déjà présents
// dans lib/kyc-rules.json. Ce n'est pas un hasard : le fichier de règles n'est
// pas modifié par ce changement, seule la façon de DÉRIVER les facts change.
//
// 💡 Les seuils numériques (40/60/75) de l'ancienne version disparaissent. Ils
// n'avaient de sens que pour une distance euclidienne ; les appliquer à un
// jugement de modèle de langage aurait donné une fausse impression de rigueur.
export type FaceMatchVerdict =
    | "same_person"          // correspondance solide
    | "likely_same_person"   // correspondance probable, sous le seuil de confiance
    | "inconclusive"         // impossible de trancher — comparaison humaine requise
    | "different_person"     // ce ne sont manifestement pas les mêmes personnes
    | "unavailable";         // aucun visage exploitable, ou service indisponible

export type FaceMatchResult = {
    verdict: FaceMatchVerdict;
    // Estimation indicative du modèle (0-100), UNIQUEMENT pour l'affichage dans
    // le rationale. ⚠️ Ne JAMAIS l'utiliser pour prendre une décision : c'est le
    // verdict qui fait foi. Ce nombre est là pour donner un ordre de grandeur à
    // l'agent, pas pour être comparé entre deux dossiers.
    similarity: number | null;
    // Phrase courte expliquant le verdict, destinée à l'agent qui relira le
    // dossier. C'est ce qui rend la décision auditable.
    reason: string;
    // "gemini" ou "none" — l'agent doit pouvoir distinguer un vrai contrôle
    // d'un service indisponible. Même principe que `source` sur l'OCR et l'AML.
    source: "gemini" | "none";
    // 🔭 PRÉPARATION PHASE C — POINT 4 (LIVENESS). Indices d'usurpation repérés
    // par le modèle : photo d'écran, reflets, bords de cadre, image imprimée.
    // ⚠️ Ce champ n'alimente AUCUNE règle pour l'instant, et c'est délibéré :
    // un modèle de langage n'est pas un détecteur d'attaque par présentation, et
    // pénaliser sur cette base produirait des faux positifs sur des selfies
    // parfaitement légitimes pris devant une fenêtre. Il est journalisé pour
    // qu'on puisse observer sa fiabilité sur de vrais dossiers AVANT de décider
    // d'en faire un critère.
    spoofingSignals: string[];
};

// 20 secondes. Plus généreux que l'OCR (15 s) parce qu'on envoie DEUX images au
// lieu d'une : le téléchargement depuis Supabase et l'analyse prennent
// mécaniquement plus de temps.
const FACE_MATCH_TIMEOUT_MS = 20000;

// Délai de téléchargement d'UNE image depuis le lien signé Supabase.
const IMAGE_FETCH_TIMEOUT_MS = 10000;

// ----------------------------------------------------------------------------
// LE PROMPT
// ----------------------------------------------------------------------------
// ⚠️ QUATRE EXIGENCES, chacune corrigeant un travers connu des modèles de
// langage qui rendrait le résultat inutilisable :
//
//   1. "JSON brut uniquement" — sans ça, le modèle encadre sa réponse de
//      ```json et ajoute une phrase de politesse. Le parsing échouerait.
//   2. "signale l'absence de visage" — c'est l'information la PLUS importante
//      du lot. Sans elle, un modèle serviable comparerait vaguement deux images
//      floues et rendrait un verdict au lieu d'admettre qu'il n'a rien vu.
//   3. "inconclusive est une réponse valide" — les modèles ont une forte
//      tendance à trancher pour faire plaisir. Il faut lui dire explicitement
//      que ne pas savoir est acceptable, sinon il devine.
//   4. "juge le visage, pas le contexte" — une photo d'identité et un selfie
//      diffèrent toujours par l'éclairage, l'âge, la coiffure, la pilosité, la
//      qualité. Sans cette consigne, ces écarts sont interprétés comme des
//      différences de personne, et tous les dossiers légitimes sont pénalisés.
const FACE_MATCH_PROMPT = `You are a biometric verification system used for identity document checking.

You receive two images:
- IMAGE 1: a photo of an official identity document (ID card, passport or driving licence). The relevant face is the portrait printed on the document.
- IMAGE 2: a self-portrait photograph of the applicant.

Determine whether the portrait on the document and the person in the self-portrait are the same individual.

Return ONLY a raw JSON object, with no markdown fences, no explanation, no preamble.

Required shape:
{
  "documentFaceDetected": true or false,
  "selfieFaceDetected": true or false,
  "verdict": "same_person" | "likely_same_person" | "inconclusive" | "different_person",
  "similarity": a number between 0 and 100, or null,
  "confidence": "high" | "medium" | "low",
  "reason": "one short sentence, max 20 words, explaining the verdict",
  "spoofingSignals": ["short labels for anything suggesting the selfie is not a live capture: screen photo, printed photo, visible screen bezel, moire pattern, heavy retouching"]
}

Strict rules:
- If no usable face is visible in either image, set the matching *FaceDetected field to false. Do NOT guess a verdict in that case.
- "inconclusive" is a valid and expected answer. Use it whenever image quality, angle, lighting or occlusion prevent a reliable judgement. Do not force a decision.
- Judge facial structure only: eyes spacing, nose, jawline, ear shape. Ignore differences in lighting, image quality, age, hairstyle, facial hair, glasses and expression — a document portrait is often years older than the selfie.
- Use "different_person" only when facial structure clearly differs, not merely because the images look different.
- Set "spoofingSignals" to an empty array if you notice nothing unusual.
- Never refuse to answer. If you cannot analyse the images, set both *FaceDetected fields to false.`;

// ----------------------------------------------------------------------------
// TÉLÉCHARGEMENT D'UNE IMAGE DEPUIS LE BUCKET PRIVÉ
// ----------------------------------------------------------------------------
// Gemini attend l'image encodée en base64, pas une URL. On la récupère donc
// depuis le lien signé Supabase, côté serveur.
//
// 💡 L'image ne repasse jamais par le navigateur du client à cette étape : elle
// va du bucket privé vers notre serveur, puis vers Google. Le client n'a aucun
// moyen d'influencer ce qui est réellement analysé — c'est précisément ce qui
// rend le contrôle non falsifiable.
async function fetchImageAsBase64(
    url: string
): Promise<{ data: string; mimeType: string } | null> {
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
        });

        if (!response.ok) {
            console.error("[FACE] Téléchargement de l'image impossible :", response.status);
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        return {
            data: Buffer.from(arrayBuffer).toString("base64"),
            mimeType: response.headers.get("content-type") || "image/jpeg",
        };
    } catch (error) {
        console.error("[FACE] Erreur réseau lors du téléchargement de l'image :", error);
        return null;
    }
}

// Réponse standard quand le contrôle n'a PAS pu être effectué.
//
// 🔒 FAIL-CLOSED : ce verdict alimente le fact `biometricUnavailable`, qui coûte
// 40 points et impose une revue manuelle. C'est le même principe que pour l'AML
// et l'OCR — un contrôle qui n'a pas pu s'exécuter ne doit JAMAIS être
// indiscernable d'un contrôle réussi.
function unavailable(reason: string): FaceMatchResult {
    return {
        verdict: "unavailable",
        similarity: null,
        reason,
        source: "none",
        spoofingSignals: [],
    };
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================
// Accepte des URLs nullables : si la signature Supabase a échoué en amont, on
// renvoie proprement "unavailable" au lieu de faire remonter une exception qui
// ferait échouer toute la création du dossier. Un contrôle indisponible est une
// information, pas une panne.
export async function compareFacesServerSide(
    documentImageUrl: string | null,
    selfieImageUrl: string | null
): Promise<FaceMatchResult> {
    if (!documentImageUrl || !selfieImageUrl) {
        return unavailable("Document images could not be accessed for biometric comparison.");
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn("[FACE] GEMINI_API_KEY absente — comparaison faciale ignorée.");
        return unavailable("Biometric service is not configured.");
    }

    // Les deux téléchargements sont lancés EN PARALLÈLE : ils sont indépendants,
    // les enchaîner doublerait l'attente pour rien.
    const [documentImage, selfieImage] = await Promise.all([
        fetchImageAsBase64(documentImageUrl),
        fetchImageAsBase64(selfieImageUrl),
    ]);

    if (!documentImage || !selfieImage) {
        return unavailable("One or both document images could not be downloaded for comparison.");
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

        // ⚠️ L'ORDRE DES PARTIES COMPTE. Le prompt désigne explicitement
        // "IMAGE 1" comme le document et "IMAGE 2" comme le selfie. Les inverser
        // ne casserait rien visiblement, mais le modèle chercherait un portrait
        // imprimé dans le selfie et une photo de face dans le document —
        // dégradant la qualité du verdict sans aucun signe extérieur.
        const result = await Promise.race([
            model.generateContent([
                FACE_MATCH_PROMPT,
                { inlineData: { data: documentImage.data, mimeType: documentImage.mimeType } },
                { inlineData: { data: selfieImage.data, mimeType: selfieImage.mimeType } },
            ]),
            // 💡 Le SDK Gemini n'expose pas de timeout natif. Sans ce garde-fou,
            // une réponse lente consommerait tout le budget d'exécution de la
            // fonction serverless (60 s au total, partagés avec l'OCR et l'AML).
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Face match timeout")), FACE_MATCH_TIMEOUT_MS)
            ),
        ]);

        // Malgré la consigne, le modèle encadre parfois sa réponse de ```json.
        // On nettoie systématiquement plutôt que d'espérer qu'il obéisse — un
        // parsing raté ferait perdre une analyse pourtant réussie.
        const cleaned = result.response
            .text()
            .replace(/```json\s*/gi, "")
            .replace(/```/g, "")
            .trim();

        const parsed = JSON.parse(cleaned);

        // --------------------------------------------------------------------
        // CONTRÔLE 1 — Y AVAIT-IL SEULEMENT UN VISAGE À COMPARER ?
        // --------------------------------------------------------------------
        // C'est le contrôle le plus important, et il vient en premier. Un verdict
        // rendu sans visage détectable ne vaut rien, quel qu'il soit.
        if (parsed.documentFaceDetected === false || parsed.selfieFaceDetected === false) {
            const missing = parsed.documentFaceDetected === false ? "document" : "selfie";
            return unavailable(
                `No usable face could be extracted from the ${missing} image.`
            );
        }

        const spoofingSignals: string[] = Array.isArray(parsed.spoofingSignals)
            ? parsed.spoofingSignals.filter((s: unknown) => typeof s === "string").slice(0, 5)
            : [];

        const reason =
            typeof parsed.reason === "string" && parsed.reason.trim()
                ? parsed.reason.trim().slice(0, 200)
                : "No explanation provided by the biometric engine.";

        // `similarity` est purement indicatif : on la borne pour éviter qu'une
        // valeur aberrante ne se retrouve affichée telle quelle dans la piste
        // d'audit ("similarity: 4200%").
        const similarity =
            typeof parsed.similarity === "number" && Number.isFinite(parsed.similarity)
                ? Math.max(0, Math.min(100, parsed.similarity))
                : null;

        // --------------------------------------------------------------------
        // CONTRÔLE 2 — LE VERDICT EST-IL UNE VALEUR ATTENDUE ?
        // --------------------------------------------------------------------
        // ⚠️ Ne JAMAIS faire confiance à une chaîne renvoyée par un modèle sans
        // la valider. Une faute de frappe ("same person" au lieu de
        // "same_person") passerait toutes les comparaisons plus bas et le
        // dossier ne déclencherait AUCUN fact biométrique — donc zéro pénalité,
        // exactement le trou qu'on est en train de boucher.
        const allowed: FaceMatchVerdict[] = [
            "same_person",
            "likely_same_person",
            "inconclusive",
            "different_person",
        ];

        if (!allowed.includes(parsed.verdict)) {
            console.warn("[FACE] Verdict inattendu renvoyé par le modèle :", parsed.verdict);
            return unavailable("The biometric engine returned an unrecognised verdict.");
        }

        let verdict = parsed.verdict as FaceMatchVerdict;

        // --------------------------------------------------------------------
        // CONTRÔLE 3 — RÈGLE DE PRUDENCE SUR LA CONFIANCE FAIBLE
        // --------------------------------------------------------------------
        // Une réponse de confiance faible est ramenée à "inconclusive", QUELLE
        // QUE SOIT SA DIRECTION.
        //
        // 💡 Pourquoi dans les deux sens, et pas seulement pour les verdicts
        // favorables : un jugement peu sûr n'est par définition pas concluant.
        // Le garder tel quel produirait deux erreurs symétriques — innocenter à
        // tort un imposteur, ou accuser à tort un client légitime dont la photo
        // d'identité a dix ans. "Inconclusive" dit exactement ce qui s'est
        // passé : la machine n'a pas su, un humain doit regarder.
        if (parsed.confidence === "low" && verdict !== "inconclusive") {
            console.log(`[FACE] Verdict "${verdict}" ramené à "inconclusive" (confiance faible).`);
            verdict = "inconclusive";
        }

        // Journal de diagnostic — développement uniquement.
        // ⚠️ Aucune donnée personnelle ici (ni nom, ni image), mais on garde la
        // même règle que partout ailleurs par cohérence.
        if (process.env.NODE_ENV !== "production") {
            console.log("\n──────── FACE MATCH DIAGNOSTIC ────────");
            console.log("Verdict brut  :", parsed.verdict);
            console.log("Confiance     :", parsed.confidence);
            console.log("Verdict retenu:", verdict);
            console.log("Similarité    :", similarity);
            console.log("Motif         :", reason);
            console.log("Indices spoof :", spoofingSignals);
            console.log("───────────────────────────────────────\n");
        }

        return { verdict, similarity, reason, source: "gemini", spoofingSignals };
    } catch (error) {
        // Timeout, quota épuisé, JSON illisible, réseau coupé : dans tous les
        // cas le contrôle n'a pas eu lieu, et on le dit.
        console.error("[FACE] Échec de la comparaison faciale :", error);
        return unavailable("The biometric comparison service was unreachable or returned an unreadable response.");
    }
}