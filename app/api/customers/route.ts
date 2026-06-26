import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// =====================================================================
// 1. GET : RÉCUPÉRER LA LISTE DES CLIENTS ET CALCULER LES STATISTIQUES
// =====================================================================
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const search = searchParams.get("search") || "";
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "5");
        const skip = (page - 1) * limit;

        const whereCondition = search ? {
            OR: [
                { customerName: { contains: search, mode: "insensitive" as const } },
                { email: { contains: search, mode: "insensitive" as const } },
                { cin: { contains: search } },
                { phoneNumber: { contains: search } }
            ]
        } : {};

        const [requests, filteredTotal] = await Promise.all([
            prisma.verificationRequest.findMany({
                where: whereCondition,
                take: limit,
                skip: skip,
                orderBy: { submittedAt: 'desc' } 
            }),
            prisma.verificationRequest.count({ where: whereCondition })
        ]);

        // --- CALCUL DES STATISTIQUES ---
        const pendingCount = await prisma.verificationRequest.count({
            where: { status: "pending" }
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const verifiedTodayCount = await prisma.verificationRequest.count({
            where: {
                status: "verified",
                // CORRECTION ICI : On utilise submittedAt car c'est la seule date de ta BDD
                submittedAt: { gte: today } 
            }
        });

        const totalAbsolute = await prisma.verificationRequest.count(); 

        return NextResponse.json({
            requests,
            total: filteredTotal,
            page,
            limit,
            stats: {
                totalCustomers: totalAbsolute,
                verifiedToday: verifiedTodayCount,
                pendingReviews: pendingCount,
                highRisk: 24 
            }
        });

    } catch (error: any) {
        console.error("GET Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// =====================================================================
// 2. POST : CRÉER UN NOUVEAU CLIENT (ET GÉNÉRER SON SCORE IA)
// =====================================================================
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { customerName, email, type, cin, documentType, nationality, dateOfBirth, phoneNumber, userId } = body;

        const minScore = 45;
        const maxScore = 98;
        const simulatedAiScore = Math.floor(Math.random() * (maxScore - minScore + 1)) + minScore;

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
                status: "pending", 
                score: simulatedAiScore.toString(), 
            },
        });

        return NextResponse.json(newRequest, { status: 201 });
    } catch (error: any) {
        console.error("POST Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}