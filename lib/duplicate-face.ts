// ============================================================================
// 🆕 [DÉTECTION DE RÉSEAUX DE FRAUDE] MÊME VISAGE, PLUSIEURS IDENTITÉS
// ============================================================================
// Pourquoi ce fichier existe : jusqu'ici, chaque dossier était vérifié EN
// ISOLATION. Le pipeline confirmait que la personne devant la caméra était bien
// celle du document, et s'arrêtait là. Personne ne regardait si CE MÊME VISAGE
// avait déjà été enregistré sous un autre nom la semaine précédente.
//
// ⚠️ C'EST POURTANT UN DES SIGNAUX LES PLUS FORTS DU SECTEUR. Une même personne
// qui ouvre des comptes sous plusieurs identités est le schéma de base d'un
// réseau de fraude — et chaque dossier pris séparément peut être parfaitement
// propre : vrais documents, liveness réussi, visage correspondant. C'est
// uniquement en les RAPPROCHANT que la fraude devient visible.
//
// ============================================================================
// ⚠️ CE QUE CETTE IMPLÉMENTATION N'EST PAS — À LIRE AVANT DE L'ÉTENDRE
// ============================================================================
// L'approche correcte pour ce problème s'appelle la RECHERCHE VECTORIELLE : on
// calcule un "embedding" du visage (un vecteur de quelques centaines de nombres
// qui encode l'identité), on l'indexe, et on retrouve les plus proches voisins
// en une requête, quel que soit le nombre de dossiers.
//
// 💡 CE N'EST PAS CE QUI EST FAIT ICI, ET LA RAISON EST DOCUMENTÉE : aucun
// chemin viable n'existait pour calculer ces embeddings dans les contraintes du
// projet (Vercel gratuit, serverless, écosystème JavaScript).
//   • @xenova/transformers n'expose AUCUN modèle de reconnaissance faciale. Son
//     `image-feature-extraction` s'appuie sur CLIP/ViT, qui encodent l'APPARENCE
//     SÉMANTIQUE et non l'IDENTITÉ : deux personnes différentes aux cheveux
//     bouclés devant le même mur obtiendraient une similarité élevée. Ç'aurait
//     été un contrôle faussement rassurant.
//   • L'inférence gratuite de Hugging Face ne sert pas ces modèles de façon
//     fiable, et l'API d'embeddings de Gemini est textuelle.
//   • onnxruntime-node télécharge son binaire natif à l'installation, ce qui
//     rend le build dépendant d'un CDN externe — et les binaires natifs
//     s'accordent mal avec le serverless.
//
// ✅ CE QUI EST FAIT À LA PLACE : une comparaison directe, par le même moteur
// que lib/face-match.ts, contre un NOMBRE PLAFONNÉ de dossiers récents.
//
// ⚠️ LA LIMITE EST STRUCTURELLE, PAS UN RÉGLAGE : le coût est LINÉAIRE (un appel
// par dossier comparé). À 3 candidats c'est tenable ; à 1000 dossiers, c'est
// impossible. Cette version détecte un réseau de fraude actif — plusieurs
// soumissions rapprochées — mais PAS une identité réutilisée six mois plus tard.
// Le jour où ce produit aurait de vrais volumes, il faudrait des embeddings et
// un index vectoriel (pgvector sur Postgres, par exemple).
import prisma from "@/lib/prisma";
import { createSignedDocumentUrls } from "@/lib/storage";
import { compareFacesServerSide } from "@/lib/face-match";

// ----------------------------------------------------------------------------
// LE PLAFOND DE CANDIDATS
// ----------------------------------------------------------------------------
// ⚠️ CE CHIFFRE EST CONTRAINT PAR LE BUDGET D'EXÉCUTION, PAS PAR LE MÉTIER.
// Chaque comparaison est un appel Gemini d'environ 20 secondes. Le pipeline
// complet dispose de 60 secondes sur Vercel, dont ~40 sont déjà consommées par
// l'OCR, le screening AML, la comparaison faciale et le liveness.
//
// 💡 Les 3 comparaisons tournent EN PARALLÈLE entre elles ET avec le reste du
// pipeline : le temps de mur n'augmente donc pas. Ce qui augmente, c'est le
// nombre d'appels simultanés à Gemini — d'où le plafond bas, qui protège aussi
// du quota de requêtes par minute du palier gratuit.
const MAX_CANDIDATES = 3;

