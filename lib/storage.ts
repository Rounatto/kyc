// ============================================================================
// 🆕 [PHASE B] 🔒 STOCKAGE PRIVÉ DES DOCUMENTS KYC — SUPABASE STORAGE
// ============================================================================
// Pourquoi ce fichier existe : les pièces d'identité et selfies étaient stockés
// sur uploadthing derrière des URLs PUBLIQUES ET PERMANENTES. Le problème de
// fond, c'est que dans ce modèle **l'URL EST l'autorisation** : la connaître
// suffit à voir le document, sans compte, sans session. Et comme elle ne périme
// jamais, une seule fuite (log serveur, historique de navigateur, en-tête
// Referer, capture d'écran) donne un accès définitif. Pour une plateforme KYC,
// c'est la donnée la plus sensible du produit qui était exposée.
//
// ⚠️ Pourquoi on quitte uploadthing pour ces fichiers : leur fonctionnalité
// "fichiers privés" (ACL) est réservée aux plans payants. Supabase fait
// l'inverse — un bucket y est PRIVÉ PAR DÉFAUT, et le rendre public demande une
// action explicite. Le comportement sûr est le comportement par défaut, ce qui
// est exactement ce qu'on veut pour ce type de donnée.
//
// 🔑 LE MODÈLE D'ACCÈS EN TROIS TEMPS :
//   1. La base ne stocke plus une URL, mais un CHEMIN ("abc/123-idcard.jpg").
//      Un chemin seul ne donne accès à rien : il n'est pas adressable.
//   2. Les fichiers vivent dans un bucket privé. Le CDN refuse toute requête
//      non signée, quelle qu'elle soit.
//   3. Quand un agent autorisé ouvre une fiche, le SERVEUR vérifie sa session
//      et son companyId, puis fabrique une URL signée valable quelques minutes.
//      Passé ce délai, le lien est mort — même s'il a fuité entre-temps.
//
// 💡 Ce fichier ne contient AUCUN contrôle d'accès. C'est volontaire : il ne
// sait que parler au stockage. C'est aux routes API qui l'appellent de vérifier
// qui demande quoi (via enforceRole), exactement comme lib/crypto.ts ne sait
// que chiffrer sans se soucier de qui l'appelle.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";

// Le bucket dédié, créé manuellement dans le dashboard Supabase.
// ⚠️ Il DOIT rester privé (case "Public bucket" décochée). S'il devenait
// public, tout ce fichier perdrait son intérêt : Supabase court-circuite alors
// tout contrôle d'accès et sert les fichiers à qui les demande.
//
// 💡 Pourquoi un bucket SÉPARÉ de "avatars" plutôt qu'un dossier dedans :
// chez Supabase, le modèle d'accès se décide au niveau du BUCKET, pas du
// fichier. Un avatar doit être public (il s'affiche dans le header de chaque
// page, il ne peut pas exiger une signature à chaque chargement) ; une pièce
// d'identité doit être privée. Deux besoins contradictoires, donc deux buckets.
export const KYC_BUCKET = "kyc-documents";

// Durée de vie par défaut d'une URL de consultation.
// 5 minutes : assez pour qu'un agent ouvre une fiche et examine les documents,
// assez court pour qu'un lien copié par erreur soit périmé avant d'être utile.
const DEFAULT_SIGNED_URL_TTL_SECONDS = 5 * 60;

// Durée de vie d'une URL d'UPLOAD. Plus longue, parce qu'elle doit couvrir le
// transfert complet d'un fichier de 4 Mo depuis une connexion potentiellement
// lente (mobile, réseau saturé), pas seulement l'ouverture d'une page.
const UPLOAD_URL_TTL_SECONDS = 15 * 60;

// ----------------------------------------------------------------------------
// CLIENT SUPABASE — initialisé PARESSEUSEMENT, jamais au chargement du module
// ----------------------------------------------------------------------------
// ⚠️ POINT IMPORTANT, APPRIS À NOS DÉPENS : dans lib/ratelimit.ts, les
// limiteurs sont créés au niveau du module (`export const x = new Ratelimit(...)`),
// donc la connexion Redis s'établit DÈS L'IMPORT du fichier. Résultat : une
// variable d'environnement manquante sur Vercel faisait échouer le BUILD entier,
// avec un message très éloigné de la vraie cause.
//
// Ici, le client n'est construit qu'au premier appel réel d'une fonction. Une
// variable manquante donnera une erreur claire à l'exécution, dans la route
// concernée — jamais un build cassé.
//
// La variable `cachedClient` évite de reconstruire le client à chaque requête :
// les instances serverless réutilisent le module entre deux appels "à chaud".
let cachedClient: SupabaseClient | null = null;

