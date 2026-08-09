// ============================================================================
// 🆕 [OCR] EXTRACTION DES DONNÉES D'UN DOCUMENT D'IDENTITÉ
// ============================================================================
// Pourquoi ce fichier existe : Tesseract s'est révélé inexploitable sur les CIN
// tunisiennes. Le journal de diagnostic montrait du bruit pur —
// "adi 2g ل a A 1: Va لمحب 3 a vo se SHOT" — parce qu'il tentait de lire les
// motifs de sécurité du fond (guillochage, hologrammes) comme des caractères.
// Sur 5 mots du nom, 1 seul était retrouvé, et probablement par hasard.
//
// La cause est structurelle, pas un réglage à trouver : Tesseract est conçu
// pour du texte imprimé propre — pages de livre, documents scannés. Une carte
// d'identité cumule tout ce qu'il gère mal : fond anti-copie, police arabe
// stylisée, hologrammes, photo prise au téléphone avec reflets et angle.
//
// 💡 STRATÉGIE À DEUX NIVEAUX :
//   1. GEMINI VISION — comprend qu'il regarde une carte d'identité et sait où
//      trouver quoi. Renvoie des CHAMPS STRUCTURÉS plutôt qu'un bloc de texte.
//   2. TESSERACT en repli — si Gemini est indisponible ou le quota épuisé.
//      Il donne du texte brut, exploitable par lib/arabic.ts.
//   3. Si les deux échouent, le fait `ocrUnavailable` force la revue manuelle.
//
// ⚠️ CONFIDENTIALITÉ — À CONNAÎTRE AVANT TOUTE MISE EN SERVICE RÉELLE :
// sur le palier gratuit, Google se réserve le droit d'utiliser les requêtes
// pour entraîner ses modèles. Envoyer de VRAIES pièces d'identité revient donc
// à transmettre des données personnelles à un tiers qui peut les exploiter.
// Acceptable pour une démo avec des documents fictifs ; incompatible avec de
// vrais clients. Le palier payant exclut cet usage — c'est le même schéma que
// pour OpenSanctions : gratuit tant que l'usage reste non commercial.
import { GoogleGenerativeAI } from "@google/generative-ai";
import Tesseract from "tesseract.js";

// Ce que l'extraction renvoie, quelle que soit la source utilisée.
export type DocumentExtraction = {
    // A-t-on obtenu quoi que ce soit d'exploitable ?
    success: boolean;
    // Quelle méthode a produit ce résultat. Indispensable dans le rationale :
    // un agent doit pouvoir distinguer une lecture fiable d'un repli dégradé.
    source: "gemini" | "tesseract" | "none";

    // Champs structurés — renseignés uniquement par Gemini.
    nameArabic?: string;
    nameLatin?: string;
    idNumber?: string;
    dateOfBirth?: string;   // format ISO AAAA-MM-JJ
    expiryDate?: string;    // format ISO AAAA-MM-JJ

    // Texte brut — renseigné par Tesseract, et par Gemini pour le diagnostic.
    rawText: string;
};

// Délais volontairement différents selon la méthode.
// 💡 Gemini répond en 2 à 5 secondes : 15 s couvre largement une lenteur
// réseau. Tesseract, lui, doit télécharger ses modèles de langue à froid —
// d'où un budget bien plus large, mais qui reste sous le plafond Vercel.
const GEMINI_TIMEOUT_MS = 15000;
const TESSERACT_TIMEOUT_MS = 30000;

// ----------------------------------------------------------------------------
// PROMPT D'EXTRACTION
// ----------------------------------------------------------------------------
// ⚠️ TROIS EXIGENCES CRITIQUES, chacune corrigeant un comportement par défaut
// des modèles de langage qui rendrait le résultat inexploitable :
//
//   1. "JSON uniquement" — sans cette consigne, le modèle encadre sa réponse
//      de ```json et ajoute une phrase d'introduction. Le parsing échouerait.
//   2. "null si absent" — un modèle a une forte tendance à COMBLER les vides
//      par une valeur plausible. Sur un document d'identité, une date inventée
//      est bien pire qu'une absence : elle serait traitée comme une donnée
//      vérifiée.
//   3. "transcris, ne traduis pas" — sans cette précision, le modèle rendrait
//      spontanément le nom arabe en caractères latins, ce qui ruinerait
//      justement la comparaison qu'on cherche à faire.
const EXTRACTION_PROMPT = `You are an OCR system for identity documents. Analyse this image and extract the visible fields.

Return ONLY a raw JSON object, with no markdown fences, no explanation, no preamble.

Required shape:
{
  "nameArabic": "the full name exactly as printed in Arabic script, or null",
  "nameLatin": "the full name in Latin script if present, or null",
  "idNumber": "the identification number, digits only, or null",
  "dateOfBirth": "YYYY-MM-DD or null",
  "expiryDate": "YYYY-MM-DD or null",
  "documentType": "CIN, Passport, DrivingLicense or null",
  "readable": true or false
}

Strict rules:
- Use null for any field you cannot read with confidence. NEVER guess or invent a value.
- Transcribe the Arabic name in Arabic characters. Do NOT transliterate or translate it.
- Convert Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) to Latin digits.
- Set "readable" to false if the image is too blurry, cropped or dark to extract anything reliably.`;

