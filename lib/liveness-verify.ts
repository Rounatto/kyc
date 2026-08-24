// ============================================================================
// 🆕 [PHASE C — LIVENESS, ÉTAPE 4/5] VÉRIFICATION SERVEUR DE LA SÉQUENCE
// ============================================================================
// C'EST LE FICHIER QUI DONNE UN SENS À TOUT LE RESTE. Les étapes 1 à 3 ont
// construit une machine qui produit une preuve : trois images et un jeton signé.
// Personne ne les regardait. Quelqu'un pouvait rester parfaitement immobile
// pendant toute la séquence — trois images identiques — et le système validait
// sans broncher.
//
// ⚠️ UNE PREUVE QUE PERSONNE NE VÉRIFIE EST PIRE QUE PAS DE PREUVE DU TOUT :
// elle donne l'apparence d'un contrôle là où il n'y en a aucun. C'est exactement
// le travers qu'on a corrigé ailleurs dans ce projet (isStolenDocument affirmait
// consulter une base de documents volés en calculant `cin.endsWith("999")`).
//
// ============================================================================
// CE QUE CE MODULE VÉRIFIE, ET DANS QUEL ORDRE
// ============================================================================
//   1. LE JETON — la signature HMAC garantit quelles actions avaient été
//      demandées. Sans ça, le client pourrait prétendre après coup que l'action
//      attendue était "ne rien faire".
//   2. LA CONTINUITÉ — est-ce la même personne sur les trois images ? Un
//      complice pourrait prendre la place du fraudeur entre deux poses.
//   3. LA POSE 1 — l'image action1 montre-t-elle le changement demandé par
//      rapport à l'image neutre ?
//   4. LA POSE 2 — idem pour la seconde action.
//
// 🔒 UN SEUL ÉCHEC SUFFIT. Pas de demi-succès : soit la présence physique est
// prouvée, soit elle ne l'est pas. Accepter "une pose sur deux" reviendrait à
// diviser par deux l'effort d'un fraudeur.
//
// ============================================================================
// ⚠️ CE QUE CE MODULE NE PEUT PAS FAIRE — À LIRE AVANT DE LUI FAIRE CONFIANCE
// ============================================================================
// IL BLOQUE : une photo imprimée, une photo affichée sur un téléphone, une
// capture d'écran. Aucune ne peut ouvrir la bouche sur commande.
//
// IL NE BLOQUE PAS DE FAÇON FIABLE : une VIDÉO PRÉ-ENREGISTRÉE de la vraie
// personne, jouée en plein écran et filmée par la webcam.
//
// 💡 ET LA RAISON N'EST PAS QUE LE MODÈLE SERAIT TROP FAIBLE — c'est qu'IL N'Y A
// RIEN À VOIR. Une vidéo authentique de la vraie personne montre authentiquement
// un humain qui bouge : aucun indice visuel ne la distingue d'une capture en
// direct. Ce qui manque, c'est l'information de PROFONDEUR — la géométrie 3D du
// visage — et une image 2D ne la contient tout simplement pas. Les acteurs du
// secteur utilisent des caméras infrarouges, de la lumière structurée ou de
// l'analyse de texture de peau sous éclairage contrôlé. Ce n'est pas un problème
// de prompt, c'est un problème d'information disponible.
//
// ✅ MAIS LE CHALLENGE ALÉATOIRE REND CETTE ATTAQUE BIEN PLUS COÛTEUSE QU'IL N'Y
// PARAÎT : il faudrait une vidéo montrant exactement les DEUX actions tirées, DANS
// L'ORDRE, découvertes à l'écran deux secondes avant, sur 12 combinaisons
// possibles. Une vidéo pré-enregistrée ne suffit plus — il faudrait un deepfake
// piloté en temps réel par les instructions affichées. C'est un tout autre niveau
// d'effort, hors de portée de la fraude ordinaire.
//
// 📋 Cette limite est documentée ici plutôt que masquée, pour la même raison que
// partout ailleurs dans ce projet : un contrôle dont on ignore les limites est un
// contrôle en qui on a une confiance mal placée.
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createSignedDocumentUrls } from "@/lib/storage";
import { verifyLivenessToken } from "@/lib/liveness-challenge";

