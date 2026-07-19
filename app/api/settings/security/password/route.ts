// ============================================================================
// 🔑 CHANGEMENT DE MOT DE PASSE (depuis les Settings, utilisateur déjà connecté)
// ============================================================================
// Note : `getServerSession()` est appelé ici SANS lui passer `authOptions`,
// contrairement à la plupart des autres routes de settings/security (qui font
// `getServerSession(authOptions)`). Ça fonctionne car NextAuth peut retrouver
// la config automatiquement dans l'App Router, mais c'est une incohérence de
// style à uniformiser si on refactore ce module plus tard.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
    try {
        const session = await getServerSession();
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        const { currentPassword, newPassword } = await JSON.parse(await req.text());

        if (!currentPassword || !newPassword) {
            return NextResponse.json({ error: "All fields are required" }, { status: 400 });
        }

        // 💡 LA VÉRIFICATION STRICTE (Identique à la page Register)
        const correctLength = newPassword.length >= 12;
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);

        if (!correctLength || !hasSpecialChar) {
            return NextResponse.json({ 
                error: "The new password must be at least 12 characters long and contain at least 1 special symbol." 
            }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email }
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Compte créé via Google OAuth : `password` est null (jamais défini).
        // Ce garde-fou évite un crash de bcrypt.compare() sur une valeur null
        // et renvoie un message clair plutôt qu'une 500 opaque.
        if (!user.password) {
            return NextResponse.json({ error: "No password is set for this user" }, { status: 400 });
        }

        const isPasswordMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordMatch) {
            return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { email: session.user.email },
            data: { password: hashedNewPassword }
        });

        return NextResponse.json({ message: "Password updated successfully" });

    } catch (error: any) {
        console.error("Password API Error:", error);
        return NextResponse.json({ error: "Internal failure during password update" }, { status: 500 });
    }
}