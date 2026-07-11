import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { logSecurityEvent } from "@/lib/logger";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { token, password } = body;

        if (!token || !password || password.length < 12) {
            return NextResponse.json({ error: "Invalid request or password too weak." }, { status: 400 });
        }

        // 1. Chercher l'utilisateur via le token cryptographique
        const user = await prisma.user.findUnique({ where: { invitationToken: token } });

        // 2. Vérifier si le token est valide et non expiré
        if (!user || !user.invitationExpires || new Date() > user.invitationExpires) {
            return NextResponse.json({ error: "This secure link is invalid or has expired. Please ask your administrator for a new one." }, { status: 400 });
        }

        // 3. Hasher le mot de passe de l'Agent
        const hashedPassword = await bcrypt.hash(password, 12);

        // 4. Mettre à jour l'utilisateur et DÉTRUIRE le token
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                invitationToken: null,
                invitationExpires: null
            }
        });

        // 5. Piste d'audit
        if (user.companyId) {
            await logSecurityEvent({
                action: "AGENT_ONBOARDED",
                details: `Agent ${user.email} successfully activated their account and set their password.`,
                companyId: user.companyId,
                agentId: user.id
            });
        }

        return NextResponse.json({ message: "Account setup successfully." });
    } catch (error) {
        console.error("Setup Error:", error);
        return NextResponse.json({ error: "Internal server error." }, { status: 500 });
    }
}