// ----------------------------------------------------------------------------
// LE CONTRAT DE SORTIE
// ----------------------------------------------------------------------------
// Trois verdicts seulement, exactement comme lib/face-match.ts.
//
// 💡 PAS DE SCORE, ET C'EST DÉLIBÉRÉ. Gemini JUGE, il ne mesure pas. Lui réclamer
// un pourcentage de "vivacité" produirait un nombre habillé en mesure, différent
// d'un appel à l'autre sur les mêmes images. Un verdict correspond à ce que le
// modèle sait réellement rendre : une appréciation.
export type LivenessVerdict =
    | "passed"        // les deux poses correspondent, même personne partout
    | "failed"        // au moins une pose ne correspond pas, ou personne différente
    | "unavailable";  // le contrôle n'a pas pu être effectué

export type LivenessVerificationResult = {
    verdict: LivenessVerdict;
    // Phrase courte destinée à l'agent qui relira le dossier. C'est elle qui rend
    // la décision auditable.
    reason: string;
    // "gemini" ou "none" — l'agent doit pouvoir distinguer un vrai contrôle d'un
    // service indisponible. Même principe que `source` sur l'OCR et l'AML.
    source: "gemini" | "none";
    // Détail par pose, pour le rationale. Permet à l'agent de savoir LAQUELLE a
    // échoué plutôt que de recevoir un refus opaque.
    poseResults: { instruction: string; matched: boolean; note: string }[];
    // Indices d'usurpation repérés par le modèle.
    //
    // ⚠️ SIGNAL CONTRIBUTIF, JAMAIS UN VERDICT À LUI SEUL. Un reflet de lunettes,
    // une fenêtre derrière le client, la retouche automatique d'un téléphone
    // produisent régulièrement de faux positifs. Ils enrichissent le rationale et
    // pèsent uniquement s'ils s'ajoutent à un autre problème (voir `verdict`
    // ci-dessous) — ils ne peuvent pas faire échouer un client honnête à eux seuls.
    spoofingSignals: string[];
};

// 25 secondes. Plus généreux que la comparaison faciale (20 s) parce qu'on envoie
// TROIS images au lieu de deux, et que l'analyse demandée est plus complexe :
// comparer chaque pose à la référence, puis vérifier la continuité d'identité.
const LIVENESS_TIMEOUT_MS = 25000;

const IMAGE_FETCH_TIMEOUT_MS = 10000;

// ----------------------------------------------------------------------------
// LE PROMPT
// ----------------------------------------------------------------------------
// ⚠️ CINQ EXIGENCES, chacune corrigeant un travers connu des modèles de langage
// qui rendrait le résultat inutilisable :
//
//   1. "JSON brut uniquement" — sans ça, le modèle encadre sa réponse de ```json
//      et ajoute une phrase de politesse. Le parsing échouerait.
//   2. "compare à l'image 1" — le point le plus important. Sans référence
//      explicite, le modèle jugerait chaque pose dans l'absolu ("cette personne
//      a-t-elle la bouche ouverte ?") au lieu de juger le CHANGEMENT. Or c'est le
//      changement qui prouve la présence : une photo peut montrer une bouche
//      ouverte, elle ne peut pas l'ouvrir sur commande.
//   3. "ignore l'éclairage et la qualité" — trois images prises à quelques
//      secondes d'intervalle par une webcam varient toujours un peu. Sans cette
//      consigne, ces variations seraient interprétées comme des différences de
//      personne.
//   4. "false si tu n'es pas certain" — les modèles ont une forte tendance à
//      valider pour faire plaisir. Sur un contrôle de sécurité, le doute doit
//      pencher vers le refus.
//   5. "signale les indices d'usurpation" — écran, cadre, moiré, impression.
const VERIFICATION_PROMPT = `You are a liveness verification system for identity checks.

You receive three images captured a few seconds apart from the same webcam session:
- IMAGE 1: the REFERENCE frame. The person was asked to look straight at the camera in a neutral pose.
- IMAGE 2: the person was asked to perform ACTION 1.
- IMAGE 3: the person was asked to perform ACTION 2.

ACTION 1 expected change: {{ACTION_1}}

ACTION 2 expected change: {{ACTION_2}}

Your job is to determine whether a real, physically present person performed these actions on request.

Return ONLY a raw JSON object, with no markdown fences, no explanation, no preamble.

Required shape:
{
  "facesDetected": true or false,
  "sameIndividual": true or false,
  "action1Matched": true or false,
  "action1Note": "one short sentence describing what actually changed, or did not change, between image 1 and image 2",
  "action2Matched": true or false,
  "action2Note": "one short sentence describing what actually changed, or did not change, between image 1 and image 3",
  "framesAreIdentical": true or false,
  "spoofingSignals": ["short labels for anything suggesting these are not live captures: screen photo, printed photo, visible screen bezel, moire pattern, identical frames, heavy retouching"],
  "confidence": "high" | "medium" | "low"
}

Strict rules:
- Judge the CHANGE relative to IMAGE 1, not the pose in isolation. A person whose mouth is already open in image 1 and still open in image 2 has NOT performed the action.
- Set "framesAreIdentical" to true if the three images look like the same frozen photograph. This is the strongest possible indicator that a static photo was held in front of the camera.
- Ignore differences in lighting, exposure, image sharpness, background and minor head drift. A webcam produces slightly different frames every second; these are not evidence of anything.
- For "sameIndividual", judge facial structure only: eye spacing, nose, jawline, ear shape.
- Set a "*Matched" field to false whenever you are not confident the expected change occurred. On a security check, uncertainty must count against the applicant, never in their favour.
- Set "spoofingSignals" to an empty array if you notice nothing unusual.
- Never refuse to answer. If the images cannot be analysed, set "facesDetected" to false.`;

