import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac"; 
import { logSecurityEvent } from "@/lib/logger"; 

// Validation stricte des données pour la création d'un Agent
const agentSchema = z.object({
    fullName: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email format"),
    password: z.string().min(12, "Password must be at least 12 characters"),
});

// ============================================================================
// 📥 GET : LISTER LES MEMBRES DE L'ÉQUIPE
// ============================================================================
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        
        // 🛡️ VERROU RBAC : Réservé strictement à l'Administrateur
        const guard = enforceRole(session, ["COMPANY_ADMIN"]);
        if (!guard.isValid) return guard.response!;

        const { companyId } = guard;

        // Récupération sécurisée (on exclut les mots de passe)
        const teamMembers = await prisma.user.findMany({
            where: { companyId: companyId! },
            select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
                createdAt: true,
                totpEnabled: true,
                avatarUrl: true
            },
            orderBy: { createdAt: 'asc' }
        });

        return NextResponse.json({ members: teamMembers });
    } catch (error: any) {
        console.error("Team GET Error:", error);
        return NextResponse.json({ error: "Failed to fetch team members." }, { status: 500 });
    }
}

// ============================================================================
// 📤 POST : INVITER / CRÉER UN NOUVEL AGENT
// ============================================================================
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        
        // 🛡️ VERROU RBAC
        const guard = enforceRole(session, ["COMPANY_ADMIN"]);
        if (!guard.isValid) return guard.response!;

        const { companyId, userId: adminId } = guard;

        const body = await req.json();
        const validation = agentSchema.safeParse(body);
        
        if (!validation.success) {
            return NextResponse.json({ error: validation.error.errors[0].message }, { status: 400 });
        }

        const { fullName, email, password } = validation.data;

        // Vérifier si l'email existe déjà dans tout le SaaS
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
        }

        // Hachage du mot de passe
        const hashedPassword = await bcrypt.hash(password, 12);

        // Création de l'Agent confiné dans la même entreprise que l'Admin
        const newAgent = await prisma.user.create({
            data: {
                fullName,
                email,
                password: hashedPassword,
                role: "COMPANY_AGENT", // 💡 Rôle assigné de force
                companyId: companyId!
            },
            select: { id: true, fullName: true, email: true, role: true, createdAt: true, totpEnabled: true }
        });

        // 📜 AUDIT TRAIL : Tracabilité de la création
        await logSecurityEvent({
            action: "AGENT_CREATED",
            details: `Administrator created a new agent account for ${email}.`,
            companyId: companyId!,
            agentId: adminId!
        });

        return NextResponse.json({ message: "Agent created successfully", member: newAgent }, { status: 201 });
    } catch (error: any) {
        console.error("Team POST Error:", error);
        return NextResponse.json({ error: "Failed to create team member." }, { status: 500 });
    }
}

// ============================================================================
// 🗑️ DELETE : RÉVOQUER UN AGENT
// ============================================================================
export async function DELETE(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        
        // 🛡️ VERROU RBAC
        const guard = enforceRole(session, ["COMPANY_ADMIN"]);
        if (!guard.isValid) return guard.response!;

        const { companyId, userId: adminId } = guard;
        const body = await req.json();
        const targetUserId = body.userId;

        if (!targetUserId) {
            return NextResponse.json({ error: "User ID is required." }, { status: 400 });
        }

        if (targetUserId === adminId) {
            return NextResponse.json({ error: "You cannot delete your own administrator account." }, { status: 403 });
        }

        // Sécurité : On s'assure que l'agent ciblé appartient bien à cette entreprise
        const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
        if (!targetUser || targetUser.companyId !== companyId) {
            return NextResponse.json({ error: "User not found or unauthorized." }, { status: 404 });
        }

        // Suppression (Les dossiers KYC de cet agent passeront à userId: null grâce au onDelete: SetNull)
        await prisma.user.delete({ where: { id: targetUserId } });

        // 📜 AUDIT TRAIL : Tracabilité de la révocation
        await logSecurityEvent({
            action: "AGENT_REVOKED",
            details: `Administrator permanently revoked access for agent ${targetUser.email}.`,
            companyId: companyId!,
            agentId: adminId!
        });

        return NextResponse.json({ message: "Agent access revoked successfully." });
    } catch (error: any) {
        console.error("Team DELETE Error:", error);
        return NextResponse.json({ error: "Failed to delete team member." }, { status: 500 });
    }
}