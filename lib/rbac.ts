// ============================================================================
// 🛡️ RBAC (ROLE-BASED ACCESS CONTROL) — GARDE COMMUNE À TOUTES LES ROUTES API
// ============================================================================
// Pourquoi ce fichier existe : dans une architecture multi-tenant B2B, DEUX
// vérifications sont nécessaires sur presque chaque route API :
//   1. L'appelant a-t-il une session valide (authentification) ?
//   2. Son rôle lui permet-il d'effectuer CETTE action précise (autorisation) ?
// Plutôt que de dupliquer cette logique dans les 28 routes du projet, chaque route
// commence par : `const guard = enforceRole(session, ["COMPANY_ADMIN"])`
// puis `if (!guard.isValid) return guard.response` — un seul point de vérité,
// donc un seul endroit à corriger si la logique de sécurité doit évoluer.
import { NextResponse } from "next/server";

// Les deux seuls rôles qui existent dans TrustVerify. ADMIN = gère l'équipe,
// la facturation, les clés API. AGENT = traite les dossiers KYC au quotidien.
export type UserRole = "COMPANY_ADMIN" | "COMPANY_AGENT";

// Ce que la fonction renvoie à l'appelant (la route API) :
// - isValid=false  → la route doit s'arrêter et renvoyer `response` tel quel.
// - isValid=true   → la route peut continuer, et DOIT utiliser companyId/userId
//                    renvoyés ici (jamais des valeurs prises dans le body de la
//                    requête, qui seraient falsifiables par le client).
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
 *
 * @param session       La session NextAuth de la requête en cours (peut être null).
 * @param allowedRoles  Liste des rôles autorisés à effectuer l'action demandée.
 */
export function enforceRole(session: any, allowedRoles: UserRole[]): RbacValidation {
    // 1. Authentification : pas de session, pas d'id, ou pas de companyId rattaché
    //    → l'utilisateur n'est tout simplement pas identifiable. 401 Unauthorized.
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

    // 2. Autorisation : la session est valide, mais le rôle de cet utilisateur
    //    ne fait pas partie de ceux autorisés pour cette route précise.
    //    Ex: un AGENT qui tente d'appeler une route réservée aux ADMIN.
    if (!allowedRoles.includes(role)) {
        console.warn(`🔒 [SECURITY ALERT] User ${session.user.email} (Role: ${role}) attempted unauthorized access.`);
        return {
            isValid: false,
            response: NextResponse.json(
                { error: "Forbidden. Your role hierarchy does not possess the required clearance level." },
                { status: 403 } // 403 (Forbidden) et non 401 : l'identité est connue, seul le droit manque.
            )
        };
    }

    // 3. Accès accordé : on renvoie companyId/userId/role dérivés de LA SESSION
    //    SERVEUR (jamais du body envoyé par le client). C'est ce qui garantit le
    //    cloisonnement multi-tenant : une route ne peut jamais agir "pour" une
    //    autre entreprise, même si un client malveillant falsifie sa requête.
    return {
        isValid: true,
        companyId,
        userId,
        role
    };
}