// ----------------------------------------------------------------------------
// NIVEAU 1 — GEMINI VISION
// ----------------------------------------------------------------------------
async function extractWithGemini(imageUrl: string): Promise<DocumentExtraction | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn("[OCR] GEMINI_API_KEY missing — skipping Gemini extraction.");
        return null;
    }

    try {
        // Gemini attend l'image encodée en base64, pas une URL : on la
        // télécharge donc depuis le lien signé Supabase, côté serveur.
        // 💡 L'image ne transite jamais par le navigateur du client à cette
        // étape — elle va du bucket privé vers notre serveur, puis vers Google.
        const imageResponse = await fetch(imageUrl, {
            signal: AbortSignal.timeout(10000),
        });
        if (!imageResponse.ok) {
            console.error("[OCR] Could not download document image:", imageResponse.status);
            return null;
        }

        const arrayBuffer = await imageResponse.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const mimeType = imageResponse.headers.get("content-type") || "image/jpeg";

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

        // 💡 Promise.race : le SDK Gemini n'expose pas de timeout natif. Sans
        // ce garde-fou, une réponse lente consommerait tout le budget
        // d'exécution de la fonction serverless (60 s au total).
        const result = await Promise.race([
            model.generateContent([
                EXTRACTION_PROMPT,
                { inlineData: { data: base64, mimeType } },
            ]),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Gemini timeout")), GEMINI_TIMEOUT_MS)
            ),
        ]);

        const rawResponse = result.response.text();

        // ⚠️ Malgré la consigne, le modèle encadre parfois sa réponse de
        // ```json. On nettoie systématiquement plutôt que d'espérer qu'il
        // obéisse — un parsing qui échoue ferait perdre une extraction
        // pourtant réussie.
        const cleaned = rawResponse
            .replace(/```json\s*/gi, "")
            .replace(/```/g, "")
            .trim();

        const parsed = JSON.parse(cleaned);

        // Le modèle lui-même signale une image inexploitable : on le croit
        // plutôt que d'exploiter des champs qu'il aurait remplis au jugé.
        if (parsed.readable === false) {
            console.warn("[OCR] Gemini reports the document as unreadable.");
            return null;
        }

        return {
            success: true,
            source: "gemini",
            nameArabic: parsed.nameArabic ?? undefined,
            nameLatin: parsed.nameLatin ?? undefined,
            idNumber: parsed.idNumber ?? undefined,
            dateOfBirth: parsed.dateOfBirth ?? undefined,
            expiryDate: parsed.expiryDate ?? undefined,
            // 💡 On concatène les champs extraits en un texte unique : ça permet
            // aux fonctions de lib/arabic.ts de travailler exactement comme avec
            // du texte brut Tesseract, sans code de comparaison en double.
            rawText: [parsed.nameArabic, parsed.nameLatin, parsed.idNumber]
                .filter(Boolean)
                .join(" "),
        };
    } catch (error) {
        console.error("[OCR] Gemini extraction failed:", error);
        return null;
    }
}

// ----------------------------------------------------------------------------
// NIVEAU 2 — TESSERACT (REPLI)
// ----------------------------------------------------------------------------
// ⚠️ Conservé malgré ses limites parce qu'il ne dépend d'aucun service externe :
// il reste disponible quand le quota Gemini est épuisé ou l'API en panne.
// Sa lecture de l'arabe est mauvaise, mais il lit correctement les CHIFFRES —
// le numéro de document était d'ailleurs bien retrouvé dans nos tests. Une
// vérification partielle vaut mieux qu'aucune.
async function extractWithTesseract(imageUrl: string): Promise<DocumentExtraction | null> {
    try {
        const { data } = await Promise.race([
            Tesseract.recognize(imageUrl, "ara+fra"),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Tesseract timeout")), TESSERACT_TIMEOUT_MS)
            ),
        ]);

        return {
            success: true,
            source: "tesseract",
            rawText: data.text,
        };
    } catch (error) {
        console.error("[OCR] Tesseract extraction failed:", error);
        return null;
    }
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================
// Tente Gemini, puis Tesseract, puis abandonne proprement.
//
// 💡 L'échec n'est jamais silencieux : `source: "none"` alimente le fait
// `ocrUnavailable` du moteur de règles, qui impose une revue manuelle. C'est le
// même principe de fail-closed que pour le screening AML — un contrôle qui n'a
// pas pu s'exécuter ne doit jamais passer pour un contrôle réussi.
export async function extractDocumentData(imageUrl: string): Promise<DocumentExtraction> {
    const geminiResult = await extractWithGemini(imageUrl);
    if (geminiResult) return geminiResult;

    console.warn("[OCR] Falling back to Tesseract.");
    const tesseractResult = await extractWithTesseract(imageUrl);
    if (tesseractResult) return tesseractResult;

    return { success: false, source: "none", rawText: "" };
}

// ----------------------------------------------------------------------------
// VÉRIFICATION D'EXPIRATION
// ----------------------------------------------------------------------------
// 💡 Ce contrôle n'existait tout simplement pas : la date d'expiration n'était
// jamais collectée, alors que "document expiré" figure parmi les motifs de
// rejet. Un agent devait donc la vérifier à l'œil sur chaque photo.
//
// Renvoie `null` quand la date est absente ou illisible — à distinguer de
// `false` (document valide). Confondre les deux reviendrait à traiter une
// information manquante comme une information rassurante.
export function isDocumentExpired(expiryDate?: string): boolean | null {
    if (!expiryDate) return null;

    const expiry = new Date(expiryDate);
    if (isNaN(expiry.getTime())) return null;

    return expiry < new Date();
}