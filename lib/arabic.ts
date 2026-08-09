// ============================================================================
// 🆕 [ARABE] COMPARAISON DE NOMS TOLÉRANTE AUX ERREURS D'OCR
// ============================================================================
// Pourquoi ce fichier existe : la vérification OCR comparait le nom saisi au
// texte extrait du document avec un simple `ocrText.includes(nom)`. Deux
// problèmes rendaient ce test presque toujours faux.
//
// 1️⃣ L'ALPHABET. Les CIN tunisiennes portent le nom en arabe, alors que le
//    formulaire le collecte en caractères latins. Chercher "rayen" dans
//    "ريان محلة" ne peut JAMAIS aboutir. Résultat : `ocrNameMismatch` se
//    déclenchait sur 100% des dossiers tunisiens, coûtant 40 points de
//    pénalité à des clients parfaitement légitimes.
//
// 2️⃣ L'EXIGENCE DE PERFECTION. Le code demandait que TOUS les mots du nom
//    soient retrouvés, au caractère près. Or un OCR n'est jamais parfait :
//    une photo légèrement floue, une carte usée, un reflet, et une lettre est
//    mal lue. Un seul caractère erroné faisait échouer tout le contrôle.
//
// Ce module apporte trois couches complémentaires :
//   • NORMALISATION — ramène les variantes d'écriture à une forme unique
//   • DISTANCE DE LEVENSHTEIN — tolère quelques caractères mal reconnus
//   • SEUIL — accepte qu'une partie des mots seulement soit retrouvée
//
// 💡 Aucune dépendance externe : tout est calculé localement, gratuitement,
// sans appel réseau. Rien à ajouter au budget de 60 secondes de la route.

// ----------------------------------------------------------------------------
// SEUIL DE CORRESPONDANCE
// ----------------------------------------------------------------------------
// Proportion des mots du nom qui doivent être retrouvés dans le texte OCR.
//
// 💡 POURQUOI 60% ET NON 70% : le seuil se comporte très différemment selon la
// longueur du nom, à cause de l'arrondi.
//
//   Nom long  — "ريان محلة شهرة عون الله" (5 mots)
//               60% → 3 mots requis   |   70% → 4 mots requis
//   Nom court — "أحمد بن علي" (3 mots)
//               60% → 2 mots requis   |   70% → 3 mots, soit LA TOTALITÉ
//
// À 70%, un nom court exige donc une correspondance parfaite — une seule
// erreur d'OCR déclenche une fausse alerte. Et les noms courts sont fréquents.
//
// ⚠️ Rappel de ce que ce contrôle mesure vraiment : il ne prouve PAS l'identité,
// il détecte un document qui n'a RIEN À VOIR avec la demande. Dans ce cas, ce
// n'est pas 40% des mots qui correspondront, c'est zéro. Le seuil peut donc
// être généreux sans perdre son utilité — et un faux positif, lui, coûte du
// temps d'agent sur chaque dossier valide.
const MATCH_THRESHOLD = 0.6;

// Les mots d'une seule lettre sont ignorés : ils correspondraient à presque
// n'importe quoi et fausseraient le ratio vers le haut.
// 💡 "بن" (ben), très courant dans les noms tunisiens, fait 2 caractères et
// reste donc pris en compte.
const MIN_WORD_LENGTH = 2;

// ============================================================================
// NORMALISATION ARABE — LA COUCHE LA PLUS IMPORTANTE
// ============================================================================
// L'arabe possède plusieurs façons d'écrire le même son. L'agent tape une
// variante, l'OCR en lit une autre, et une comparaison stricte échoue alors
// que les deux textes désignent le même nom.
//
// Les trois familles de variantes rencontrées sur les CIN :
//
//   ALEF     ا  أ  إ  آ  ٱ      → toutes prononcées "a"
//            L'agent tape أحمد, l'OCR lit احمد
//
//   YA FINAL ي  ى                → le "ya" final avec ou sans points
//            علي vs على
//
//   TA MARBUTA ة  ه              → LE CAS LE PLUS FRÉQUENT en Tunisie
//            محلة vs محله, شهرة vs شهره
//
// À quoi s'ajoutent les DIACRITIQUES (تشكيل) — les signes de voyelles courtes
// comme dans مُحَمَّد. Rares sur les cartes officielles, mais Tesseract en
// invente parfois à partir d'imperfections de l'image.
//
// Et le TATWEEL (ـ), un allongement purement décoratif utilisé pour justifier
// le texte : محـمـد et محمد sont le même mot.
export function normalizeArabic(text: string): string {
    return text
        // Diacritiques (U+064B à U+0652) et tatweel (U+0640).
        .replace(/[\u064B-\u0652\u0640]/g, "")
        // Toutes les variantes d'alef → alef simple (ا).
        // آ (U+0622), أ (U+0623), إ (U+0625), ٱ (U+0671)
        .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
        // Alef maksura ى (U+0649) → ya ي (U+064A).
        .replace(/\u0649/g, "\u064A")
        // Ta marbuta ة (U+0629) → ha ه (U+0647).
        // 💡 C'est ce remplacement qui résout محلة vs محله.
        .replace(/\u0629/g, "\u0647")
        // Hamza portée : ؤ (U+0624) → و, ئ (U+0626) → ي.
        .replace(/\u0624/g, "\u0648")
        .replace(/\u0626/g, "\u064A")
        // Espaces multiples, tabulations, retours à la ligne → un seul espace.
        .replace(/\s+/g, " ")
        .trim();
}

