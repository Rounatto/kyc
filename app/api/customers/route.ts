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

// Création sécurisée d'un dossier KYC avec analyse IA et Audit Log
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { customerName, email, type, cin, documentType, nationality, dateOfBirth, phoneNumber, userId } = body;

        // Validation d'unicité
        const existingRecord = await prisma.verificationRequest.findFirst({
            where: {
                OR: [ { email: email }, { cin: cin } ],
                status: { in: ["pending", "verified"] } 
            }
        });

        if (existingRecord) {
            if (existingRecord.email === email) {
                return NextResponse.json({ error: "Email is already registered in an active pipeline." }, { status: 409 });
            }
            if (existingRecord.cin === cin) {
                return NextResponse.json({ error: "This Identity Document is already in use." }, { status: 409 });
            }
        }

        // Moteur de Score IA Dynamique
        let calculatedScore = 100;
        let rationale = [];

        if (dateOfBirth) {
            const age = new Date().getFullYear() - new Date(dateOfBirth).getFullYear();
            if (age < 21) {
                calculatedScore -= 15;
                rationale.push("Applicant is young (under 21).");
            }
        }

        if (!phoneNumber || phoneNumber === "Not specified") {
            calculatedScore -= 20;
            rationale.push("Missing valid phone contact.");
        }

        if (documentType === "Passport") {
             calculatedScore += 5; 
             rationale.push("High-trust document provided (Passport).");
        }

        calculatedScore = Math.min(100, Math.max(0, calculatedScore));

        let riskLevel = "Low";
        if (calculatedScore < 50) riskLevel = "High";
        else if (calculatedScore < 80) riskLevel = "Medium";

        const aiRationaleString = rationale.length > 0 ? rationale.join(" ") : "Standard profile, no anomalies detected.";

        // Récupération du nom de l'agent pour le log immuable
        let agentName = "System";
        if (userId) {
            const agent = await prisma.user.findUnique({ where: { id: userId } });
            if (agent) agentName = agent.fullName;
        }

        // Insertion et Audit Log
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
                score: calculatedScore.toString(), 
                riskLevel: riskLevel,
                aiRationale: aiRationaleString,
                
                // Le log affiche désormais explicitement le nom de l'agent
                auditLogs: {
                    create: {
                        action: "CREATED",
                        details: `KYC Pipeline initiated by ${agentName}.`,
                        agentId: userId 
                    }
                }
            },
        });

        return NextResponse.json(newRequest, { status: 201 });
    } catch (error: any) {
        console.error("POST Error:", error);
        return NextResponse.json({ error: "Internal server error during registration." }, { status: 500 });
    }
}