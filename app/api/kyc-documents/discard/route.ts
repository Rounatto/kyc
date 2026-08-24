// ============================================================================
// 🆕 [PHASE C — LIVENESS] 🗑️ SUPPRESSION D'UNE TENTATIVE DE LIVENESS ABANDONNÉE
// ============================================================================
// Pourquoi cette route existe : chaque séquence de liveness dépose TROIS images
// dans le bucket privé. Quand l'agent relance — parce que le client a raté une
// pose, parce qu'il a bougé trop tôt — les images de la tentative précédente
// restent là, définitivement, sans qu'aucun dossier ne les référence.
//
// ⚠️ CE N'EST PAS UN PROBLÈME DE SÉCURITÉ, MAIS UN PROBLÈME DE VOLUME. Ces
// fichiers ne sont accessibles à personne (bucket privé, chemin imprévisible).
// Simplement, trois relances laissent NEUF images dont six ne serviront jamais.
// Sur le plan gratuit Supabase plafonné à 1 Go, ça finit par peser.
//
// 💡 POURQUOI NE PAS PLUTÔT ATTENDRE LA VALIDATION DE L'AGENT AVANT D'ENVOYER :
// c'était la solution évidente, et elle est mauvaise. Si l'agent peut examiner
// les trois images puis décider s'il les envoie, il peut RELANCER JUSQU'À
// OBTENIR DES IMAGES QUI PASSENT. Le contrôle deviendrait "l'agent trouve-t-il
// ces photos convaincantes ?" — exactement la question qu'on lui a retirée des
// mains en construisant ce système. Et dans un scénario de complicité, ce
// bouton donnerait à un agent malveillant le contrôle total : dix essais, on
// garde le meilleur, le serveur n'en voit qu'un.
//
// ✅ D'OÙ CE COMPROMIS : la capture part TOUJOURS, immédiatement, sans tri
// possible. Mais une relance efface la tentative précédente. Une seule séquence
// vit dans le bucket à la fois, et le compteur de tentatives (transmis au
// serveur) conserve la trace du nombre réel d'essais.
//
// ⚠️ CE QUE CETTE ROUTE NE COUVRE PAS : l'agent qui ferme simplement l'onglet
// en pleine séquence. Ces images-là restent orphelines — elles seront ramassées
// par la purge du cron hebdomadaire, comme les uploads abandonnés du formulaire.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";
import { deleteDocuments } from "@/lib/storage";

// Au plus 3 chemins : c'est exactement ce que produit une séquence. Plafonner
// évite qu'un appel malveillant ne demande la suppression de centaines de
// fichiers en une requête.
const discardSchema = z.object({
    paths: z.array(z.string().min(1)).min(1).max(3),
});

// ⚠️ SECOND GARDE-FOU, INDÉPENDANT DU PREMIER. Cette route ne peut supprimer
// QUE des images de liveness — jamais une pièce d'identité, jamais un selfie.
//
// 💡 POURQUOI CE VERROU ALORS QUE LE CONTRÔLE DE companyId SUFFIRAIT EN THÉORIE :
// parce qu'une route de suppression doit être INCAPABLE de détruire une preuve,
// même en cas de bug de notre côté. Sans ce filtre, une erreur dans le composant
// — un tableau de chemins mal construit — pourrait effacer la pièce d'identité
// d'un dossier déjà créé, de façon irréversible. Le contrôle de companyId
// protège les autres entreprises ; celui-ci protège l'entreprise elle-même.
const LIVENESS_PATH_MARKER = "-liveness-";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
        if (!guard.isValid) return guard.response!;

        const { companyId } = guard;

        if (!companyId) {
            return NextResponse.json(
                { error: "Compte non rattaché à une entreprise." },
                { status: 403 }
            );
        }

        const body = await req.json();
        const validationResult = discardSchema.safeParse(body);

        if (!validationResult.success) {
            return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
        }

        const { paths } = validationResult.data;

        // ====================================================================
        // 🔒 DEUX CONTRÔLES, CHACUN COUVRANT UN RISQUE DIFFÉRENT
        // ====================================================================
        //
        // 1. LE PRÉFIXE companyId — le cloisonnement multi-tenant.
        //    Les chemins viennent du CLIENT, on ne peut donc pas leur faire
        //    confiance. Sans ce contrôle, un agent de l'entreprise A qui
        //    connaîtrait un chemin de l'entreprise B pourrait effacer ses
        //    documents. C'est exactement la même vérification que dans
        //    /api/customers pour le rattachement des documents.
        //
        // 2. LE MARQUEUR "-liveness-" — la protection contre nos propres bugs.
        //    Voir le commentaire de LIVENESS_PATH_MARKER plus haut.
        //
        // 🔒 ON REJETTE TOUTE LA REQUÊTE si UN SEUL chemin est suspect, plutôt
        // que de filtrer silencieusement les mauvais et supprimer les bons. Un
        // chemin hors périmètre n'est pas une étourderie : c'est soit un bug de
        // notre côté, soit une tentative. Dans les deux cas, il faut que ça se
        // voie dans les journaux plutôt que de passer inaperçu.
        const prefix = `${companyId}/`;
        const invalid = paths.filter(
            (path) => !path.startsWith(prefix) || !path.includes(LIVENESS_PATH_MARKER)
        );

        if (invalid.length > 0) {
            console.error(
                `🔴 [DISCARD] Tentative de suppression hors périmètre (company ${companyId}) :`,
                invalid
            );
            return NextResponse.json(
                { error: "One or more paths are outside your workspace." },
                { status: 403 }
            );
        }

        // 💡 `deleteDocuments` est déjà NON BLOQUANT : il journalise une erreur
        // Supabase sans lever. Un fichier qu'on n'a pas réussi à supprimer est un
        // problème de ménage, pas de sécurité.
        await deleteDocuments(paths);

        return NextResponse.json({ discarded: paths.length });
    } catch (error) {
        console.error("[DISCARD] Échec de la suppression :", error);
        return NextResponse.json(
            { error: "Could not discard the previous attempt." },
            { status: 500 }
        );
    }
}