function getStorageClient(): SupabaseClient {
    if (cachedClient) return cachedClient;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error(
            "Configuration de stockage incomplète : NEXT_PUBLIC_SUPABASE_URL et " +
            "SUPABASE_SERVICE_ROLE_KEY doivent être définies."
        );
    }

    // ⚠️ On utilise la clé SERVICE_ROLE, qui contourne les politiques RLS de
    // Supabase. C'est assumé : le contrôle d'accès de TrustVerify est appliqué
    // au niveau applicatif (enforceRole + filtrage companyId), comme dans tout
    // le reste du projet. Cette clé ne doit JAMAIS atteindre le navigateur —
    // d'où l'absence du préfixe NEXT_PUBLIC_ dans son nom, ce qui garantit que
    // Next.js ne l'inclura jamais dans un bundle client.
    //
    // `persistSession: false` : ce client sert uniquement à des opérations
    // serveur ponctuelles, il n'a aucune session utilisateur à mémoriser.
    cachedClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    return cachedClient;
}

// ----------------------------------------------------------------------------
// CONSTRUCTION DU CHEMIN DE STOCKAGE
// ----------------------------------------------------------------------------
// Format retenu : "{companyId}/{identifiant aléatoire}-{type}.{extension}"
// Exemple : "cmp_a1b2c3/9f8e7d6c5b4a3921-idcard.jpg"
//
// 💡 POURQUOI LE companyId EN PRÉFIXE : le cloisonnement multi-tenant devient
// visible dans l'organisation même du stockage. Concrètement, ça permet de
// répondre à "montre-moi tous les documents de cette entreprise" ou "supprime
// tout pour ce client" par une simple opération sur un préfixe. Et si tu ajoutes
// un jour de vraies politiques RLS Supabase, elles pourront s'appuyer sur ce
// préfixe sans avoir à réorganiser quoi que ce soit.
//
// 💡 POURQUOI UN IDENTIFIANT ALÉATOIRE ET PAS L'ID DU DOSSIER : au moment de
// l'upload, le dossier KYC N'EXISTE PAS ENCORE. L'agent remplit le formulaire,
// téléverse les fichiers, et le VerificationRequest n'est créé qu'à la
// soumission finale. On ne peut donc pas nommer les fichiers d'après un
// identifiant qui n'existe pas — et de toute façon, un nom imprévisible est
// préférable : il empêche de deviner un chemin par énumération.
//
// ⚠️ L'extension est déduite du type MIME et non du nom de fichier envoyé par
// le client : un nom de fichier est une donnée utilisateur, potentiellement
// piégée ("../../autre-dossier/fichier.jpg"). En le reconstruisant nous-mêmes,
// aucune traversée de répertoire n'est possible.
export type KycDocumentKind = "idcard" | "selfie";

const MIME_TO_EXTENSION: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
};

// Liste blanche stricte des types acceptés.
// ⚠️ image/svg+xml est délibérément ABSENT : un SVG est un document XML qui peut
// contenir du JavaScript. Servi depuis notre domaine, il deviendrait un vecteur
// de XSS. On n'accepte que des formats raster, incapables de porter du code.
export function isAllowedDocumentMimeType(mimeType: string): boolean {
    return Object.prototype.hasOwnProperty.call(MIME_TO_EXTENSION, mimeType);
}

export function buildDocumentPath(
    companyId: string,
    kind: KycDocumentKind,
    mimeType: string
): string {
    if (!isAllowedDocumentMimeType(mimeType)) {
        throw new Error(`Type de fichier non autorisé : ${mimeType}`);
    }

    const extension = MIME_TO_EXTENSION[mimeType];
    // 16 octets aléatoires = 32 caractères hexadécimaux. Largement suffisant
    // pour exclure toute collision et toute tentative de deviner un chemin.
    const uniqueId = crypto.randomBytes(16).toString("hex");

    return `${companyId}/${uniqueId}-${kind}.${extension}`;
}

// ----------------------------------------------------------------------------
// 1. URL D'UPLOAD SIGNÉE — pour un envoi direct depuis le navigateur
// ----------------------------------------------------------------------------
// Le serveur autorise UN upload, vers UN chemin précis, pour une durée limitée.
// Le navigateur envoie ensuite le fichier directement à Supabase, sans jamais
// transiter par notre application.
//
// 💡 POURQUOI CE DÉTOUR PLUTÔT QU'UN UPLOAD VIA NOTRE PROPRE API :
//   1. Vercel plafonne le corps d'une requête serverless à 4,5 Mo. Nos fichiers
//      montent à 4 Mo — la marge est trop mince, et l'encodage multipart la
//      réduit encore. On frôlerait l'échec en permanence.
//   2. Faire transiter un fichier par une fonction serverless signifie le
//      charger entièrement en mémoire et payer le temps d'exécution du
//      transfert. C'est du gaspillage pour une opération que le stockage sait
//      faire directement.
//   3. Le chemin est imposé par le SERVEUR, pas par le client. Impossible pour
//      un utilisateur d'écrire dans le dossier d'une autre entreprise : il ne
//      choisit jamais où son fichier atterrit.
export async function createSignedUploadUrl(path: string) {
    const supabase = getStorageClient();

    const { data, error } = await supabase.storage
        .from(KYC_BUCKET)
        .createSignedUploadUrl(path, { upsert: false });

    // `upsert: false` : un chemin déjà utilisé ne peut pas être écrasé. Comme
    // chaque chemin contient un identifiant aléatoire, ça ne devrait jamais
    // arriver — mais c'est un garde-fou contre l'écrasement accidentel d'un
    // document existant, ce qui serait irréversible.

    if (error || !data) {
        console.error("[STORAGE] Échec de création de l'URL d'upload :", error);
        throw new Error("Impossible de préparer l'envoi du document.");
    }

    return {
        // L'URL complète vers laquelle le navigateur enverra le fichier.
        signedUrl: data.signedUrl,
        // Le jeton, requis par le SDK côté client si tu utilises
        // uploadToSignedUrl() plutôt qu'un fetch brut.
        token: data.token,
        // Le chemin à conserver en base une fois l'upload confirmé.
        path,
    };
}

