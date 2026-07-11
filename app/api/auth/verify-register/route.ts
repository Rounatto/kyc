import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

// Schéma Zod qui inclut maintenant l'OTP
const verifyRegisterSchema = z.object({
    email: z.string().email("Format d'email invalide").toLowerCase().trim(),
    password: z.string().min(12, "Le mot de passe doit faire au moins 12 caractères"),
    fullName: z.string().min(2, "Le nom doit faire au moins 2 caractères").trim(),
    companyName: z.string().min(2, "Le nom de l'entreprise doit faire au moins 2 caractères").trim(),
    otpCode: z.string().length(6, "Le code de vérification doit contenir exactement 6 chiffres"),
});

export async function POST(req: Request) {
    try {
        const body = await req.json();

        // 1. Validation du payload
        const validationResult = verifyRegisterSchema.safeParse(body);
        if (!validationResult.success) {
            const errorMessages = validationResult.error.issues.map((err) => err.message).join(", ");
            return NextResponse.json({ error: errorMessages }, { status: 400 });
        }

        const { email, password, fullName, companyName, otpCode } = validationResult.data;

        // ====================================================================
        // 🛡️ ÉTAPE CRITIQUE : VÉRIFICATION DE L'OTP
        // ====================================================================
        const otpRecord = await prisma.otpCode.findUnique({
            where: { email }
        });

        if (!otpRecord) {
            return NextResponse.json({ error: "Aucun code de vérification n'a été demandé pour cet email ou le code a expiré." }, { status: 400 });
        }

        if (otpRecord.code !== otpCode) {
            return NextResponse.json({ error: "Code de vérification incorrect. Veuillez réessayer." }, { status: 400 });
        }

        if (new Date() > otpRecord.expiresAt) {
            // Nettoyage du code expiré
            await prisma.otpCode.delete({ where: { email } });
            return NextResponse.json({ error: "Ce code de vérification a expiré. Veuillez demander un nouveau code." }, { status: 400 });
        }

        // ====================================================================
        // 🏗️ CRÉATION SÉCURISÉE (Le code est bon !)
        // ====================================================================

        // Double vérification par sécurité (au cas où il y aurait eu des clics multiples)
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) return NextResponse.json({ error: "Compte déjà existant." }, { status: 409 });

        // Hachage sécurisé du mot de passe
        const hashedPassword = await bcrypt.hash(password, 12); 

        // Transaction atomique B2B (Création Entreprise + Création Admin)
        const result = await prisma.$transaction(async (tx) => {
            // Création de l'entreprise
            const newCompany = await (tx as any).company.create({
                data: {
                    name: companyName,
                    plan: "trial"
                }
            });

            // Création de l'utilisateur Admin
            const newUser = await tx.user.create({
                data: {
                    email: email,
                    password: hashedPassword,
                    fullName: fullName,
                    companyName: companyName, 
                    companyId: newCompany.id,
                    role: "COMPANY_ADMIN"
                }
            });

            // 📜 AUDIT TRAIL : Tracabilité de la création du Workspace
            await (tx as any).auditLog.create({
                data: {
                    action: "WORKSPACE_CREATED",
                    details: `New company workspace created. Administrator identity verified via Email OTP.`,
                    companyId: newCompany.id,
                    agentId: newUser.id
                }
            });

            // 🧹 NETTOYAGE : Suppression du code OTP utilisé (à usage unique !)
            await tx.otpCode.delete({ where: { email } });

            return { user: newUser, company: newCompany };
        });

        return NextResponse.json({ 
            message: "Identité vérifiée. Espace de travail B2B et compte administrateur configurés avec succès.",
            companyId: result.company.id 
        }, { status: 201 });

    } catch (error) {
        console.error("🔒 [CRITICAL] Verify-Register API Failure:", error);
        return NextResponse.json({ error: "Une erreur interne est survenue lors de la création de votre espace." }, { status: 500 });
    }
}