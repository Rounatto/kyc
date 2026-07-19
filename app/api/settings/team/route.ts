// ============================================================================
// 🧑‍🤝‍🧑 GESTION D'ÉQUIPE — INVITER / LISTER / RÉVOQUER DES AGENTS
// ============================================================================
// Réservé aux COMPANY_ADMIN. POST ne crée PAS un compte utilisable immédiatement :
// il crée un User SANS mot de passe (`password` reste null) + un token
// d'invitation à usage unique + envoie un email avec un lien. C'est
// app/api/auth/setup (voir Lot 2) qui complète l'activation quand l'agent
// invité clique sur ce lien et choisit son mot de passe.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";
import { logSecurityEvent } from "@/lib/logger";
import { sendAgentInvitationEmail } from "@/lib/mail";
import crypto from "crypto";

// L'admin ne fournit que nom + email : le mot de passe sera choisi par
// l'agent lui-même via le lien d'invitation, jamais par l'admin.
const agentSchema = z.object({
    fullName: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email format"),
});

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const guard = enforceRole(session, ["COMPANY_ADMIN"]);
        if (!guard.isValid) return guard.response!;

        const teamMembers = await prisma.user.findMany({
            where: { companyId: guard.companyId! },
            select: { id: true, fullName: true, email: true, role: true, createdAt: true, totpEnabled: true, invitationToken: true },
            orderBy: { createdAt: 'asc' }
        });

        return NextResponse.json({ members: teamMembers });
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
        const body = await req.json();
        const validation = agentSchema.safeParse(body);
        
        if (!validation.success) return NextResponse.json({ error: validation.error.issues[0].message }, { status: 400 });

        const { fullName, email } = validation.data;

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });

        // 💡 GÉNÉRATION DU TOKEN SÉCURISÉ (32 octets = 64 caractères hex)
        const invitationToken = crypto.randomBytes(32).toString("hex");
        const invitationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // Expire dans 24h

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
        const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
        const setupLink = `${baseUrl}/setup-account?token=${invitationToken}`;

        try {
            await sendAgentInvitationEmail(email, fullName, setupLink);
        } catch (emailError) {
            console.error("Failed to send invitation email:", emailError);
        }

        return NextResponse.json({ message: "Agent invited successfully", member: newAgent }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to create team member." }, { status: 500 });
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