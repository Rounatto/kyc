// ============================================================================
// 🆕 [PHASE B] 🔑 CODES DE SECOURS 2FA — GÉNÉRATION ET VÉRIFICATION
// ============================================================================
// Pourquoi ce fichier existe : le 2FA TOTP exige un code généré par le
// téléphone de l'utilisateur. Perdre ce téléphone signifiait, jusqu'ici, être
// DÉFINITIVEMENT verrouillé dehors — la seule issue étant une intervention
// manuelle en base de données. Le champ `backupCodes` existait dans le schéma
// depuis le début, mais rien ne l'a jamais rempli.
//
// Ces codes sont des remplaçants à usage unique du code TOTP : chacun ouvre une
// session, une seule fois, puis disparaît.
//
// 🔒 CE QUI EST STOCKÉ EN BASE : uniquement des empreintes HMAC-SHA256. Le
// serveur est donc MATHÉMATIQUEMENT INCAPABLE de réafficher les codes après
// leur génération — c'est le même principe que pour les clés API. Si
// l'utilisateur les perd, il doit en régénérer.
import crypto from "crypto";

// Nombre de codes générés à l'activation.
// 💡 10 est le standard de l'industrie (GitHub, Google) : assez pour couvrir
// plusieurs pertes d'appareil sans que la liste devienne ingérable à imprimer.
const CODE_COUNT = 10;

// Longueur d'un code, hors séparateur.
const CODE_LENGTH = 10;

// ⚠️ ALPHABET VOLONTAIREMENT AMPUTÉ : ni I, ni O, ni 0, ni 1.
//
// Ces codes seront recopiés À LA MAIN depuis une feuille imprimée ou une
// capture d'écran. Un « 0 » lu comme un « O » produit un échec que
// l'utilisateur ne peut pas diagnostiquer — il voit le bon code sous ses yeux
// et le système le refuse. Retirer les caractères ambigus coûte un peu
// d'entropie et évite ce piège.
//
// Il reste 32 caractères : 32^10 = 2^50, soit environ un million de milliards
// de combinaisons. Largement hors de portée d'une attaque par devinette.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// ----------------------------------------------------------------------------
// GÉNÉRATION
// ----------------------------------------------------------------------------
// 💡 `crypto.randomInt` et non `Math.random()` : même raison que pour les codes
// OTP. Math.random utilise un générateur déterministe et prédictible, inadapté
// à toute valeur de sécurité.
//
// 💡 `randomInt(0, n)` tire uniformément SANS BIAIS. L'approche naïve
// `Math.floor(random * n)` ou un modulo sur des octets aléatoires favorise
// légèrement certains caractères quand la taille de l'alphabet ne divise pas
// 256 — un défaut réel, quoique modeste, que cette fonction évite par
// construction.
function generateSingleCode(): string {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
        code += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
    }
    // Format d'affichage "XXXXX-XXXXX" : un bloc de 10 caractères d'affilée est
    // pénible à lire et à recopier. Le tiret est purement cosmétique — il est
    // retiré à la vérification (voir normalizeBackupCode).
    return `${code.slice(0, 5)}-${code.slice(5)}`;
}

// Produit les codes EN CLAIR, à afficher une seule fois à l'utilisateur.
export function generateBackupCodes(): string[] {
    return Array.from({ length: CODE_COUNT }, generateSingleCode);
}

