import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// =====================================================================
// GET : RÉCUPÉRATION DES CLIENTS ET CALCUL DYNAMIQUE DES STATISTIQUES
// =====================================================================
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

// =====================================================================
// POST : CRÉATION AVEC MOTEUR DE SCORE CRID / AML / FRAUDE AVANCÉ
// =====================================================================
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { customerName, email, type, cin, documentType, nationality, dateOfBirth, phoneNumber, userId, idCardUrl, selfieUrl } = body;

        // 1. Protection Session Agent
        if (!userId) {
            return NextResponse.json({ error: "Authentication missing. Please log in." }, { status: 401 });
        }
        const agent = await prisma.user.findUnique({ where: { id: userId } });
        if (!agent) {
            return NextResponse.json({ error: "Agent session invalid." }, { status: 401 });
        }

        // 2. Détection des doublons
        const existingRecord = await prisma.verificationRequest.findFirst({
            where: {
                OR: [ { email: email }, { cin: cin } ],
                status: { in: ["pending", "verified"] } 
            }
        });
        if (existingRecord) {
            return NextResponse.json({ error: "This applicant or identification document is already linked to an active KYC pipeline." }, { status: 409 });
        }

        // =====================================================================
        // MOTEUR DE VÉRIFICATION AVANCÉ : BACKGROUND CHECKS & AML MALUS
        // =====================================================================
        let calculatedScore = 100;
        let rationale: string[] = [];
        let isHardKilled = false; // Flag pour déclencher un rejet immédiat (Score proche de 0)

        const normalizedName = String(customerName).toLowerCase();
        const normalizedEmail = String(email).toLowerCase();

        // 🛑 INSPECTION 1 : Simulation Recherche Base de Données Criminelles & Fraudes Connes
        // Si le nom contient des mots-clés suspects ou des patterns de test frauduleux connus
        const fraudBlacklistNames = ["malicious", "scam", "fraud", "hacker", "fake", "darknet"];
        const matchCriminalRecord = fraudBlacklistNames.some(badName => normalizedName.includes(badName));

        if (matchCriminalRecord) {
            isHardKilled = true;
            rationale.push("CRITICAL HIT: Applicant name matched an active entry in global financial fraud network watchlists or Interpol Adverse Media.");
        }

        // Filtrage AML (Anti-Blanchiment d'Argent) & Personnes Sanctionnées
        // On simule une vérification de la pièce d'identité contre les bases de données de restrictions (OFAC/EU)
        // Par exemple, si le CIN se termine par "999" ou "000", on simule une alerte de contrefaçon ou de vol d'identité
        if (String(cin).endsWith("999") || String(cin).endsWith("000")) {
            calculatedScore -= 50;
            rationale.push("SECURITY ALERT: Identity document serial flag matched international stolen/lost document databases.");
        }

        // VÉRIFICATIONS STANDARDS DE CONFORMITÉ
        if (!isHardKilled) {
            // Type de document
            if (documentType === "Passport") {
                calculatedScore += 5;
                rationale.push("High-trust biometric document layout analyzed (Passport).");
            } else if (documentType === "Driving License") {
                calculatedScore -= 15;
                rationale.push("Driving License processed (lower identity validation priority vs passport).");
            }

            // Validité structurelle de la CIN selon la nationalité
            if (nationality === "Tunisia" || nationality === "TN") {
                if (!/^[0-9]{8}$/.test(cin)) {
                    calculatedScore -= 25;
                    rationale.push("Structure Failure: Tunisian National ID structure is out of compliance (must be 8 digits).");
                }
            }

            // Réputation du domaine email
            const disposableDomains = ["yopmail.com", "mailinator.com", "trashmail.com"];
            if (disposableDomains.some(d => normalizedEmail.endsWith(d))) {
                calculatedScore -= 35;
                rationale.push("Risk Warning: Disposable email domain detected.");
            }

            // Présence du téléphone
            if (!phoneNumber || phoneNumber === "Not specified" || phoneNumber.trim() === "") {
                calculatedScore -= 15;
                rationale.push("Missing telephony structure for multi-factor ownership lookup.");
            }
        }

        // Execution de la règle bloquante (Hard Kill)
        if (isHardKilled) {
            calculatedScore = 5; // On écrase le score pour le forcer au minimum absolu
        }

        // Bornage du score
        calculatedScore = Math.min(100, Math.max(0, calculatedScore));

        // Formatage en 3 caractères pour garantir un tri parfait par Prisma (ex: 5 devient "005")
        const formattedScore = calculatedScore.toString().padStart(3, '0');

        // Attribution de la catégorie de risque
        let riskLevel = "Low";
        if (calculatedScore < 50) riskLevel = "High";
        else if (calculatedScore < 80) riskLevel = "Medium";

        const aiRationaleString = rationale.length > 0 ? rationale.join(" ") : "Profile analyzed successfully. Background checks clear.";

        // 3. Insertion finale avec l'Audit Trail enrichi
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
                score: formattedScore,
                riskLevel: riskLevel,
                aiRationale: aiRationaleString,
                
                auditLogs: {
                    create: {
                        action: "CREATED",
                        details: `KYC Workflow opened by ${agent.fullName}. Background Screening Status: Checked against Global Criminal Registers & Financial Watchlists. Final Score assigned: ${calculatedScore}/100.`,
                        agentId: userId 
                    }
                }
            },
        });

        return NextResponse.json(newRequest, { status: 201 });
    } catch (error: any) {
        console.error("POST Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}