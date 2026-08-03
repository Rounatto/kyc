// ============================================================================
// 🧑‍🤝‍🧑 GESTION D'ÉQUIPE — INVITER / LISTER / RENVOYER / RÉVOQUER DES AGENTS
// ============================================================================
// Réservé aux COMPANY_ADMIN. POST ne crée PAS un compte utilisable immédiatement :
// il crée un User SANS mot de passe (`password` reste null) + un token
// d'invitation à usage unique + envoie un email avec un lien. C'est
// app/api/auth/setup qui complète l'activation quand l'agent invité clique sur
// ce lien et choisit son mot de passe.
//
// 🆕 PATCH ajouté : renvoyer une invitation. Sans lui, un agent qui perdait son
// email ou dont le lien expirait (24 h) était dans une impasse — l'admin devait
// SUPPRIMER le compte et tout recommencer, ce qui effaçait au passage la trace
// de la première invitation.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";
import { logSecurityEvent } from "@/lib/logger";
import { sendAgentInvitationEmail } from "@/lib/mail";
import crypto from "crypto";
// 🆕 Limitation des envois d'emails d'invitation.
import { enforceRateLimit, teamInviteLimiter } from "@/lib/ratelimit";

// Durée de validité d'un lien d'invitation. Centralisée ici parce qu'elle est
// désormais utilisée à deux endroits (création ET renvoi) — une valeur en dur
// dupliquée finit toujours par diverger.
const INVITATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures

// L'admin ne fournit que nom + email : le mot de passe sera choisi par
// l'agent lui-même via le lien d'invitation, jamais par l'admin.
const agentSchema = z.object({
    fullName: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email format"),
});

// 🆕 Le renvoi ne prend que l'identifiant de l'agent concerné.
const resendSchema = z.object({
    userId: z.string().min(1, "User ID is required"),
});

// 🆕 Fabrique un token d'invitation et sa date d'expiration.
// Extrait en fonction parce que POST et PATCH ont besoin exactement du même
// couple : deux implémentations séparées finiraient par diverger (l'une avec
// 32 octets, l'autre avec 16, ou des durées différentes).
function createInvitation() {
    return {
        // 32 octets = 64 caractères hexadécimaux, soit 256 bits d'entropie :
        // indevinable, même avec des ressources illimitées.
        invitationToken: crypto.randomBytes(32).toString("hex"),
        invitationExpires: new Date(Date.now() + INVITATION_TTL_MS),
    };
}