// ============================================================================
// NORMALISATION LATINE
// ============================================================================
// Même principe pour les noms en alphabet latin, utilisée quand le champ arabe
// est vide (client étranger, ou agent sans clavier arabe).
//
// 💡 `normalize("NFD")` décompose les caractères accentués : "é" devient "e" +
// un accent séparé, qu'on supprime ensuite. Ça rend "Aïcha" et "Aicha"
// équivalents — utile puisque l'OCR restitue rarement les accents.
export function normalizeLatin(text: string): string {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        // Tirets, apostrophes et ponctuation deviennent des séparateurs :
        // "Ben-Ali" et "Ben Ali" doivent être traités pareil.
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// ----------------------------------------------------------------------------
// DÉTECTION D'ÉCRITURE ARABE
// ----------------------------------------------------------------------------
// Sert à deux endroits : valider la saisie du champ côté formulaire (empêcher
// qu'un agent y retape le nom latin par réflexe, ce qui reproduirait le bug
// d'origine), et choisir la bonne normalisation côté serveur.
//
// U+0600–U+06FF est le bloc Unicode principal de l'écriture arabe.
export function containsArabic(text: string): boolean {
    return /[\u0600-\u06FF]/.test(text);
}

// ============================================================================
// DISTANCE DE LEVENSHTEIN
// ============================================================================
// Compte le nombre minimal de modifications (insertion, suppression,
// substitution d'un caractère) pour transformer un mot en un autre.
//
//   شهرة → شهره   distance 1  (une substitution)
//   شهرة → شهر    distance 1  (une suppression)
//   محلة → عونالله distance élevée → mots différents
//
// ⚠️ POURQUOI C'EST NÉCESSAIRE MÊME APRÈS NORMALISATION : la normalisation
// gère les variantes d'écriture LÉGITIMES, pas les erreurs de lecture. Or les
// lettres FINALES sont les plus mal reconnues par l'OCR — surtout sur une carte
// usée ou photographiée de biais. Le cas شهرة lu شهر (lettre finale disparue)
// n'est couvert par aucune règle de normalisation.
//
// 💡 Implémentation en deux lignes de matrice au lieu de la matrice complète :
// même résultat, mémoire proportionnelle à la longueur d'un mot seulement.
// Sur des noms de quelques dizaines de caractères, c'est instantané.
function levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i);

    for (let i = 0; i < a.length; i++) {
        const currentRow = [i + 1];
        for (let j = 0; j < b.length; j++) {
            const substitutionCost = a[i] === b[j] ? 0 : 1;
            currentRow[j + 1] = Math.min(
                currentRow[j] + 1,                    // insertion
                previousRow[j + 1] + 1,               // suppression
                previousRow[j] + substitutionCost     // substitution
            );
        }
        previousRow = currentRow;
    }

    return previousRow[b.length];
}

// ----------------------------------------------------------------------------
// TOLÉRANCE PAR MOT — PROPORTIONNELLE À SA LONGUEUR
// ----------------------------------------------------------------------------
// Une erreur fixe serait injuste dans les deux sens : sur un mot de 3 lettres,
// tolérer 1 erreur revient à accepter 33% d'écart — beaucoup trop permissif,
// "علي" correspondrait à "على" mais aussi à "عام". Sur un mot de 10 lettres,
// 1 seule erreur est au contraire trop strict.
//
//   ≤ 3 caractères  → 0 erreur   (correspondance exacte après normalisation)
//   4 à 7           → 1 erreur
//   ≥ 8             → 2 erreurs  (plafonné)
//
// ⚠️ Le plafond de 2 est délibéré : au-delà, deux noms réellement différents
// commenceraient à se ressembler, et le contrôle perdrait tout son sens.
function getWordTolerance(word: string): number {
    if (word.length <= 3) return 0;
    if (word.length <= 7) return 1;
    return 2;
}

