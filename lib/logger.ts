// ============================================================================
// 📜 AUDIT TRAIL — ENREGISTREMENT DES ÉVÉNEMENTS DE COMPLIANCE
// ============================================================================
// Pourquoi ce fichier existe : en KYC/compliance, il faut pouvoir prouver QUI a
// fait QUOI, QUAND, sur QUEL dossier — c'est une exigence légale, pas juste un
// "nice to have". Ce module centralise l'écriture dans la table `AuditLog` pour
// que chaque route qui modifie un dossier client (validation, rejet, changement
// de rôle, etc.) écrive une trace de la même façon, sans dupliquer la logique.
//
// ⚠️ Nom trompeur : ce fichier ne gère QUE le journal d'audit métier (compliance),
// pas les logs applicatifs généraux (erreurs, debug) — ceux-ci utilisent encore
// `console.log`/`console.error` un peu partout dans le projet. Un vrai logger
// structuré (ex: pino) avec redaction des données personnelles reste à faire.
import prisma from "@/lib/prisma";

/**
 * 🛡️ Moteur Central du Registre d'Audit
 * Écrit une ligne immuable dans la base de données.
 *
 * @param action     Type d'événement, ex: "CREATED", "VERIFIED", "REJECTED".
 * @param details    Description humaine de ce qui s'est passé (affichée dans l'UI d'audit).
 * @param companyId  Entreprise concernée — TOUJOURS dérivé de la session serveur
 *                   (via enforceRole), jamais du body, pour garantir l'isolation B2B.
 * @param agentId    Utilisateur qui a déclenché l'action (optionnel, ex: action système).
 * @param requestId  Dossier KYC concerné, si l'événement est lié à un dossier précis.
 */
export async function logSecurityEvent(params: {
    action: string;
    details: string;
    companyId: string;
    agentId?: string;
    requestId?: string;
}) {
    try {
        await prisma.auditLog.create({
            data: {
                action: params.action,
                details: params.details,
                companyId: params.companyId,
                agentId: params.agentId,
                requestId: params.requestId,
            }
        });
    } catch (error) {
        // Choix délibéré : si l'écriture du log échoue (ex: DB temporairement
        // indisponible), on NE VEUT PAS faire échouer l'action métier principale
        // (ex: la validation d'un dossier KYC) à cause d'un souci de journalisation.
        // On avale l'erreur ici et on se contente d'alerter la console serveur.
        console.error("🚨 [AUDIT TRAIL CRITICAL ERROR] Failed to write log:", error);
    }
}