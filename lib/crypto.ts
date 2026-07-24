// ============================================================================
// 🆕 [PHASE B] 🔐 CHIFFREMENT SYMÉTRIQUE AU REPOS — AES-256-GCM
// ============================================================================
// Pourquoi ce fichier existe : certaines données stockées en base sont des
// secrets qui doivent rester illisibles même pour quelqu'un qui obtiendrait un
// dump complet de la base (backup volé, injection SQL ailleurs, accès admin
// abusif). Le premier cas d'usage est `User.totpSecret` : ce secret permet de
// GÉNÉRER les codes 2FA à 6 chiffres — s'il fuite en clair, l'attaquant peut
// produire les codes de n'importe quel utilisateur et le 2FA ne protège plus rien.
//
// Algorithme retenu : AES-256-GCM.
//   - AES-256 : chiffrement symétrique standard (même clé pour chiffrer et
//     déchiffrer), 256 bits de clé.
//   - GCM (Galois/Counter Mode) : mode "authentifié". En plus de chiffrer, il
//     produit un "tag d'authentification" qui garantit que le contenu n'a pas
//     été modifié. Si quelqu'un altère ne serait-ce qu'un octet en base, le
//     déchiffrement ÉCHOUE au lieu de renvoyer silencieusement des données
//     corrompues. C'est ce qui le rend supérieur au vieux mode CBC.
//
// ⚠️ ENCRYPTION_KEY est la clé maîtresse. Si elle est perdue ou modifiée,
// toutes les données chiffrées avec elle deviennent DÉFINITIVEMENT illisibles.
// Elle doit être sauvegardée hors de Vercel et ne jamais être commitée.
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

// GCM recommande un IV de 12 octets (96 bits) : c'est la taille pour laquelle
// l'algorithme est le plus efficace et le mieux étudié.
const IV_LENGTH = 12;

// Préfixe de version placé devant chaque valeur chiffrée. Il sert à deux choses :
//   1. RÉTROCOMPATIBILITÉ : distinguer une valeur déjà chiffrée d'un ancien
//      secret encore en clair en base (voir isEncrypted / decrypt plus bas).
//      Sans ça, on ne pourrait pas migrer sans casser les comptes existants.
//   2. ÉVOLUTIVITÉ : si un jour on change d'algorithme, on écrira "enc:v2:" et
//      le code saura déchiffrer les deux formats pendant la transition.
const ENCRYPTION_PREFIX = "enc:v1:";

// Charge et valide la clé maîtresse depuis l'environnement.
// On échoue BRUYAMMENT (throw) plutôt que de continuer avec une clé absente ou
// malformée : un chiffrement silencieusement cassé est bien pire qu'une erreur
// visible au démarrage.
function getEncryptionKey(): Buffer {
    const rawKey = process.env.ENCRYPTION_KEY;

    if (!rawKey) {
        throw new Error(
            "ENCRYPTION_KEY est absente de l'environnement. " +
            "Génère 64 caractères hexadécimaux et ajoute-les aux variables d'environnement."
        );
    }

    // La clé est stockée en hexadécimal : 64 caractères hex = 32 octets = 256 bits.
    const key = Buffer.from(rawKey, "hex");

    if (key.length !== 32) {
        throw new Error(
            `ENCRYPTION_KEY invalide : ${key.length} octets décodés au lieu de 32. ` +
            "Elle doit contenir exactement 64 caractères hexadécimaux."
        );
    }

    return key;
}

// Indique si une valeur lue en base est déjà au format chiffré.
// Utilisé pour la migration progressive : les secrets écrits AVANT ce correctif
// sont en clair et ne portent pas le préfixe.
export function isEncrypted(value: string | null | undefined): boolean {
    return typeof value === "string" && value.startsWith(ENCRYPTION_PREFIX);
}

// Chiffre une chaîne. Résultat : "enc:v1:<iv>:<authTag>:<données chiffrées>",
// les trois parties en hexadécimal.
//
// Point important : un IV (vecteur d'initialisation) ALÉATOIRE est généré à
// chaque appel. C'est pourquoi chiffrer deux fois le même secret produit deux
// résultats totalement différents — et c'est voulu. Réutiliser un IV avec la
// même clé en mode GCM casse complètement la sécurité de l'algorithme.
// L'IV n'est pas secret : il est stocké en clair à côté du résultat, car il est
// indispensable au déchiffrement.
export function encrypt(plaintext: string): string {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);

    // Le tag d'authentification n'est disponible QU'APRÈS cipher.final().
    // C'est lui qui permettra de détecter toute altération au déchiffrement.
    const authTag = cipher.getAuthTag();

    return [
        ENCRYPTION_PREFIX + iv.toString("hex"),
        authTag.toString("hex"),
        encrypted.toString("hex"),
    ].join(":");
}

// Déchiffre une valeur produite par encrypt().
//
// 🔁 RÉTROCOMPATIBILITÉ : si la valeur ne porte pas le préfixe, c'est un ancien
// secret stocké en clair (avant ce correctif) — on le renvoie tel quel pour ne
// pas bloquer les comptes existants. Cette tolérance pourra être retirée une
// fois tous les secrets migrés (voir la migration opportuniste dans nextauth).
//
// En cas d'altération des données ou de mauvaise clé, `decipher.final()` lève
// une exception : c'est le comportement recherché (fail-closed), l'appelant
// doit refuser l'opération plutôt que de continuer.
export function decrypt(payload: string): string {
    if (!isEncrypted(payload)) {
        return payload;
    }

    const key = getEncryptionKey();
    const withoutPrefix = payload.slice(ENCRYPTION_PREFIX.length);
    const parts = withoutPrefix.split(":");

    if (parts.length !== 3) {
        throw new Error("Format de donnée chiffrée invalide : 3 segments attendus.");
    }

    const [ivHex, authTagHex, cipherHex] = parts;

    const decipher = crypto.createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(ivHex, "hex")
    );

    // On fournit le tag AVANT de déchiffrer : GCM s'en sert pour vérifier
    // l'intégrité, et fera échouer final() si quoi que ce soit a été modifié.
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(cipherHex, "hex")),
        decipher.final(),
    ]);

    return decrypted.toString("utf8");
}