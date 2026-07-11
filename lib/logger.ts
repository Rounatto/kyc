import prisma from "@/lib/prisma";

/**
 * 🛡️ Moteur Central du Registre d'Audit (Phase 4)
 * Écrit une ligne immuable dans la base de données.
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
        // En cas d'erreur de log, on ne crashe pas l'application entière, mais on alerte la console serveur
        console.error("🚨 [AUDIT TRAIL CRITICAL ERROR] Failed to write log:", error);
    }
}