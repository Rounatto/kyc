import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Récupération des clients et calcul dynamique des statistiques
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const search = searchParams.get("search") || "";
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "5");
        const status = searchParams.get("status") || "all";
        const risk = searchParams.get("risk") || "all";
        const sort = searchParams.get("sort") || "newest";
        const skip = (page - 1) * limit;

        const whereCondition: any = {};
        
        if (search) {
            whereCondition.OR = [
                { customerName: { contains: search, mode: "insensitive" as const } },
                { email: { contains: search, mode: "insensitive" as const } },
                { cin: { contains: search } },
                { phoneNumber: { contains: search } }
            ]
        }
        
        if (status !== "all") {
            whereCondition.status = status;
        }
        
        if (risk === "high") whereCondition.riskLevel = "High";
        else if (risk === "medium") whereCondition.riskLevel = "Medium";
        else if (risk === "low") whereCondition.riskLevel = "Low";

        let orderByCondition: any = { submittedAt: 'desc' };
        if (sort === "oldest") orderByCondition = { submittedAt: 'asc' };
        if (sort === "highest_score") orderByCondition = { score: 'desc' };
        if (sort === "lowest_score") orderByCondition = { score: 'asc' };

        const [requests, filteredTotal] = await Promise.all([
            prisma.verificationRequest.findMany({
                where: whereCondition,
                take: limit,
                skip: skip,
                orderBy: orderByCondition
            }),
            prisma.verificationRequest.count({ where: whereCondition })
        ]);

        const pendingCount = await prisma.verificationRequest.count({
            where: { status: "pending" }
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const verifiedTodayCount = await prisma.verificationRequest.count({
            where: {
                status: "verified",
                updatedAt: { gte: today }
            }
        });

        const totalAbsolute = await prisma.verificationRequest.count(); 
        
        const highRiskCount = await prisma.verificationRequest.count({
            where: { riskLevel: "High" }
        });

        return NextResponse.json({
            requests,
            total: filteredTotal,
            page,
            limit,
            stats: {
                totalCustomers: totalAbsolute,
                verifiedToday: verifiedTodayCount,
                pendingReviews: pendingCount,
                highRisk: highRiskCount 
            }
        });

    } catch (error: any) {
        console.error("GET Error:", error);
        return NextResponse.json({ error: "Failed to fetch data." }, { status: 500 });
    }
}

// Création sécurisée d'un dossier KYC avec analyse IA, UploadThing et Audit Log
// =====================================================================
// POST : CRÉER UN NOUVEAU CLIENT (AVEC PADDING DE SCORE POUR LE TRI)
// =====================================================================
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { customerName, email, type, cin, documentType, nationality, dateOfBirth, phoneNumber, userId, idCardUrl, selfieUrl } = body;

        // Protection Clé Étrangère
        if (!userId) {
            return NextResponse.json({ error: "Authentication missing. Please log in." }, { status: 401 });
        }
        const agent = await prisma.user.findUnique({ where: { id: userId } });
        if (!agent) {
            return NextResponse.json({ error: "Agent session invalid. Please log out and log back in." }, { status: 401 });
        }

        // Calcul du score IA (Simulé)
        const minScore = 45;
        const maxScore = 98;
        const simulatedAiScore = Math.floor(Math.random() * (maxScore - minScore + 1)) + minScore;

        // 💡 SOLUTION PRO : padStart force une longueur de 3 caractères (ex: 45 devient "045"). 
        // Cela permet à la BDD de trier parfaitement par ordre numérique même si c'est un String !
        const formattedScore = simulatedAiScore.toString().padStart(3, '0');

        let riskLevel = "Medium";
        if (simulatedAiScore >= 80) riskLevel = "Low";
        else if (simulatedAiScore <= 50) riskLevel = "High";

        const newRequest = await prisma.verificationRequest.create({
            data: {
                customerName,
                email,
                type,
                cin,
                documentType,
                nationality,
                dateOfBirth,
                phoneNumber,
                userId,
                idCardUrl,
                selfieUrl,
                status: "pending", 
                score: formattedScore, // On enregistre le score standardisé pour le tri
                riskLevel: riskLevel
            },
        });

        return NextResponse.json(newRequest, { status: 201 });
    } catch (error: any) {
        console.error("POST Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}