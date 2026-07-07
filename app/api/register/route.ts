import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod"; // 💡 LE BOUCLIER

// =====================================================================
// 🛡️ SCHÉMA DE SÉCURITÉ ZOD
// =====================================================================
const registerSchema = z.object({
    email: z.string().email("Format d'email invalide"),
    password: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères"),
    fullName: z.string().min(2, "Le nom doit faire au moins 2 caractères"),
    companyName: z.string().min(2, "Le nom de l'entreprise est requis"),
});

export async function POST(req: Request) {
    try {
        const body = await req.json();

        // 1. Validation Zod de la requête entrante
        const validationResult = registerSchema.safeParse(body);
        if (!validationResult.success) {
            const errorMessages = validationResult.error.issues.map((err) => err.message).join(", ");
            return NextResponse.json({ error: errorMessages }, { status: 400 });
        }

        const { email, password, fullName, companyName } = validationResult.data;

        // 2. Vérification de l'existence de l'utilisateur
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return NextResponse.json({ error: "Cet email est déjà utilisé par un autre compte." }, { status: 400 });
        }

        // 3. Hashage cryptographique du mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);

        // =====================================================================
        // 🏢 TRANSACTION B2B : CRÉATION DE L'ENTREPRISE ET DU SUPER-ADMIN
        // =====================================================================
        const result = await prisma.$transaction(async (tx) => {
            
            // Étape A : Créer l'entité Entreprise
            const newCompany = await (tx as any).company.create({
                data: {
                    name: companyName,
                    plan: "trial", // Le nouveau compte commence en période d'essai
                }
            });

            // Étape B : Créer l'utilisateur et l'attacher à l'entreprise
            const newUser = await tx.user.create({
                data: {
                    email: email,
                    password: hashedPassword,
                    fullName: fullName,
                    companyName: companyName, // Maintenu temporairement pour la rétrocompatibilité
                    companyId: newCompany.id, // 🔗 LE VRAI LIEN MULTI-TENANT
                    role: "COMPANY_ADMIN"     // 👑 Le créateur hérite des droits d'administration
                }
            });

            return { user: newUser, company: newCompany };
        });

        console.log(`✅ Nouvelle entreprise B2B créée : ${result.company.name} (Admin: ${result.user.email})`);
        return NextResponse.json({ message: "Compte entreprise et administrateur créés avec succès." }, { status: 201 });

    } catch (error) {
        console.error("Register API Error:", error);
        return NextResponse.json({ error: "Erreur interne du serveur lors de la création du compte." }, { status: 500 });
    }
}