// ----------------------------------------------------------------------------
// TÉLÉCHARGEMENT D'UNE IMAGE DEPUIS LE BUCKET PRIVÉ
// ----------------------------------------------------------------------------
// Gemini attend l'image encodée en base64, pas une URL.
//
// 💡 Les images vont du bucket privé vers notre serveur, puis vers Google. Elles
// ne repassent JAMAIS par le navigateur du client à cette étape — c'est
// précisément ce qui rend le contrôle non falsifiable.
async function fetchImageAsBase64(
    url: string
): Promise<{ data: string; mimeType: string } | null> {
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
        });

        if (!response.ok) {
            console.error("[LIVENESS-VERIFY] Téléchargement impossible :", response.status);
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        return {
            data: Buffer.from(arrayBuffer).toString("base64"),
            mimeType: response.headers.get("content-type") || "image/jpeg",
        };
    } catch (error) {
        console.error("[LIVENESS-VERIFY] Erreur réseau :", error);
        return null;
    }
}

// Réponse standard quand le contrôle n'a PAS pu être effectué.
//
// 🔒 FAIL-CLOSED : ce verdict alimentera un fact du moteur de règles qui impose
// une revue manuelle. Même principe que pour l'AML et l'OCR — un contrôle qui n'a
// pas pu s'exécuter ne doit JAMAIS être indiscernable d'un contrôle réussi.
function unavailable(reason: string): LivenessVerificationResult {
    return {
        verdict: "unavailable",
        reason,
        source: "none",
        poseResults: [],
        spoofingSignals: [],
    };
}

