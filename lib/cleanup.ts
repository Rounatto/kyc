// ============================================================================
// 🆕 [PHASE B] 🧹 PURGE DES ARTEFACTS D'AUTHENTIFICATION EXPIRÉS
// ============================================================================
// Pourquoi ce fichier existe : deux tables accumulent des lignes que plus rien
// ne supprime jamais.
//
//   • OtpCode            — une inscription abandonnée (l'utilisateur demande un
//                          code puis ferme l'onglet) laisse sa ligne en base
//                          indéfiniment. L'@unique sur l'email plafonne à une
//                          ligne par adresse, mais rien ne les efface.
//   • PasswordResetToken — le commentaire du schéma le signalait déjà : on
//                          marque `usedAt` au lieu de supprimer, donc les
//                          lignes s'empilent par construction.
//
// ⚠️ CE N'EST PAS UN PROBLÈME DE SÉCURITÉ, ET C'EST IMPORTANT DE LE DIRE : ces
// lignes sont inertes. Un OTP périmé est refusé par verify-register avant même
// d'être comparé, un jeton consommé est refusé par reset-password. Le seul
// enjeu est la dette : une table qui ne fait que grossir finit par peser sur
// les index, sur les sauvegardes, et sur le quota de la base gratuite.
//
// 💡 POURQUOI UN MODULE SÉPARÉ PLUTÔT QU'UN BLOC DANS LA ROUTE CRON : la route
// cron est déjà longue et fait une chose (compiler et envoyer des rapports).
// Isoler la purge permet de l'appeler ailleurs plus tard — un script manuel,
// un second cron le jour où le volume l'exigera — sans copier-coller, et rend
// la logique de rétention lisible d'un coup d'œil au lieu d'être noyée au
// milieu de comptages de dossiers KYC.
import prisma from "@/lib/prisma";

// ----------------------------------------------------------------------------
// DURÉE DE RÉTENTION DES JETONS DE RÉINITIALISATION
// ----------------------------------------------------------------------------
// ⚠️ POURQUOI ON NE SUPPRIME PAS UN JETON DÈS QU'IL EST CONSOMMÉ. Le champ
// `usedAt` n'existe pas par commodité : c'est un CAPTEUR. Il permet de
// distinguer « ce lien a déjà servi » (quelqu'un rejoue un email — signal
// suspect, boîte mail potentiellement compromise) de « ce jeton n'existe pas »
// (une URL tronquée, un copier-coller raté — sans intérêt).
//
// Purger la ligne à la consommation ferait disparaître cette distinction : les
// deux cas retomberaient sur le même message générique et le rejeu deviendrait
// invisible. On garde donc une fenêtre pendant laquelle la détection reste
// possible.
//
// 💡 POURQUOI 7 JOURS : un email volé est exploité dans les heures ou les jours
// qui suivent, pas des mois après. Au-delà d'une semaine, la ligne ne détecte
// plus rien d'utile — elle ne fait que peser. Et cette durée s'aligne sur la
// cadence du cron (hebdomadaire), ce qui évite un décalage entre la rétention
// annoncée et celle réellement appliquée.
const RESET_TOKEN_RETENTION_DAYS = 7;

// Ce que la purge a effectivement supprimé. Renvoyé à l'appelant plutôt que
// simplement journalisé : la route cron le fait remonter dans sa réponse JSON,
// donc dans les logs Vercel — c'est ce qui permet de vérifier d'un coup d'œil
// que le nettoyage tourne vraiment, au lieu de le supposer.
export interface CleanupResult {
    otpCodes: number;
    passwordResetTokens: number;
}

export async function purgeExpiredAuthArtifacts(): Promise<CleanupResult> {
    const now = new Date();
    const retentionCutoff = new Date(
        now.getTime() - RESET_TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    // `Promise.all` : les deux suppressions portent sur des tables sans aucun
    // lien entre elles, rien n'impose de les enchaîner. Une seule aller-retour
    // réseau au lieu de deux, ce qui compte sur une base distante.
    const [otpResult, tokenResult] = await Promise.all([
        // --------------------------------------------------------------------
        // OTP — SUPPRESSION DÈS L'EXPIRATION, SANS DÉLAI DE GRÂCE
        // --------------------------------------------------------------------
        // Contrairement aux jetons ci-dessous, il n'y a rien à détecter ici :
        // ce modèle n'a pas de champ `usedAt`. Un code correct est supprimé
        // dans la transaction de création du workspace, un code épuisé est
        // détruit par le compteur `attempts`. Une ligne encore présente après
        // `expiresAt` est donc forcément un abandon — elle ne peut plus produire
        // qu'un refus, la conserver n'apprend rien à personne.
        prisma.otpCode.deleteMany({
            where: { expiresAt: { lt: now } },
        }),

        // --------------------------------------------------------------------
        // JETONS DE RÉINITIALISATION — DEUX CAS, DEUX CRITÈRES DE DATE
        // --------------------------------------------------------------------
        // ⚠️ Le piège serait d'écrire un seul filtre `expiresAt < cutoff`. Il
        // emporterait aussi les jetons CONSOMMÉS il y a cinq minutes : leur
        // `expiresAt` (30 minutes de durée de vie) est de toute façon dépassé
        // depuis longtemps dans la plupart des cas. On perdrait exactement la
        // détection de rejeu qu'on cherche à préserver.
        //
        // D'où deux branches, chacune datée sur le champ qui a du sens pour
        // elle :
        //   • jeton JAMAIS utilisé → on compte depuis son expiration
        //   • jeton CONSOMMÉ       → on compte depuis sa consommation
        //
        // 💡 `usedAt: { lt: ... }` ne remonte PAS les lignes où `usedAt` est
        // null : en SQL, une comparaison avec NULL n'est jamais vraie. Les deux
        // branches sont donc bien disjointes, aucun jeton non consommé ne peut
        // être attrapé par la seconde.
        prisma.passwordResetToken.deleteMany({
            where: {
                OR: [
                    { usedAt: null, expiresAt: { lt: retentionCutoff } },
                    { usedAt: { lt: retentionCutoff } },
                ],
            },
        }),
    ]);

    return {
        otpCodes: otpResult.count,
        passwordResetTokens: tokenResult.count,
    };
}