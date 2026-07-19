// ============================================================================
// 📝 INSCRIPTION — ÉTAPE 1/2 : VALIDATION + ENVOI DU CODE OTP
// ============================================================================
// Cette route NE CRÉE AUCUN COMPTE. Elle valide juste que l'email et le nom
// d'entreprise sont disponibles, puis envoie un code à 6 chiffres par email.
// La création réelle du Workspace + de l'administrateur se fait dans
// app/api/auth/verify-register (étape 2/2), une fois ce code confirmé.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { sendVerificationOtpEmail } from "@/lib/mail";

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

        const { email, companyName } = validationResult.data;

        // 2. Sécurité : Extraction du domaine de l'email (ex: @stripe.com)
        const emailDomain = email.split("@")[1];
        const forbiddenDomains = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "protonmail.com"];
        const isPublicDomain = forbiddenDomains.includes(emailDomain);

        // OPTIONNEL : Décommenter ces lignes en production stricte pour forcer les emails pros
        // if (isPublicDomain) {
        //     return NextResponse.json({ error: "Veuillez utiliser une adresse email professionnelle." }, { status: 400 });
        // }

        // 3. Antécédents : Vérification de l'existence de l'utilisateur
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return NextResponse.json({ error: "Cette adresse email est déjà enregistrée." }, { status: 400 });
        }

        // 4. VERROU ENTREPRISE CRITIQUE : Empêcher la duplication de Tenant
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
                error: `L'organisation "${companyName}" est déjà enregistrée sur la plateforme. Si vous êtes un employé de cette structure, demandez une invitation à votre administrateur.` 
            }, { status: 409 }); 
        }

        // ====================================================================
        // 🛡️ NOUVEAU FLUX PHASE 6 : GÉNÉRATION ET ENVOI DE L'OTP
        // ====================================================================

        // 5. Génération cryptographique légère d'un code à 6 chiffres
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        // 6. Définition de l'expiration (10 minutes)
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        // 7. Sauvegarde dans la base de données
        // On utilise "upsert" pour écraser l'ancien code si l'utilisateur a cliqué sur "Renvoyer le code"
        await prisma.otpCode.upsert({
            where: { email },
            update: { code: otpCode, expiresAt, createdAt: new Date() },
            create: { email, code: otpCode, expiresAt }
        });

        // 8. Envoi du code par e-mail
        try {
            await sendVerificationOtpEmail(email, otpCode);
        } catch (mailError) {
            console.error("Failed to send OTP email:", mailError);
            return NextResponse.json({ error: "Le service d'email est temporairement indisponible. Veuillez réessayer." }, { status: 500 });
        }

        // 9. On retourne un statut spécifique pour dire au Frontend d'afficher la case OTP
        return NextResponse.json({ 
            message: "Un code de vérification à 6 chiffres a été envoyé à votre adresse email.",
            status: "OTP_SENT" 
        }, { status: 200 });

    } catch (error) {
        console.error("🔒 [CRITICAL] Register OTP Generation Failure:", error);
        return NextResponse.json({ error: "Une erreur interne est survenue lors de la vérification initiale." }, { status: 500 });
    }
}