// 🆕 Construit le lien d'activation. Centralisé pour la même raison.
//
// ⚠️ `NEXTAUTH_URL` DOIT être défini sur Vercel avec l'URL de production. Si
// cette variable manque, le repli `localhost:3000` produit un lien qui ne mène
// nulle part depuis la boîte mail du destinataire — un bug très déroutant,
// puisque l'email part correctement et que le bouton semble simplement inerte.
function buildSetupLink(token: string): string {
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    return `${baseUrl}/setup-account?token=${token}`;
}

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const guard = enforceRole(session, ["COMPANY_ADMIN"]);
        if (!guard.isValid) return guard.response!;

        const teamMembers = await prisma.user.findMany({
            where: { companyId: guard.companyId! },
            // 🆕 `invitationToken` RETIRÉ de la sélection.
            //
            // ⚠️ POURQUOI C'ÉTAIT UN PROBLÈME : ce token vaut un mot de passe
            // temporaire — quiconque le possède peut activer le compte de
            // l'agent et se connecter à sa place. Il était renvoyé EN CLAIR par
            // l'API, donc visible dans les outils réseau du navigateur, dans
            // les logs de tout proxy traversé, et dans le cache. C'est
            // exactement le risque contre lequel on hache les tokens de
            // réinitialisation de mot de passe.
            //
            // 💡 On récupère quand même `password` et `invitationExpires` : pas
            // pour les renvoyer au client, mais pour CALCULER l'état de
            // l'invitation juste en dessous.
            select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
                createdAt: true,
                totpEnabled: true,
                password: true,
                invitationExpires: true,
            },
            orderBy: { createdAt: 'asc' }
        });

        // 🆕 TRANSFORMATION AVANT ENVOI AU CLIENT.
        //
        // Le frontend avait besoin de savoir si un agent a activé son compte ou
        // non — c'est vraisemblablement pour ça que le token était exposé. On
        // lui donne désormais l'INFORMATION sans le SECRET : trois booléens
        // calculés côté serveur, et le token ne quitte jamais la base.
        //
        // 💡 Comment on déduit l'état : un agent qui n'a jamais activé son
        // compte n'a pas de mot de passe (`password` reste null jusqu'à ce
        // qu'il passe par /setup-account). C'est le marqueur le plus fiable,
        // plus que la présence d'un token — lequel peut avoir été consommé ou
        // simplement expiré.
        const members = teamMembers.map((m) => {
            const isPending = m.password === null;
            const isExpired =
                isPending &&
                (!m.invitationExpires || new Date() > m.invitationExpires);

            return {
                id: m.id,
                fullName: m.fullName,
                email: m.email,
                role: m.role,
                createdAt: m.createdAt,
                totpEnabled: m.totpEnabled,
                // L'agent n'a pas encore choisi son mot de passe.
                invitationPending: isPending,
                // Son lien a dépassé les 24 h : l'admin doit le renvoyer.
                invitationExpired: isExpired,
            };
        });

        return NextResponse.json({ members });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch team members." }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const guard = enforceRole(session, ["COMPANY_ADMIN"]);
        if (!guard.isValid) return guard.response!;

        const { companyId, userId: adminId } = guard;

        // 🆕 LIMITATION DES ENVOIS.
        // Cette route déclenche un email réel à chaque appel. Sans garde-fou,
        // elle pouvait servir à harceler une adresse ou à épuiser le quota
        // d'envoi Gmail du projet.
        //
        // 💡 Limité PAR ADMINISTRATEUR : la route est authentifiée, on sait
        // exactement qui appelle. Une limite par IP pénaliserait tous les
        // admins d'une même entreprise derrière la même connexion.
        const rateLimited = await enforceRateLimit(teamInviteLimiter, adminId!);
        if (rateLimited) return rateLimited;

        const body = await req.json();
        const validation = agentSchema.safeParse(body);
        
        if (!validation.success) return NextResponse.json({ error: validation.error.issues[0].message }, { status: 400 });

        const { fullName, email } = validation.data;

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });

        // 💡 GÉNÉRATION DU TOKEN SÉCURISÉ (32 octets = 64 caractères hex)
        const { invitationToken, invitationExpires } = createInvitation();

        // 💡 Création de l'Agent SANS mot de passe
        const newAgent = await prisma.user.create({
            data: {
                fullName,
                email,
                role: "COMPANY_AGENT", 
                companyId: companyId!,
                invitationToken,
                invitationExpires
            },
            select: { id: true, fullName: true, email: true, role: true, createdAt: true, totpEnabled: true }
        });

        await logSecurityEvent({
            action: "AGENT_CREATED",
            details: `Administrator sent a secure setup link to provision an agent account for ${email}.`,
            companyId: companyId!,
            agentId: adminId!
        });

        // 💡 Envoi de l'email avec le lien
        const setupLink = buildSetupLink(invitationToken);

        try {
            await sendAgentInvitationEmail(email, fullName, setupLink);
        } catch (emailError) {
            // ⚠️ Échec NON bloquant, et c'est délibéré : le compte agent est
            // déjà créé en base. Faire échouer la requête laisserait l'admin
            // croire que rien ne s'est passé, alors qu'un agent existe bel et
            // bien — et une seconde tentative buterait sur "email already
            // exists". Le bouton "Renvoyer l'invitation" (PATCH) est la
            // porte de sortie prévue pour ce cas.
            console.error("Failed to send invitation email:", emailError);
        }

        // 🆕 On renvoie l'agent avec les mêmes booléens que le GET, pour que le
        // frontend puisse l'insérer directement dans sa liste sans recharger.
        return NextResponse.json({
            message: "Agent invited successfully",
            member: { ...newAgent, invitationPending: true, invitationExpired: false },
        }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to create team member." }, { status: 500 });
    }
}