// Fenêtre de recherche. Un réseau de fraude actif soumet plusieurs dossiers sur
// une période courte ; au-delà, la probabilité de correspondance légitime
// (jumeaux, membres d'une même famille) devient relativement plus élevée que
// celle d'une fraude.
//
// ⚠️ C'est un compromis assumé, pas une vérité : une identité réutilisée après
// 90 jours passera inaperçue. Voir la limite structurelle en tête de fichier.
const LOOKBACK_DAYS = 90;

export type DuplicateMatch = {
    requestId: string;
    customerName: string;
    cin: string;
    submittedAt: Date;
    // Le verdict brut renvoyé par le moteur de comparaison.
    verdict: string;
    reason: string;
};

export type DuplicateCheckResult = {
    // "clean" : comparé, rien trouvé.
    // "duplicate" : au moins une correspondance.
    // "unavailable" : la comparaison n'a pas pu être faite.
    // "no-candidates" : il n'y a aucun dossier antérieur à comparer.
    status: "clean" | "duplicate" | "unavailable" | "no-candidates";
    matches: DuplicateMatch[];
    // Combien de dossiers ont RÉELLEMENT été comparés. Cette information doit
    // remonter dans le rationale : "aucune correspondance sur 3 dossiers" et
    // "aucune correspondance sur 400 dossiers" ne disent pas du tout la même
    // chose, et l'agent doit pouvoir faire la différence.
    comparedCount: number;
};

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================
// ⚠️ `newSelfieUrl` DOIT ÊTRE UNE URL DÉJÀ SIGNÉE. On la reçoit en paramètre
// plutôt que de la re-signer ici : l'appelant l'a déjà obtenue pour la
// comparaison faciale, et signer deux fois la même image serait un aller-retour
// Supabase gratuit.
export async function findDuplicateFaces(
    companyId: string,
    newSelfieUrl: string | null
): Promise<DuplicateCheckResult> {
    // 🔒 Sans image du nouveau visage, il n'y a rien à comparer. On renvoie
    // "unavailable" et non "clean" : ne pas avoir cherché n'est pas la même
    // chose que n'avoir rien trouvé. C'est le même fail-closed que sur l'AML,
    // l'OCR et la biométrie.
    if (!newSelfieUrl) {
        return { status: "unavailable", matches: [], comparedCount: 0 };
    }

    try {
        const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

        // --------------------------------------------------------------------
        // SÉLECTION DES CANDIDATS
        // --------------------------------------------------------------------
        // ⚠️ LE FILTRE `companyId` N'EST PAS UNE OPTIMISATION, C'EST UNE
        // OBLIGATION DE CONFIDENTIALITÉ. Comparer les visages ENTRE entreprises
        // clientes révélerait à la banque A qu'un de ses clients est également
        // client de la banque B. TrustVerify héberge les données de plusieurs
        // clients concurrents ; les faire communiquer, même indirectement par un
        // signal de risque, serait une fuite.
        //
        // 💡 Contrepartie assumée : un fraudeur qui répartit ses fausses
        // identités sur plusieurs banques ne sera pas détecté. C'est précisément
        // ce que résolvent les consortiums de partage inter-établissements — un
        // dispositif contractuel et réglementaire, pas technique.
        //
        // 💡 `livenessReferencePath ?? selfiePath` : les dossiers créés avant le
        // liveness n'ont qu'un selfie uploadé. Ils restent comparables — moins
        // fiables (l'image pouvait venir de n'importe où), mais les exclure
        // reviendrait à rendre invisible tout l'historique.
        const candidates = await prisma.verificationRequest.findMany({
            where: {
                companyId,
                submittedAt: { gte: since },
                // Un dossier sans aucune image de visage n'est pas comparable.
                OR: [
                    { livenessReferencePath: { not: null } },
                    { selfiePath: { not: null } },
                ],
            },
            orderBy: { submittedAt: "desc" },
            take: MAX_CANDIDATES,
            select: {
                id: true,
                customerName: true,
                cin: true,
                submittedAt: true,
                livenessReferencePath: true,
                selfiePath: true,
            },
        });

        if (candidates.length === 0) {
            // 💡 DISTINCT DE "clean". Le tout premier dossier d'une entreprise
            // n'a rien à comparer — ce n'est ni un succès ni un échec du
            // contrôle, c'est une absence d'historique. Le confondre avec
            // "vérifié, rien trouvé" donnerait une fausse assurance sur les
            // premiers dossiers, ceux-là mêmes qui construisent la base.
            return { status: "no-candidates", matches: [], comparedCount: 0 };
        }

        // Chemin retenu pour chaque candidat, avec l'image de liveness en
        // priorité : elle a été capturée en direct, elle est donc une preuve
        // plus solide qu'un fichier téléversé.
        const candidatePaths = candidates.map(
            (c) => c.livenessReferencePath ?? c.selfiePath!
        );

        // Une seule signature groupée pour tous les candidats.
        const signedUrls = await createSignedDocumentUrls(candidatePaths, 120);

        // --------------------------------------------------------------------
        // LES COMPARAISONS, EN PARALLÈLE
        // --------------------------------------------------------------------
        // 💡 `Promise.all` : chaque comparaison prend ~20 secondes. Enchaînées,
        // trois candidats coûteraient 60 secondes — soit la totalité du budget
        // d'exécution à elles seules. En parallèle, le coût en temps est celui
        // d'UNE comparaison.
        //
        // 🔒 `compareFacesServerSide` ne lève jamais : elle rattrape ses propres
        // erreurs et renvoie un verdict "unavailable". Ce `Promise.all` ne peut
        // donc pas échouer en bloc.
        const comparisons = await Promise.all(
            candidates.map(async (candidate, index) => {
                const candidateUrl = signedUrls[candidatePaths[index]];
                if (!candidateUrl) return null;

                const result = await compareFacesServerSide(newSelfieUrl, candidateUrl);
                return { candidate, result };
            })
        );

        // --------------------------------------------------------------------
        // INTERPRÉTATION DES VERDICTS
        // --------------------------------------------------------------------
        // ⚠️ SEUL "same_person" EST RETENU COMME DOUBLON. C'est délibérément
        // strict, et c'est l'inverse du réglage utilisé pour la comparaison
        // document/visage.
        //
        // 💡 POURQUOI CETTE ASYMÉTRIE : quand on compare un visage à SON PROPRE
        // document, le doute doit pencher contre le demandeur — c'est à lui de
        // prouver son identité. Ici, on ACCUSE quelqu'un d'avoir ouvert un
        // compte sous une fausse identité. Un "likely_same_person" sur deux
        // frères qui se ressemblent produirait une accusation grave et fausse.
        //
        // 💡 On préfère donc RATER des doublons plutôt qu'en inventer. Un
        // faux négatif laisse passer un dossier qui sera peut-être détecté
        // autrement ; un faux positif fait suspecter de fraude un client
        // honnête, avec les conséquences qu'on imagine sur la relation
        // commerciale.
        const matches: DuplicateMatch[] = [];
        let comparedCount = 0;
        let anyUnavailable = false;

        for (const comparison of comparisons) {
            if (!comparison) {
                anyUnavailable = true;
                continue;
            }

            const { candidate, result } = comparison;

            if (result.verdict === "unavailable") {
                anyUnavailable = true;
                continue;
            }

            comparedCount++;

            if (result.verdict === "same_person") {
                matches.push({
                    requestId: candidate.id,
                    customerName: candidate.customerName,
                    cin: candidate.cin,
                    submittedAt: candidate.submittedAt,
                    verdict: result.verdict,
                    reason: result.reason,
                });
            }
        }

        // Journal de diagnostic — développement uniquement.
        // ⚠️ Il contient des noms de clients : jamais en production.
        if (process.env.NODE_ENV !== "production") {
            console.log("\n──────── DUPLICATE FACE DIAGNOSTIC ────────");
            console.log("Candidats examinés :", candidates.length);
            console.log("Comparaisons abouties :", comparedCount);
            console.log("Correspondances :", matches.length);
            matches.forEach((m) => console.log("  →", m.customerName, "|", m.cin));
            console.log("───────────────────────────────────────────\n");
        }

        if (matches.length > 0) {
            return { status: "duplicate", matches, comparedCount };
        }

        // 🔒 SI AUCUNE COMPARAISON N'A ABOUTI, ON NE DIT PAS "PROPRE". Trois
        // comparaisons toutes indisponibles ne prouvent rien — les traiter
        // comme un succès serait exactement le fail-open qu'on a corrigé
        // partout ailleurs dans ce projet.
        if (comparedCount === 0 && anyUnavailable) {
            return { status: "unavailable", matches: [], comparedCount: 0 };
        }

        return { status: "clean", matches: [], comparedCount };
    } catch (error) {
        console.error("[DUPLICATE-FACE] Vérification impossible :", error);
        return { status: "unavailable", matches: [], comparedCount: 0 };
    }
}