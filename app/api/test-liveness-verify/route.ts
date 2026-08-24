// ============================================================================
// 🧪 ROUTE DE TEST — À SUPPRIMER APRÈS VALIDATION DE L'ÉTAPE 4
// ============================================================================
// Elle n'existe que pour valider lib/liveness-verify.ts sans toucher au
// formulaire ni au moteur de règles. Une fois l'étape 5 branchée, la
// vérification se fera dans /api/customers et ce fichier n'aura plus d'objet.
//
// ⚠️ Elle reste protégée par enforceRole malgré son caractère temporaire : une
// route de test qui contourne l'authentification est exactement le genre de
// chose qu'on oublie de supprimer avant un déploiement.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";
import { verifyLivenessSequence } from "@/lib/liveness-verify";

export const maxDuration = 60;

const schema = z.object({
    token: z.string().min(1),
    paths: z.object({
        reference: z.string().min(1),
        action1: z.string().min(1),
        action2: z.string().min(1),
    }),
});

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
    if (!guard.isValid) return guard.response!;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Même contrôle d'appartenance que dans /api/customers : les chemins viennent
    // du client, on vérifie qu'ils sont bien dans le périmètre de l'entreprise.
    const prefix = `${guard.companyId}/`;
    const { reference, action1, action2 } = parsed.data.paths;
    if (![reference, action1, action2].every((p) => p.startsWith(prefix))) {
        return NextResponse.json({ error: "Paths outside your workspace." }, { status: 403 });
    }

    const result = await verifyLivenessSequence(parsed.data.token, parsed.data.paths);
    return NextResponse.json(result);
}