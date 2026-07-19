// ============================================================================
// 💻 GESTION DES SESSIONS ACTIVES (onglet "Appareils connectés" des Settings)
// ============================================================================
// ⚠️ À ne pas confondre avec la session NextAuth (JWT) qui authentifie chaque
// requête : `UserSession` est un modèle Prisma à part, purement informatif/
// UX, qui liste les appareils vus pour cet utilisateur. GET fait doublement
// office de "lecture" ET d'"enregistrement" (upsert implicite par détection) :
// à chaque appel, si le user-agent courant n'est pas encore connu, on l'ajoute.
// DELETE ne fait qu'un soft-delete (`isActive: false`) — la ligne reste en
// base pour l'historique, elle disparaît juste de la liste affichée.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";

// Détecte un type d'appareil lisible à partir du user-agent brut du navigateur.
function detectDevice(userAgent: string): string {
    if (userAgent.includes("Windows")) return "Windows PC";
    if (userAgent.includes("iPhone")) return "iOS iPhone";
    if (userAgent.includes("iPad")) return "iOS iPad";
    if (userAgent.includes("Macintosh")) return "MacBook / macOS";
    if (userAgent.includes("Android")) {
        if (userAgent.includes("Samsung") || userAgent.includes("SM-")) return "Android (Samsung)";
        return "Android Device";
    }
    if (userAgent.includes("Linux")) return "Linux Machine";
    return "Unknown Device";
}

export async function GET(req: Request) {
    try {
        const session = await getServerSession();
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({ where: { email: session.user.email } });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // 💡 CORRECTION : On capture les vraies informations de ton navigateur ici !
        const userAgent = req.headers.get("user-agent") || "Unknown Browser";
        const deviceType = detectDevice(userAgent); // ON UTILISE ENFIN LE DETECTEUR !
        const ipAddress = req.headers.get("x-forwarded-for") || "127.0.0.1";

        // On vérifie si cet appareil est déjà enregistré
        const existingSession = await prisma.userSession.findFirst({
            where: { 
                userId: user.id, 
                userAgent: userAgent, 
                isActive: true 
            }
        });

        // S'il n'existe pas, on l'ajoute automatiquement à la base de données
        if (!existingSession) {
            await prisma.userSession.create({
                data: {
                    userId: user.id,
                    userAgent: userAgent,
                    deviceType: deviceType,
                    ipAddress: ipAddress,
                    isActive: true
                }
            });
        }

        // Enfin, on récupère toute la liste pour l'afficher sur l'écran
        const dbSessions = await prisma.userSession.findMany({
            where: {
                user: { email: session.user.email },
                isActive: true
            },
            orderBy: { lastActiveAt: "desc" }
        });

        return NextResponse.json({ sessions: dbSessions });
    } catch (error) {
        return NextResponse.json({ error: "Failed to retrieve sessions" }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const session = await getServerSession();
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { sessionId } = await JSON.parse(await req.text());
        if (!sessionId) {
            return NextResponse.json({ error: "Missing session ID" }, { status: 400 });
        }

        // 🚨 FAILLE IDOR (nouvelle, non documentée dans la roadmap) : aucune
        // vérification que `sessionId` appartient bien à `session.user` avant
        // la mise à jour. N'IMPORTE QUEL utilisateur connecté (n'importe quelle
        // entreprise) peut désactiver la session de N'IMPORTE QUEL AUTRE
        // utilisateur en devinant/énumérant un id de UserSession. Il manque un
        // filtre `where: { id: sessionId, userId: user.id }`.
        await prisma.userSession.update({
            where: { id: sessionId },
            data: { isActive: false }
        });

        return NextResponse.json({ message: "Session successfully revoked" });
    } catch (error) {
        return NextResponse.json({ error: "Failed to revoke session" }, { status: 500 });
    }
}