function failed(reason: string, extra?: Partial<LivenessVerificationResult>): LivenessVerificationResult {
    return {
        verdict: "failed",
        reason,
        source: "gemini",
        poseResults: [],
        spoofingSignals: [],
        ...extra,
    };
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================
export async function verifyLivenessSequence(
    token: string,
    paths: { reference: string; action1: string; action2: string }
): Promise<LivenessVerificationResult> {
    // ------------------------------------------------------------------------
    // CONTRÔLE 1 — LE JETON, AVANT TOUT LE RESTE
    // ------------------------------------------------------------------------
    // ⚠️ ON NE TÉLÉCHARGE RIEN TANT QUE LE JETON N'EST PAS VALIDÉ. Sans ce jeton,
    // on ne SAIT PAS quelles actions avaient été demandées — et vérifier des
    // images sans savoir ce qu'on cherche n'a aucun sens. Le faire en premier
    // évite aussi de consommer du quota Gemini sur une requête forgée.
    //
    // `verifyLivenessToken` couvre la signature HMAC, l'expiration (3 min) et la
    // validité des deux actions. Il renvoie `null` au moindre problème.
    const challenge = verifyLivenessToken(token);

    if (!challenge) {
        // 🔒 "failed" et NON "unavailable". La nuance est importante : un jeton
        // invalide n'est pas une panne de service, c'est une séquence qu'on ne
        // peut pas rattacher à une demande légitime. Ça peut être une expiration
        // banale — l'agent a laissé le formulaire ouvert vingt minutes — mais ça
        // peut aussi être une requête forgée. Dans les deux cas, la présence
        // physique n'est pas prouvée.
        return failed(
            "The liveness challenge token was invalid or had expired. The sequence could not be matched to a server-issued request."
        );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn("[LIVENESS-VERIFY] GEMINI_API_KEY absente — vérification ignorée.");
        return unavailable("Liveness verification service is not configured.");
    }

    // ------------------------------------------------------------------------
    // CONTRÔLE 2 — RÉCUPÉRATION DES IMAGES
    // ------------------------------------------------------------------------
    // 💡 Une seule signature groupée pour les trois chemins, puis trois
    // téléchargements en parallèle : les images sont indépendantes, les enchaîner
    // triplerait l'attente pour rien.
    let signedUrls: Record<string, string>;
    try {
        signedUrls = await createSignedDocumentUrls(
            [paths.reference, paths.action1, paths.action2],
            120
        );
    } catch (error) {
        console.error("[LIVENESS-VERIFY] Signature des images impossible :", error);
        return unavailable("The captured frames could not be accessed for verification.");
    }

    const [reference, action1, action2] = await Promise.all([
        signedUrls[paths.reference] ? fetchImageAsBase64(signedUrls[paths.reference]) : null,
        signedUrls[paths.action1] ? fetchImageAsBase64(signedUrls[paths.action1]) : null,
        signedUrls[paths.action2] ? fetchImageAsBase64(signedUrls[paths.action2]) : null,
    ]);

    if (!reference || !action1 || !action2) {
        return unavailable("One or more captured frames could not be downloaded for verification.");
    }

    // ------------------------------------------------------------------------
    // CONTRÔLE 3 — L'ANALYSE
    // ------------------------------------------------------------------------
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

        // Les descriptions `expectedChange` viennent du jeton signé, donc du
        // serveur — jamais du client. C'est ce qui garantit qu'on cherche bien ce
        // qui avait été demandé.
        const prompt = VERIFICATION_PROMPT
            .replace("{{ACTION_1}}", challenge.steps[0].expectedChange)
            .replace("{{ACTION_2}}", challenge.steps[1].expectedChange);

        // ⚠️ L'ORDRE DES IMAGES EST CRITIQUE. Le prompt désigne explicitement
        // IMAGE 1 comme la référence neutre. Les inverser ne produirait aucune
        // erreur visible, mais le modèle chercherait le changement dans le mauvais
        // sens et rejetterait systématiquement des séquences honnêtes.
        const result = await Promise.race([
            model.generateContent([
                prompt,
                { inlineData: { data: reference.data, mimeType: reference.mimeType } },
                { inlineData: { data: action1.data, mimeType: action1.mimeType } },
                { inlineData: { data: action2.data, mimeType: action2.mimeType } },
            ]),
            // 💡 Le SDK Gemini n'expose pas de timeout natif. Sans ce garde-fou,
            // une réponse lente consommerait tout le budget d'exécution de la
            // fonction serverless.
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Liveness verification timeout")), LIVENESS_TIMEOUT_MS)
            ),
        ]);

        // Malgré la consigne, le modèle encadre parfois sa réponse de ```json.
        // On nettoie systématiquement plutôt que d'espérer qu'il obéisse.
        const cleaned = result.response
            .text()
            .replace(/```json\s*/gi, "")
            .replace(/```/g, "")
            .trim();

        const parsed = JSON.parse(cleaned);

        const spoofingSignals: string[] = Array.isArray(parsed.spoofingSignals)
            ? parsed.spoofingSignals.filter((s: unknown) => typeof s === "string").slice(0, 5)
            : [];

        const poseResults = [
            {
                instruction: challenge.steps[0].action,
                matched: parsed.action1Matched === true,
                note: typeof parsed.action1Note === "string" ? parsed.action1Note.slice(0, 200) : "",
            },
            {
                instruction: challenge.steps[1].action,
                matched: parsed.action2Matched === true,
                note: typeof parsed.action2Note === "string" ? parsed.action2Note.slice(0, 200) : "",
            },
        ];

        // Journal de diagnostic — développement uniquement.
        if (process.env.NODE_ENV !== "production") {
            console.log("\n──────── LIVENESS VERIFY DIAGNOSTIC ────────");
            console.log("Actions demandées :", challenge.steps.map((s) => s.action));
            console.log("Visages détectés  :", parsed.facesDetected);
            console.log("Même personne     :", parsed.sameIndividual);
            console.log("Images identiques :", parsed.framesAreIdentical);
            console.log("Pose 1 validée    :", parsed.action1Matched, "—", parsed.action1Note);
            console.log("Pose 2 validée    :", parsed.action2Matched, "—", parsed.action2Note);
            console.log("Confiance         :", parsed.confidence);
            console.log("Indices spoof     :", spoofingSignals);
            console.log("────────────────────────────────────────────\n");
        }

        // --------------------------------------------------------------------
        // LES QUATRE MOTIFS D'ÉCHEC, DU PLUS GRAVE AU PLUS ORDINAIRE
        // --------------------------------------------------------------------
        // 💡 L'ORDRE COMPTE POUR LE MESSAGE, pas pour le résultat : tous mènent à
        // "failed". Mais l'agent qui relit le dossier doit voir la cause la plus
        // significative en premier, pas la première rencontrée dans le code.

        // a) Aucun visage exploitable — on ne peut rien conclure.
        if (parsed.facesDetected === false) {
            return unavailable(
                "No usable face could be extracted from the captured frames. The liveness check could not be performed."
            );
        }

        // b) IMAGES IDENTIQUES — le signal le plus fort qui existe.
        // ⚠️ Trois images capturées à plusieurs secondes d'intervalle d'une VRAIE
        // personne ne sont JAMAIS rigoureusement identiques : respiration,
        // micro-mouvements, variations de lumière. Des images identiques signifient
        // qu'une photographie figée était tenue devant l'objectif.
        if (parsed.framesAreIdentical === true) {
            return failed(
                "The three frames are identical. A static photograph was almost certainly held in front of the camera instead of a live person.",
                { poseResults, spoofingSignals }
            );
        }

        // c) Personne différente entre les images — substitution en cours de
        // séquence, ou deux personnes se relayant devant la caméra.
        if (parsed.sameIndividual === false) {
            return failed(
                "The captured frames do not show the same individual. The person changed during the sequence.",
                { poseResults, spoofingSignals }
            );
        }

        // d) Une pose n'a pas été exécutée.
        const failedPoses = poseResults.filter((p) => !p.matched);

        if (failedPoses.length > 0) {
            const detail = failedPoses.map((p) => `${p.instruction} (${p.note})`).join("; ");
            return failed(
                `The requested action${failedPoses.length > 1 ? "s were" : " was"} not performed: ${detail}`,
                { poseResults, spoofingSignals }
            );
        }

        // --------------------------------------------------------------------
        // RÈGLE DE PRUDENCE — CONFIANCE FAIBLE
        // --------------------------------------------------------------------
        // 🔒 Une validation peu sûre n'est pas une validation. On la transforme en
        // "unavailable" plutôt qu'en "passed" : le dossier partira en revue
        // manuelle au lieu d'être accepté sur un jugement incertain.
        //
        // 💡 POURQUOI "unavailable" ET NON "failed" : le client n'a rien fait de
        // mal. C'est NOTRE outil qui n'a pas su trancher — probablement une image
        // sombre ou floue. Le marquer en échec l'accuserait à tort ; le marquer
        // indisponible dit exactement ce qui s'est passé.
        if (parsed.confidence === "low") {
            return {
                verdict: "unavailable",
                reason:
                    "The liveness analysis returned a low-confidence result. Image quality was likely insufficient. Manual review required.",
                source: "gemini",
                poseResults,
                spoofingSignals,
            };
        }

        // --------------------------------------------------------------------
        // SUCCÈS
        // --------------------------------------------------------------------
        return {
            verdict: "passed",
            reason: `Both requested actions were performed by the same individual: ${poseResults
                .map((p) => p.instruction)
                .join(", ")}.`,
            source: "gemini",
            poseResults,
            spoofingSignals,
        };
    } catch (error) {
        // Timeout, quota épuisé, JSON illisible, réseau coupé : dans tous les cas
        // le contrôle n'a pas eu lieu, et on le dit.
        console.error("[LIVENESS-VERIFY] Échec de la vérification :", error);
        return unavailable(
            "The liveness verification service was unreachable or returned an unreadable response."
        );
    }
}