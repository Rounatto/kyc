// ============================================================================
// 🆕 [PHASE B] 🔐 AUTORISATION D'UPLOAD D'UN DOCUMENT KYC
// ============================================================================
// Cette route ne reçoit ET ne stocke AUCUN fichier. Elle délivre une
// AUTORISATION D'ÉCRITURE temporaire : une URL signée, valable 15 minutes,
// vers un emplacement précis du bucket privé. Le navigateur envoie ensuite le
// fichier DIRECTEMENT à Supabase, sans jamais passer par notre application.
//
// 🤔 POURQUOI CE DÉTOUR PLUTÔT QU'UN UPLOAD CLASSIQUE VERS NOTRE API :
//
//   1. LIMITE VERCEL. Le corps d'une requête serverless est plafonné à 4,5 Mo.
//      Nos documents montent à 4 Mo, et l'encodage multipart ajoute encore de
//      la marge : on frôlerait l'échec en permanence.
//
//   2. COÛT ET MÉMOIRE. Faire transiter un fichier par une fonction serverless
//      signifie le charger entièrement en RAM et payer le temps d'exécution du
//      transfert — pour une tâche que le stockage sait faire tout seul.
//
//   3. SÉCURITÉ — et c'est le point décisif. Le CHEMIN de destination est
//      calculé ICI, côté serveur, à partir du companyId de la SESSION. Le
//      client ne le choisit jamais. Il est donc structurellement impossible
//      pour un agent d'écrire dans le dossier d'une autre entreprise, même en
//      manipulant la requête : l'autorisation qu'il reçoit ne vaut que pour un
//      emplacement unique, déjà déterminé.
//
// ⚠️ LA TAILLE DU FICHIER N'EST PAS VÉRIFIABLE ICI, puisque le fichier ne
// passe pas par nous. C'est exactement pour ça que la limite de 4 Mo devait
// être configurée AU NIVEAU DU BUCKET dans le dashboard Supabase : c'est le
// stockage lui-même qui refusera un fichier trop lourd. Une vérification
// côté navigateur reste utile pour le confort (message immédiat), mais elle
// ne protège rien — un appel direct la contournerait.
//
// 🆕 [PHASE C — LIVENESS, ÉTAPE 3] La route accepte désormais les trois images
// de la séquence de détection de présence, en plus de la pièce d'identité et du
// selfie. Aucune autre logique n'a changé : le mécanisme d'autorisation est
// exactement le même, seule la liste des natures acceptées s'élargit.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";
import { enforceRateLimit, documentUploadLimiter } from "@/lib/ratelimit";
import {
    buildDocumentPath,
    createSignedUploadUrl,
    isAllowedDocumentMimeType,
    type KycDocumentKind,
} from "@/lib/storage";

// Le client ne fournit QUE deux informations : la nature du document et son
// type de fichier. Ni chemin, ni nom, ni identifiant d'entreprise — tout ce
// qui touche à l'emplacement est décidé côté serveur.
const uploadUrlSchema = z.object({
    // 🆕 [PHASE C] Cinq natures acceptées au lieu de deux.
    //
    // 💡 Cette valeur sert uniquement de suffixe lisible dans le nom du fichier
    // stocké. Aucun enjeu de sécurité — mais un enum plutôt qu'une chaîne libre
    // évite qu'une valeur farfelue ne se retrouve dans un chemin, et surtout il
    // documente ce que le système sait recevoir.
    //
    // ⚠️ CETTE LISTE DOIT RESTER SYNCHRONISÉE avec le type `KycDocumentKind` de
    // lib/storage.ts. Ce sont deux déclarations distinctes du même ensemble :
    // TypeScript ne peut pas dériver automatiquement un enum Zod d'un type, et
    // l'inverse rendrait le schéma illisible. Si tu ajoutes une nature un jour,
    // les deux endroits sont à modifier.
    //
    // 💡 "selfie" est conservé alors que le formulaire ne l'utilisera plus une
    // fois le liveness branché : un onglet resté ouvert avec l'ancienne version
    // de la page continuerait sinon de recevoir des 400 incompréhensibles.
    kind: z.enum([
        "idcard",
        "selfie",
        "liveness-reference",
        "liveness-action1",
        "liveness-action2",
    ]),

    // Le type MIME déclaré par le navigateur. Revalidé juste après contre la
    // liste blanche de lib/storage.ts.
    contentType: z.string().min(1, "Type de fichier manquant."),
});