// ----------------------------------------------------------------------------
// 2. URL DE CONSULTATION SIGNÉE — le cœur du correctif
// ----------------------------------------------------------------------------
// Fabrique un lien temporaire vers un document privé. C'est la seule façon
// d'accéder au contenu du bucket, et elle passe obligatoirement par notre
// serveur — donc par un contrôle d'accès.
//
// ⚠️ À N'APPELER QU'APRÈS avoir vérifié que le demandeur a le droit de voir CE
// document précis (session valide + companyId correspondant au dossier). Cette
// fonction ne vérifie rien elle-même : elle signe ce qu'on lui demande de
// signer. Toute la sécurité repose sur l'appelant.
export async function createSignedDocumentUrl(
    path: string,
    expiresInSeconds: number = DEFAULT_SIGNED_URL_TTL_SECONDS
): Promise<string> {
    const supabase = getStorageClient();

    const { data, error } = await supabase.storage
        .from(KYC_BUCKET)
        .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
        console.error("[STORAGE] Échec de signature de l'URL :", error);
        throw new Error("Impossible d'accéder au document demandé.");
    }

    return data.signedUrl;
}

// Variante pour plusieurs documents à la fois.
// 💡 Utile sur la fiche client, qui affiche la pièce d'identité ET le selfie :
// un seul aller-retour réseau au lieu de deux. La différence est minime sur
// deux fichiers, mais c'est le bon réflexe si tu affiches un jour une galerie.
export async function createSignedDocumentUrls(
    paths: string[],
    expiresInSeconds: number = DEFAULT_SIGNED_URL_TTL_SECONDS
): Promise<Record<string, string>> {
    if (paths.length === 0) return {};

    const supabase = getStorageClient();

    const { data, error } = await supabase.storage
        .from(KYC_BUCKET)
        .createSignedUrls(paths, expiresInSeconds);

    if (error || !data) {
        console.error("[STORAGE] Échec de signature groupée :", error);
        throw new Error("Impossible d'accéder aux documents demandés.");
    }

    // Le SDK renvoie un tableau ; on le transforme en dictionnaire
    // chemin → URL, plus pratique à consommer côté appelant.
    const result: Record<string, string> = {};
    for (const item of data) {
        if (item.path && item.signedUrl) {
            result[item.path] = item.signedUrl;
        }
    }
    return result;
}

// ----------------------------------------------------------------------------
// 3. UPLOAD DEPUIS LE SERVEUR — voie secondaire
// ----------------------------------------------------------------------------
// Pour les cas où le fichier est déjà entre les mains du serveur (import par
// lot, migration de données, futur endpoint API B2B où un client enverrait le
// document via notre API plutôt que depuis un navigateur).
//
// ⚠️ À ne PAS utiliser dans le formulaire de vérification : on y retomberait
// sur la limite Vercel de 4,5 Mo évoquée plus haut.
export async function uploadDocumentFromServer(
    path: string,
    body: Buffer | ArrayBuffer | Uint8Array,
    contentType: string
): Promise<string> {
    if (!isAllowedDocumentMimeType(contentType)) {
        throw new Error(`Type de fichier non autorisé : ${contentType}`);
    }

    const supabase = getStorageClient();

    const { error } = await supabase.storage
        .from(KYC_BUCKET)
        .upload(path, body, { contentType, upsert: false });

    if (error) {
        console.error("[STORAGE] Échec de l'upload serveur :", error);
        throw new Error("Impossible d'enregistrer le document.");
    }

    return path;
}

// ----------------------------------------------------------------------------
// 4. SUPPRESSION
// ----------------------------------------------------------------------------
// Nécessaire pour deux usages à venir : nettoyer un upload orphelin (l'agent
// téléverse puis abandonne le formulaire — le fichier resterait sinon
// indéfiniment), et appliquer une vraie politique de rétention des données
// (purge après X mois, exigence RGPD prévue en Phase G).
export async function deleteDocuments(paths: string[]): Promise<void> {
    if (paths.length === 0) return;

    const supabase = getStorageClient();
    const { error } = await supabase.storage.from(KYC_BUCKET).remove(paths);

    if (error) {
        // Échec NON bloquant : un fichier qu'on n'a pas réussi à supprimer est
        // un problème de ménage, pas de sécurité. Faire échouer l'opération
        // appelante (par exemple la suppression d'un dossier) pour autant serait
        // disproportionné. On journalise pour pouvoir rattraper.
        console.error("[STORAGE] Échec de suppression :", error);
    }
}