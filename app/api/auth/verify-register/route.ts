// ============================================================================
// ✅ INSCRIPTION — ÉTAPE 2/2 : VÉRIFICATION OTP + CRÉATION DU WORKSPACE
// ============================================================================
// Fonctionne en tandem avec app/api/register (étape 1) : register génère un
// code à 6 chiffres et l'envoie par email, SANS créer aucun compte. Ce n'est
// qu'ICI, une fois le bon code fourni, que l'entreprise (Company) et son
// administrateur (User, role=COMPANY_ADMIN) sont réellement créés. Cette
// séparation empêche de créer des comptes avec des emails qu'on ne possède pas.
//
// ✅ [PHASE B — RÉSOLU] Le brute-force de l'OTP est désormais bloqué par deux
// limites complémentaires (voir lib/ratelimit.ts) : une par adresse IP et une
// par email. Avant ce correctif, rien ne comptait les tentatives : un script
// pouvait parcourir les 1 000 000 de combinaisons pendant les 10 minutes de
// validité du code.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
// 🆕 [PHASE B] Limitation du nombre de requêtes (Upstash Redis).
import {
    enforceRateLimit,
    getClientIp,
    otpVerifyByIpLimiter,
    otpVerifyByEmailLimiter,
} from "@/lib/ratelimit";

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
        // ====================================================================
        // 🆕 [PHASE B] BARRAGE 1/2 — LIMITE PAR ADRESSE IP
        // ====================================================================
        // Placé en TOUT PREMIER, avant même de lire le corps de la requête :
        // une requête bloquée ne doit consommer aucune ressource inutile (ni
        // parsing JSON, ni la moindre requête base de données).
        //
        // Cette limite arrête le cas le plus courant : un script qui martèle la
        // route depuis une seule machine.
        const clientIp = getClientIp(req);
        const ipLimited = await enforceRateLimit(otpVerifyByIpLimiter, clientIp);
        if (ipLimited) return ipLimited;

        const body = await req.json();

        // 1. Validation du payload
        const validationResult = verifyRegisterSchema.safeParse(body);
        if (!validationResult.success) {
            const errorMessages = validationResult.error.issues.map((err) => err.message).join(", ");
            return NextResponse.json({ error: errorMessages }, { status: 400 });
        }

        const { email, password, fullName, companyName, otpCode } = validationResult.data;

        // ====================================================================
        // 🆕 [PHASE B] BARRAGE 2/2 — LIMITE PAR EMAIL
        // ====================================================================
        // Ne peut se faire qu'ICI : il fallait d'abord lire et valider le corps
        // de la requête pour connaître l'email visé.
        //
        // Pourquoi cette seconde limite alors qu'on filtre déjà par IP : un
        // attaquant disposant de nombreuses adresses IP (proxies, botnet) peut
        // rester sous le seuil sur CHAQUE IP tout en accumulant des milliers de
        // tentatives sur UN MÊME compte. La limite par IP ne verrait rien
        // passer ; celle-ci bloque l'attaque quelle que soit son origine.
        //
        // 💡 On utilise `email` (déjà normalisé en minuscules et détrimé par
        // Zod juste au-dessus) et non la valeur brute : sans ça, "A@Mail.com"
        // et "a@mail.com" compteraient dans deux compteurs distincts, ce qui
        // doublerait le quota réel d'un attaquant.
        const emailLimited = await enforceRateLimit(otpVerifyByEmailLimiter, email);
        if (emailLimited) return emailLimited;

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