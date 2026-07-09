import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

// Schéma Zod strict pour la production
const registerSchema = z.object({
    email: z.string().email("Format d'email invalide").toLowerCase().trim(),
    password: z.string().min(12, "Le mot de passe doit faire au moins 12 caractères"),
    fullName: z.string().min(2, "Le nom doit faire au moins 2 caractères").trim(),
    companyName: z.string().min(2, "Le nom de l'entreprise doit faire au moins 2 caractères").trim(),
});

export async function POST(req: Request) {
    try {
        const body = await req.json();

        // 1. Validation Zod du payload
        const validationResult = registerSchema.safeParse(body);
        if (!validationResult.success) {
            const errorMessages = validationResult.error.issues.map((err) => err.message).join(", ");
            return NextResponse.json({ error: errorMessages }, { status: 400 });
        }

        const { email, password, fullName, companyName } = validationResult.data;

        // 2. Sécurité : Extraction du domaine de l'email (ex: @stripe.com)
        const emailDomain = email.split("@")[1];
        const forbiddenDomains = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "protonmail.com"];
        const isPublicDomain = forbiddenDomains.includes(emailDomain);

        // 3. Antécédents : Vérification de l'existence de l'utilisateur
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return NextResponse.json({ error: "Cette adresse email est déjà enregistrée." }, { status: 400 });
        }

        // 4. VERROU ENTREPRISE CRITIQUE : Empêcher la duplication de Tenant
        // On cherche si une entreprise possède déjà exactement ce nom (insensible à la casse)
        const existingCompany = await prisma.company.findFirst({
            where: {
                name: {
                    equals: companyName,
                    mode: "insensitive"
                }
            }
        });

        if (existingCompany) {
            return NextResponse.json({ 
                error: `L'organisation "${companyName}" est déjà enregistrée sur TrustVerify. Si vous êtes un employé de cette structure, veuillez demander à votre administrateur de vous envoyer une invitation.` 
            }, { status: 409 }); // Code HTTP 409 Conflict
        }

        // 5. Hachage sécurisé du mot de passe
        const hashedPassword = await bcrypt.hash(password, 12); // Facteur 12 pour le standard bancaire

        // 6. Transaction atomique B2B
        const result = await prisma.$transaction(async (tx) => {
            // Création de l'entité Entreprise unique
            const newCompany = await (tx as any).company.create({
                data: {
                    name: companyName,
                    plan: "trial"
                }
            });

            // Création de l'utilisateur rattaché de manière hermétique
            const newUser = await tx.user.create({
                data: {
                    email: email,
                    password: hashedPassword,
                    fullName: fullName,
                    companyName: companyName, 
                    companyId: newCompany.id, // Liaison physique
                    role: "COMPANY_ADMIN"     // Le premier créateur est toujours l'administrateur racine
                }
            });

            return { user: newUser, company: newCompany };
        });

        return NextResponse.json({ 
            message: "Espace de travail B2B et compte administrateur initialisés.",
            companyId: result.company.id 
        }, { status: 201 });

    } catch (error) {
        console.error("🔒 [CRITICAL] Register API Failure:", error);
        return NextResponse.json({ error: "Une erreur interne est survenue lors de la configuration de votre espace." }, { status: 500 });
    }
}