// ----------------------------------------------------------------------------
// NORMALISATION
// ----------------------------------------------------------------------------
// Ce que l'utilisateur tape ne ressemble jamais exactement à ce qu'on a généré :
// minuscules, espaces collés au copier-coller, tiret oublié ou en trop.
// On ramène tout à une forme canonique avant comparaison, sans quoi un code
// parfaitement valide serait refusé pour un détail de saisie.
export function normalizeBackupCode(input: string): string {
    return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// ----------------------------------------------------------------------------
// HACHAGE — LE CHOIX LE PLUS SUBTIL DE CE FICHIER
// ----------------------------------------------------------------------------
// ⚠️ POURQUOI PAS BCRYPT, comme pour les mots de passe :
// il faudrait comparer le code saisi aux 10 empreintes stockées, une par une.
// bcrypt à 12 tours prend ~250 ms par comparaison — soit 2,5 SECONDES ajoutées
// à chaque tentative de connexion. Inacceptable.
//
// ⚠️ POURQUOI PAS SHA-256 NU :
// instantané, mais bien trop faible ici. Nos codes ont 2^50 combinaisons ; un
// GPU calcule des milliards de SHA-256 par seconde. Une fuite de la base
// permettrait de les casser tous en quelques heures.
//
// ✅ HMAC-SHA256 AVEC UNE CLÉ SERVEUR combine les deux qualités :
//   - Vérification instantanée (une seule opération de hachage)
//   - Impossible à brute-forcer sans la clé, qui vit dans les variables
//     d'environnement et JAMAIS dans la base. Voler la base ne suffit plus.
//
// 💡 Le préfixe "backup-code:" est une séparation de domaine : `ENCRYPTION_KEY`
// sert aussi au chiffrement AES des secrets TOTP et au leurre WebAuthn. Ce
// préfixe garantit qu'une même entrée ne produira jamais la même sortie dans
// deux usages différents.
//
// ⚠️ LIMITE ASSUMÉE : si la clé ET la base fuitent ensemble, la protection
// tombe. C'est le même compromis que pour les secrets TOTP chiffrés — la
// sécurité repose sur le fait que ces deux éléments vivent dans des systèmes
// séparés.
function hashBackupCode(normalizedCode: string): string {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        throw new Error("ENCRYPTION_KEY manquante : impossible de hacher les codes de secours.");
    }
    return crypto
        .createHmac("sha256", key)
        .update(`backup-code:${normalizedCode}`)
        .digest("hex");
}

// Transforme les codes en clair en une chaîne JSON prête à écrire en base.
//
// 💡 Pourquoi un JSON dans une colonne texte plutôt qu'une table dédiée :
// le champ `backupCodes String?` existe déjà dans le schéma, et une liste de 10
// valeurs qu'on lit et réécrit toujours en bloc n'a rien à gagner à devenir une
// table. Ce serait de la complexité sans bénéfice.
export function hashBackupCodes(plainCodes: string[]): string {
    const hashes = plainCodes.map((code) => hashBackupCode(normalizeBackupCode(code)));
    return JSON.stringify(hashes);
}

// ----------------------------------------------------------------------------
// VÉRIFICATION ET CONSOMMATION
// ----------------------------------------------------------------------------
// Retourne `null` si le code est invalide, ou la NOUVELLE valeur à écrire en
// base si le code est bon (la liste amputée du code utilisé).
//
// 🔒 USAGE UNIQUE : le code consommé est retiré de la liste. Sans ça, un code
// intercepté resterait réutilisable indéfiniment — il deviendrait un second mot
// de passe permanent, exactement le contraire de l'objectif.
//
// 💡 La fonction ne touche PAS à la base : elle calcule et rend le résultat.
// C'est l'appelant qui décide d'écrire, dans le contexte où il se trouve (une
// transaction, par exemple). Un module qui écrit en base de son propre chef est
// beaucoup plus difficile à réutiliser et à tester.
export function verifyAndConsumeBackupCode(
    storedJson: string | null,
    userInput: string
): { remainingJson: string; remainingCount: number } | null {
    if (!storedJson) return null;

    let hashes: string[];
    try {
        hashes = JSON.parse(storedJson);
        if (!Array.isArray(hashes)) return null;
    } catch {
        // Donnée corrompue en base : on refuse plutôt que de risquer un
        // comportement imprévisible. Fail-closed.
        console.error("[BACKUP-CODES] Format de stockage invalide.");
        return null;
    }

    const normalized = normalizeBackupCode(userInput);

    // Un code vide ou trop court ne peut pas être valide — on évite un calcul
    // de hachage inutile.
    if (normalized.length !== CODE_LENGTH) return null;

    let candidateHash: string;
    try {
        candidateHash = hashBackupCode(normalized);
    } catch (error) {
        console.error("[BACKUP-CODES] Échec du hachage :", error);
        return null;
    }

    const index = hashes.indexOf(candidateHash);
    if (index === -1) return null;

    // Le code est valide : on le retire de la liste.
    const remaining = hashes.filter((_, i) => i !== index);

    return {
        remainingJson: JSON.stringify(remaining),
        remainingCount: remaining.length,
    };
}

// Combien de codes restent utilisables. Sert à afficher un avertissement dans
// les Settings quand la réserve s'épuise.
export function countRemainingBackupCodes(storedJson: string | null): number {
    if (!storedJson) return 0;
    try {
        const hashes = JSON.parse(storedJson);
        return Array.isArray(hashes) ? hashes.length : 0;
    } catch {
        return 0;
    }
}