// ============================================================================
// 🆕 [PHASE C — LIVENESS, ÉTAPE 2/5] ÉMISSION D'UN CHALLENGE
// ============================================================================
// Le formulaire appelle cette route juste avant de démarrer la capture. Elle
// tire DEUX actions distinctes au hasard et renvoie un jeton signé qui les
// contient.
//
// ⚠️ POURQUOI CE TIRAGE NE PEUT PAS SE FAIRE DANS LE NAVIGATEUR : si le client
// choisissait lui-même ses épreuves, il suffirait de modifier le code de la page
// pour obtenir toujours la combinaison qu'on sait imiter — ou pour n'en demander
// aucune. C'est exactement le raisonnement qui nous a fait déplacer la
// comparaison faciale côté serveur : un contrôle dont on choisit soi-même les
// termes n'est pas un contrôle.
//
// 💡 Route volontairement minuscule. Toute la logique vit dans
// lib/liveness-challenge.ts, qui sera aussi appelé par /api/customers au moment
// de vérifier. Un module partagé plutôt que deux implémentations à garder
// synchronisées.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";
import { enforceRateLimit, getClientIp, livenessChallengeLimiter } from "@/lib/ratelimit";
import { issueLivenessChallenge } from "@/lib/liveness-challenge";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        // Même garde que pour l'obtention d'une URL d'upload : seuls les agents
        // et administrateurs d'une entreprise peuvent démarrer une vérification.
        const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
        if (!guard.isValid) return guard.response!;

        // Limite par IP. La route est peu coûteuse, mais sans plafond un script
        // pourrait réclamer des milliers de challenges jusqu'à tomber sur la
        // combinaison qu'il sait contrefaire.
        const clientIp = getClientIp(req);
        const limited = await enforceRateLimit(livenessChallengeLimiter, clientIp);
        if (limited) return limited;

        const challenge = issueLivenessChallenge();

        // 💡 On renvoie les instructions en clair : le navigateur doit les
        // afficher au client. Le jeton n'est PAS un secret à cacher — il est
        // seulement infalsifiable. Chercher à dissimuler les actions serait vain
        // de toute façon, puisqu'elles s'affichent à l'écran.
        //
        // ⚠️ On ne renvoie QUE les instructions, pas les clés d'action ni les
        // `expectedChange`. Ces derniers ne servent qu'à la vérification serveur
        // — les transmettre au navigateur donnerait à un fraudeur la description
        // exacte de ce que le modèle de vision cherchera.
        return NextResponse.json({
            steps: challenge.steps.map((step) => ({ instruction: step.instruction })),
            token: challenge.token,
            expiresAt: challenge.expiresAt,
        });
    } catch (error) {
        // Cas le plus probable : NEXTAUTH_SECRET absente (voir le fail-closed
        // dans lib/liveness-challenge.ts).
        console.error("🔒 [LIVENESS] Émission du challenge impossible :", error);
        return NextResponse.json(
            { error: "Liveness challenge could not be issued." },
            { status: 500 }
        );
    }
}