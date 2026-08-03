// ============================================================================
// 🆕 [PHASE B] 📱 DÉSACTIVATION DE LA 2FA
// ============================================================================
// LE MANQUE QUE ÇA COMBLE : il n'existait AUCUN moyen de désactiver la 2FA
// depuis l'interface. Un utilisateur qui l'activait était engagé pour toujours,
// et la seule issue passait par une modification manuelle en base de données.
// Un produit qui active une protection sans permettre de la retirer est un
// piège, pas une fonctionnalité.
//
// ⚠️ C'EST UNE OPÉRATION DE DÉGRADATION DE SÉCURITÉ. Elle est donc traitée avec
// plus de précautions qu'une activation : re-authentification obligatoire,
// limitation du débit, trace d'audit ET notification visible pour l'utilisateur.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { logSecurityEvent } from "@/lib/logger";
import { enforceRateLimit, twoFactorManageLimiter } from "@/lib/ratelimit";

const disableSchema = z.object({
    password: z.string().min(1, "Password is required"),
});

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const rateLimited = await enforceRateLimit(twoFactorManageLimiter, session.user.email);
        if (rateLimited) return rateLimited;

        const body = await req.json();
        const validation = disableSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error.issues[0].message }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        if (!user.totpEnabled) {
            return NextResponse.json(
                { error: "Two-factor authentication is already disabled." },
                { status: 400 }
            );
        }

        // ====================================================================
        // 🔒 RE-AUTHENTIFICATION OBLIGATOIRE
        // ====================================================================
        // Le scénario bloqué est direct : quelqu'un trouve un poste non
        // verrouillé, désactive la 2FA en un clic, et le compte n'est plus
        // protégé que par un mot de passe qu'il pourra tenter de deviner à
        // loisir. Exiger le mot de passe ferme cette porte.
        //
        // ⚠️ Même limite que pour la régénération : un compte Google-only n'a
        // pas de mot de passe et ne peut donc pas passer par ici.
        if (!user.password) {
            return NextResponse.json({
                error: "Your account uses Google Sign-In. Set a password first via \"Forgot password?\" to manage two-factor authentication."
            }, { status: 400 });
        }

        const isPasswordValid = await bcrypt.compare(validation.data.password, user.password);
        if (!isPasswordValid) {
            if (user.companyId) {
                await logSecurityEvent({
                    action: "LOGIN_FAILED",
                    details: "2FA disable attempt failed: incorrect password.",
                    companyId: user.companyId,
                    agentId: user.id,
                });
            }
            return NextResponse.json({ error: "Incorrect password." }, { status: 400 });
        }

        // ====================================================================
        // DÉSACTIVATION — ON EFFACE TOUT
        // ====================================================================
        // ⚠️ Les trois champs partent ENSEMBLE. Laisser `backupCodes` derrière
        // serait une faille sournoise : ces codes resteraient valides en base,
        // et si l'utilisateur réactivait un jour sa 2FA, ses anciens codes —
        // peut-être compromis, c'est souvent la raison d'une désactivation —
        // continueraient de fonctionner.
        await prisma.user.update({
            where: { id: user.id },
            data: {
                totpEnabled: false,
                totpSecret: null,
                backupCodes: null,
            },
        });

        if (user.companyId) {
            // 📜 AUDIT TRAIL
            await logSecurityEvent({
                action: "2FA_DISABLED",
                details: "User disabled two-factor authentication on their account.",
                companyId: user.companyId,
                agentId: user.id,
            });

            // 🔔 NOTIFICATION VISIBLE — et elle compte autant que l'audit log.
            //
            // Une trace d'audit n'est consultée qu'après coup, quand on cherche
            // déjà quelque chose. Une notification, elle, ALERTE : si ce n'est
            // pas l'utilisateur qui vient de désactiver sa 2FA, il le découvre
            // à sa prochaine connexion et peut réagir immédiatement.
            try {
                await prisma.notification.create({
                    data: {
                        type: "HIGH_RISK_ALERT",
                        title: "Two-factor authentication disabled",
                        message: "2FA was turned off on your account. If you did not do this, change your password immediately and re-enable 2FA.",
                        companyId: user.companyId,
                        // Ciblée sur l'utilisateur : c'est une information
                        // personnelle, ses collègues n'ont pas à la voir.
                        userId: user.id,
                    },
                });
            } catch (notifError) {
                // Non bloquant : la désactivation a déjà eu lieu.
                console.error("[2FA] Échec de création de la notification :", notifError);
            }
        }

        return NextResponse.json({
            message: "Two-factor authentication has been disabled.",
        });

    } catch (error) {
        console.error("[2FA-DISABLE] error:", error);
        return NextResponse.json({ error: "Failed to disable two-factor authentication." }, { status: 500 });
    }
}