// ============================================================================
// 🆕 RENVOI D'UNE INVITATION
// ============================================================================
// LE PROBLÈME RÉSOLU : le lien d'invitation expire au bout de 24 h. Passé ce
// délai — ou si l'agent a simplement perdu l'email, ou l'a vu atterrir en spam —
// il n'existait AUCUN moyen de lui en renvoyer un. L'admin devait supprimer le
// compte et le recréer, ce qui effaçait la trace de la première invitation dans
// la piste d'audit et changeait l'identifiant de l'agent.
//
// 🔒 Un token NEUF est généré à chaque renvoi, l'ancien devient donc caduc.
// C'est plus sûr que de prolonger l'existant : si le premier email a été
// intercepté ou transféré par erreur, le lien qu'il contient cesse de
// fonctionner dès le renvoi.
// ============================================================================
export async function PATCH(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const guard = enforceRole(session, ["COMPANY_ADMIN"]);
        if (!guard.isValid) return guard.response!;

        const { companyId, userId: adminId } = guard;

        // Même limiteur que POST : les deux envoient un email, ils partagent
        // donc le même quota. Un admin ne peut pas contourner la limite en
        // alternant création et renvoi.
        const rateLimited = await enforceRateLimit(teamInviteLimiter, adminId!);
        if (rateLimited) return rateLimited;

        const body = await req.json();
        const validation = resendSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error.issues[0].message }, { status: 400 });
        }

        const targetUser = await prisma.user.findUnique({
            where: { id: validation.data.userId },
        });

        // 🔒 ISOLATION MULTI-TENANT : on vérifie que l'agent appartient bien à
        // l'entreprise de l'admin. Sans ce contrôle, un admin de l'entreprise A
        // pourrait déclencher l'envoi d'un lien d'activation vers un agent de
        // l'entreprise B — et recevoir un 200 lui confirmant que cet
        // identifiant existe.
        //
        // 💡 Même message d'erreur dans les deux cas (inexistant / autre
        // entreprise) : distinguer les deux permettrait de tester des
        // identifiants pour cartographier les comptes des autres clients.
        if (!targetUser || targetUser.companyId !== companyId) {
            return NextResponse.json({ error: "User not found." }, { status: 404 });
        }

        // 🔒 On refuse de renvoyer une invitation à un compte DÉJÀ ACTIVÉ.
        //
        // Ce n'est pas un détail : sans cette vérification, un admin pourrait
        // générer un lien d'activation valide pour un agent en activité — donc
        // un moyen de définir un nouveau mot de passe sur son compte, et d'y
        // accéder à sa place. Un administrateur a beaucoup de pouvoir, mais
        // usurper l'identité d'un collègue n'en fait pas partie : c'est ce qui
        // rendrait la piste d'audit non fiable ("qui a validé ce dossier ?").
        if (targetUser.password !== null) {
            return NextResponse.json(
                { error: "This agent has already activated their account." },
                { status: 400 }
            );
        }

        const { invitationToken, invitationExpires } = createInvitation();

        await prisma.user.update({
            where: { id: targetUser.id },
            data: { invitationToken, invitationExpires },
        });

        await logSecurityEvent({
            action: "AGENT_INVITE_RESENT",
            details: `Administrator re-sent the account setup link to ${targetUser.email}.`,
            companyId: companyId!,
            agentId: adminId!,
        });

        const setupLink = buildSetupLink(invitationToken);

        try {
            await sendAgentInvitationEmail(targetUser.email, targetUser.fullName, setupLink);
        } catch (emailError) {
            // ⚠️ Ici, contrairement au POST, l'échec EST bloquant. La différence
            // est logique : dans POST, un compte a été créé, il y a donc un
            // résultat tangible à annoncer. Ici, le seul but de l'appel était
            // d'envoyer un email — si l'envoi échoue, l'opération n'a servi à
            // rien et l'admin doit le savoir, plutôt que d'attendre un email
            // qui n'arrivera jamais.
            console.error("Failed to resend invitation email:", emailError);
            return NextResponse.json(
                { error: "The invitation could not be sent. Please try again." },
                { status: 500 }
            );
        }

        return NextResponse.json({ message: "Invitation re-sent successfully." });
    } catch (error) {
        return NextResponse.json({ error: "Failed to resend invitation." }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const guard = enforceRole(session, ["COMPANY_ADMIN"]);
        if (!guard.isValid) return guard.response!;

        const body = await req.json();
        const targetUserId = body.userId;

        if (targetUserId === guard.userId) return NextResponse.json({ error: "Cannot delete your own account." }, { status: 403 });

        const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
        if (!targetUser || targetUser.companyId !== guard.companyId) return NextResponse.json({ error: "User not found." }, { status: 404 });

        // 💡 Note de conformité : supprimer un agent n'efface PAS son travail.
        // Les dossiers KYC et les lignes d'audit qu'il a produits utilisent
        // `onDelete: SetNull` (voir schema.prisma) : ils survivent avec un
        // `userId`/`agentId` vide. C'est une exigence réglementaire — une
        // décision de conformité doit rester consultable même après le départ
        // de celui qui l'a prise.
        await prisma.user.delete({ where: { id: targetUserId } });

        await logSecurityEvent({
            action: "AGENT_REVOKED",
            details: `Administrator permanently revoked access for agent ${targetUser.email}.`,
            companyId: guard.companyId!,
            agentId: guard.userId!
        });

        return NextResponse.json({ message: "Agent access revoked successfully." });
    } catch (error) {
        return NextResponse.json({ error: "Failed to delete team member." }, { status: 500 });
    }
}