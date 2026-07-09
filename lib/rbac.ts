import { NextResponse } from "next/server";

// 💡 Définition stricte des rôles disponibles dans l'architecture TrustVerify
export type UserRole = "COMPANY_ADMIN" | "COMPANY_AGENT";

interface RbacValidation {
    isValid: boolean;
    response?: NextResponse;
    companyId?: string;
    userId?: string;
    role?: UserRole;
}

/**
 * 🛡️ Guardien de Sécurité RBAC
 * Vérifie l'identité de l'appelant et valide ses privilèges d'accès.
 */
export function enforceRole(session: any, allowedRoles: UserRole[]): RbacValidation {
    // 1. Vérification de la présence d'une session active (Phase 0)
    if (!session?.user || !session.user.id || !(session.user as any).companyId) {
        return {
            isValid: false,
            response: NextResponse.json(
                { error: "Access denied. Valid B2B session protocol missing." },
                { status: 401 }
            )
        };
    }

    const role = (session.user as any).role as UserRole;
    const companyId = (session.user as any).companyId;
    const userId = session.user.id;

    // 2. Vérification de la matrice des privilèges (Phase 3)
    if (!allowedRoles.includes(role)) {
        console.warn(`🔒 [SECURITY ALERT] User ${session.user.email} (Role: ${role}) attempted unauthorized access.`);
        return {
            isValid: false,
            response: NextResponse.json(
                { error: "Forbidden. Your role hierarchy does not possess the required clearance level." },
                { status: 403 } // Code HTTP 403 strict pour violation de privilèges
            )
        };
    }

    // 3. Clearance accordée : On renvoie les identifiants pour le cloisonnement B2B
    return {
        isValid: true,
        companyId,
        userId,
        role
    };
}