export async function POST(req: Request) {
    try {
        // ====================================================================
        // 1. AUTHENTIFICATION ET RÔLE
        // ====================================================================
        // Même garde que partout ailleurs dans l'API. C'est aussi ce qui nous
        // donne le companyId, dont dépend tout le reste de cette route.
        const session = await getServerSession(authOptions);
        const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
        if (!guard.isValid) return guard.response!;

        const { companyId, userId } = guard;

        // Garde-fou : un utilisateur sans entreprise ne peut pas se voir
        // attribuer d'emplacement de stockage, puisque le chemin est construit
        // à partir du companyId. Ne devrait jamais arriver (enforceRole le
        // vérifie déjà), mais on ne construit pas un chemin sur une valeur
        // potentiellement vide.
        if (!companyId) {
            return NextResponse.json(
                { error: "Compte non rattaché à une entreprise." },
                { status: 403 }
            );
        }

        // ====================================================================
        // 2. LIMITATION DU NOMBRE DE DEMANDES
        // ====================================================================
        // 💡 Limité PAR UTILISATEUR et non par IP : la route est authentifiée,
        // on connaît donc exactement qui appelle. Une limite par IP pénaliserait
        // toute une entreprise dont les agents partagent la même connexion —
        // même raisonnement que pour la route /api/chat.
        //
        // 🆕 [PHASE C] Le seuil de ce limiteur a été relevé de 30 à 60 par
        // tranche de 10 minutes : un dossier consomme désormais 5 uploads au
        // lieu de 2 (voir le commentaire dans lib/ratelimit.ts).
        const rateLimited = await enforceRateLimit(documentUploadLimiter, userId!);
        if (rateLimited) return rateLimited;

        // ====================================================================
        // 3. VALIDATION DE L'ENTRÉE
        // ====================================================================
        const body = await req.json();
        const validationResult = uploadUrlSchema.safeParse(body);

        if (!validationResult.success) {
            const errorMessages = validationResult.error.issues
                .map((err) => err.message)
                .join(", ");
            return NextResponse.json({ error: errorMessages }, { status: 400 });
        }

        const { kind, contentType } = validationResult.data;

        // 🔒 LISTE BLANCHE STRICTE DES TYPES DE FICHIERS.
        // Seuls des formats raster sont acceptés (JPEG, PNG, WebP).
        // ⚠️ image/svg+xml est délibérément exclu : un SVG est un document XML
        // qui peut embarquer du JavaScript. Servi un jour depuis notre domaine,
        // il deviendrait un vecteur d'attaque XSS. Un JPEG, lui, ne peut pas
        // porter de code exécutable.
        //
        // 💡 Les images de liveness sont produites par `canvas.toBlob(...,
        // "image/jpeg")`, elles passent donc toujours ce contrôle. Il reste
        // nécessaire : rien n'oblige un appelant à passer par notre formulaire.
        if (!isAllowedDocumentMimeType(contentType)) {
            return NextResponse.json(
                { error: "Format non autorisé. Utilisez une image JPEG, PNG ou WebP." },
                { status: 400 }
            );
        }

        // ====================================================================
        // 4. CONSTRUCTION DU CHEMIN — LE CŒUR DE LA SÉCURITÉ
        // ====================================================================
        // Format : "{companyId}/{aléatoire}-{kind}.{extension}"
        //
        // Le companyId vient de la SESSION SERVEUR, jamais du corps de la
        // requête. C'est la même règle que pour agentId dans la création de
        // dossier KYC : dès qu'une donnée détermine QUI accède à QUOI, elle ne
        // peut pas venir du client.
        //
        // Conséquence concrète : un agent de l'entreprise A ne peut pas
        // provoquer l'écriture d'un fichier dans le dossier de l'entreprise B.
        // Ce n'est pas une vérification qu'on pourrait oublier — c'est
        // impossible par construction, puisqu'il ne fournit jamais le chemin.
        //
        // L'extension est déduite du type MIME et non du nom de fichier envoyé
        // par le navigateur : un nom de fichier est une donnée utilisateur,
        // donc potentiellement piégée ("../../autre-entreprise/doc.jpg").
        const path = buildDocumentPath(companyId, kind as KycDocumentKind, contentType);

        // ====================================================================
        // 5. GÉNÉRATION DE L'AUTORISATION
        // ====================================================================
        const upload = await createSignedUploadUrl(path);

        // ⚠️ FICHIERS ORPHELINS — limite connue et assumée.
        // Si l'agent téléverse puis abandonne le formulaire sans le soumettre,
        // le fichier reste dans le bucket sans aucun dossier KYC qui le
        // référence. Il n'est pas accessible (bucket privé, chemin
        // imprévisible), mais il occupe de l'espace.
        //
        // 🆕 [PHASE C] CE PROBLÈME S'AGGRAVE MÉCANIQUEMENT AVEC LE LIVENESS :
        // une séquence relancée trois fois par un agent perfectionniste laisse
        // neuf images orphelines au lieu de zéro. Rien de dangereux, mais le
        // nettoyage devient nettement plus utile qu'avant.
        // Il se fera via deleteDocuments() de lib/storage.ts, branché sur le
        // cron hebdomadaire existant — à traiter en même temps que la politique
        // de rétention RGPD (Phase G).

        return NextResponse.json({
            // L'URL vers laquelle le navigateur enverra le fichier (PUT direct).
            signedUrl: upload.signedUrl,
            // Le jeton, utile si le client passe par le SDK Supabase plutôt que
            // par un fetch brut.
            token: upload.token,
            // 💡 Le chemin doit être RENVOYÉ AU CLIENT, qui le joindra ensuite au
            // formulaire de création du dossier. C'est ce qui permettra à
            // /api/customers de le stocker.
            //
            // ⚠️ Ce n'est PAS une faille : un chemin n'est pas adressable. Il
            // n'a ni domaine ni protocole, le bucket est privé, et toute lecture
            // exigera une URL signée délivrée après vérification du companyId.
            // Le client connaît l'emplacement, mais n'a aucun moyen d'y accéder.
            path: upload.path,
        });

    } catch (error) {
        console.error("[UPLOAD-URL] Échec de génération de l'autorisation :", error);
        return NextResponse.json(
            { error: "Impossible de préparer l'envoi du document." },
            { status: 500 }
        );
    }
}