// ============================================================================
// LA FONCTION PRINCIPALE — COMPARER UN NOM AU TEXTE OCR
// ============================================================================
// Pour chaque mot du nom, on cherche s'il existe UN mot du texte OCR
// suffisamment proche. On calcule ensuite la proportion de mots retrouvés.
//
// 💡 On ne cherche pas la phrase entière ni l'ordre des mots : l'OCR extrait
// tout le contenu de la carte dans un ordre imprévisible, mêlé aux mentions
// administratives (« République Tunisienne », « Carte d'identité »…). Chercher
// une séquence exacte échouerait systématiquement.
//
// Le retour est volontairement DÉTAILLÉ, pas un simple booléen : les mots
// manquants sont indispensables pour diagnostiquer un échec, et alimentent le
// message d'audit lu par l'agent.
export type NameMatchResult = {
    // Le nom est-il considéré comme retrouvé sur le document ?
    matched: boolean;
    // Proportion de mots retrouvés (0 à 1).
    ratio: number;
    // Compteurs bruts, utiles pour le message affiché à l'agent.
    foundCount: number;
    totalCount: number;
    // Les mots NON retrouvés — la donnée la plus précieuse pour comprendre
    // pourquoi un contrôle a échoué.
    missingWords: string[];
    // Quelle écriture a servi à la comparaison. À afficher dans le rationale :
    // sans cette information, un échec resterait indiagnosticable.
    script: "arabic" | "latin";
};

export function matchNameAgainstOcr(
    name: string,
    ocrText: string,
    threshold: number = MATCH_THRESHOLD
): NameMatchResult {
    // 💡 On détecte l'écriture à partir du NOM SAISI, pas du texte OCR. Une CIN
    // tunisienne contient à la fois de l'arabe et du latin (« CARTE D'IDENTITÉ
    // NATIONALE » y figure en français) : se fier au document mènerait à des
    // choix incohérents d'un dossier à l'autre.
    const isArabic = containsArabic(name);
    const normalize = isArabic ? normalizeArabic : normalizeLatin;

    const normalizedName = normalize(name);
    const normalizedOcr = normalize(ocrText);

    const nameWords = normalizedName
        .split(" ")
        .filter((w) => w.length >= MIN_WORD_LENGTH);

    const ocrWords = normalizedOcr
        .split(" ")
        .filter((w) => w.length >= MIN_WORD_LENGTH);

    // Cas limite : nom vide ou réduit à des mots d'une lettre. On refuse plutôt
    // que de renvoyer un ratio de 0/0 — un `NaN` se propagerait silencieusement
    // dans le calcul de score.
    if (nameWords.length === 0) {
        return {
            matched: false,
            ratio: 0,
            foundCount: 0,
            totalCount: 0,
            missingWords: [],
            script: isArabic ? "arabic" : "latin",
        };
    }

    const missingWords: string[] = [];
    let foundCount = 0;

    for (const word of nameWords) {
        const tolerance = getWordTolerance(word);

        // 💡 `some` s'arrête au premier mot suffisamment proche — inutile de
        // parcourir tout le texte de la carte une fois la correspondance trouvée.
        const isFound = ocrWords.some(
            (ocrWord) => levenshteinDistance(word, ocrWord) <= tolerance
        );

        if (isFound) {
            foundCount++;
        } else {
            missingWords.push(word);
        }
    }

    const ratio = foundCount / nameWords.length;

    return {
        matched: ratio >= threshold,
        ratio,
        foundCount,
        totalCount: nameWords.length,
        missingWords,
        script: isArabic ? "arabic" : "latin",
    };
}

// ----------------------------------------------------------------------------
// COMPARAISON D'UN NUMÉRO DE DOCUMENT
// ----------------------------------------------------------------------------
// Le numéro de CIN est imprimé en chiffres, y compris sur les cartes arabes.
// Mais deux pièges le rendent souvent introuvable par une simple recherche :
//
//   • Les CHIFFRES ARABO-INDIENS (٠١٢٣٤٥٦٧٨٩) apparaissent sur certaines
//     cartes. Ils occupent une plage Unicode distincte de 0-9 : "14066711" et
//     "١٤٠٦٦٧١١" sont deux chaînes totalement différentes pour un ordinateur,
//     alors qu'elles représentent le même nombre.
//   • L'OCR insère fréquemment des espaces ou des tirets dans les longues
//     séquences de chiffres.
//
// On convertit donc les chiffres arabo-indiens vers leurs équivalents latins,
// et on retire tout ce qui n'est pas un chiffre des deux côtés avant de comparer.
export function matchIdNumberAgainstOcr(idNumber: string, ocrText: string): boolean {
    // ٠ commence à U+0660, ۰ (variante persane/ourdoue) à U+06F0.
    const toLatinDigits = (s: string) =>
        s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
         .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

    const cleanId = toLatinDigits(idNumber).replace(/\D/g, "");
    const cleanOcr = toLatinDigits(ocrText).replace(/\D/g, "");

    if (cleanId.length === 0) return false;

    return cleanOcr.includes(cleanId);
}