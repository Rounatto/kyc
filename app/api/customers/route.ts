import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Engine } from "json-rules-engine";
import kycRules from "@/lib/kyc-rules.json";

// =====================================================================
// INTERROGATION EN TEMPS RÉEL DE L'API OPENSANCTIONS + FAIL-SAFE LOCAL
// =====================================================================
async function performGlobalSanctionsLookup(name: string, country: string) {
    let apiSanctioned = false;
    let apiPep = false;
    let lookupSource = "Local Heuristic Engine";
    let topScore = 0.0;

    // 1. 🛡️ ÉVALUATION LOCALE UNIVERSELLE (S'exécute toujours en premier)
    const normalized = name.toLowerCase().trim();
    const localSanctionList = ["malicious", "scam", "fraud", "hacker", "fake", "darknet", "vladimir", "putin", "al capone"];
    const localPepList = ["politician", "minister", "president", "gouverneur", "putin", "vladimir"];

    const localSanctionMatch = localSanctionList.some(badWord => normalized.includes(badWord));
    const localPepMatch = localPepList.some(pepWord => normalized.includes(pepWord));

    // 2. 🌍 RECHERCHE API OPENSANCTIONS
    try {
        const apiKey = process.env.OPENSANCTIONS_API_KEY;
        
        const response = await fetch("https://api.opensanctions.org/match/default", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {})
            },
            body: JSON.stringify({
                queries: {
                    q1: {
                        schema: "Person",
                        properties: {
                            name: [name],
                            jurisdiction: country ? [country] : []
                        }
                    }
                }
            })
        });

        if (response.ok) {
            const data = await response.json();
            const results = data.queries?.q1?.results || [];
            
            if (results.length > 0) {
                const sortedCandidates = results.sort((a: any, b: any) => b.score - a.score);
                const candidate = sortedCandidates[0];
                topScore = candidate.score;

                // 💡 Seuil abaissé à 0.50 pour être plus agressif sur les correspondances partielles
                if (topScore > 0.50) {
                    const topics = [
                        ...(candidate.topics || []),
                        ...(candidate.properties?.topics || [])
                    ];

                    apiSanctioned = topics.includes("sanction") || topics.includes("sanctions");
                    apiPep = topics.includes("role.pep") || topics.includes("pep");
                    lookupSource = "OpenSanctions API (Live Production Index)";
                }
            }
        } else {
            console.warn("OpenSanctions API HTTP Error:", response.status);
        }
    } catch (error) {
        console.error("OpenSanctions connection timeout or failure:", error);
    }

    // 3. FUSION DES RÉSULTATS (API + LOCAL)
    return {
        sanctioned: apiSanctioned || localSanctionMatch,
        isPep: apiPep || localPepMatch,
        source: (apiSanctioned || apiPep) ? lookupSource : (localSanctionMatch || localPepMatch ? "Local Hardcoded Match" : lookupSource),
        confidenceScore: topScore > 0 ? topScore : (localSanctionMatch || localPepMatch ? 1.0 : 0.0)
    };
}

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
        const sort = searchParams.get("sort") || "oldest";
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

        let orderByCondition: any = { submittedAt: 'asc' };

        if (sort === "newest") {
            orderByCondition = { submittedAt: 'desc' };
        } else if (sort === "highest_score") {
            orderByCondition = { score: 'desc' }; 
        } else if (sort === "lowest_score") {
            orderByCondition = { score: 'asc' };
        }

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
// POST : LE PIPELINE KYC COMPLET
// =====================================================================
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { customerName, email, type, cin, documentType, nationality, dateOfBirth, phoneNumber, userId, idCardUrl, selfieUrl } = body;

        if (!userId) {
            return NextResponse.json({ error: "Authentication missing. Please log in." }, { status: 401 });
        }
        const agent = await prisma.user.findUnique({ where: { id: userId } });
        if (!agent) {
            return NextResponse.json({ error: "Agent session invalid." }, { status: 401 });
        }

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
        // CALCUL DYNAMIQUE DE L'ÂGE
        // =====================================================================
        let clientAge = 30;
        let isUnderage = false;
        let isYoungAdult = false;

        if (dateOfBirth) {
            const birthDate = new Date(dateOfBirth);
            const today = new Date();
            clientAge = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                clientAge--;
            }

            if (clientAge < 18) isUnderage = true;
            else if (clientAge < 25) isYoungAdult = true;
        }

        // =====================================================================
        // APPEL OPENSANCTIONS + LOCAL FAIL-SAFE
        // =====================================================================
        const amlScreening = await performGlobalSanctionsLookup(customerName, nationality || "");

        const normalizedEmail = String(email).toLowerCase();

        const facts = {
            isSanctionedName: amlScreening.sanctioned,
            isStolenDocument: String(cin).endsWith("999") || String(cin).endsWith("000"),
            isDisposableEmail: ["yopmail.com", "mailinator.com", "trashmail.com"].some(d => normalizedEmail.endsWith(d)),
            invalidCinFormat: (nationality === "Tunisia" || nationality === "TN") && !/^[0-9]{8}$/.test(cin),
            missingPhone: !phoneNumber || phoneNumber === "Not specified" || phoneNumber.trim() === "",
            isPassport: documentType === "Passport",
            isUnderage: isUnderage,
            isYoungAdult: isYoungAdult
        };

        const engine = new Engine(kycRules);
        const { events } = await engine.run(facts);

        let riskScore = 0;
        let rationale: string[] = [];
        let isHardKilled = false;

        events.forEach(event => {
            const points = event.params?.points as number || 0;
            const message = event.params?.message as string;
            
            rationale.push(message);

            if (event.type === 'hard_kill') {
                isHardKilled = true;
            } else {
                riskScore += points;
            }
        });

        if (isHardKilled) {
            riskScore = 100;
        }

        if (amlScreening.isPep) {
            riskScore += 15;
            rationale.push(`NOTICE: Applicant verified as a Politically Exposed Person (PEP). Detection Source: ${amlScreening.source}.`);
        }

        riskScore = Math.min(100, Math.max(0, riskScore));
        const formattedScore = riskScore.toString().padStart(3, '0');

        let riskLevel = "Low";
        if (riskScore >= 50) riskLevel = "High";
        else if (riskScore >= 20) riskLevel = "Medium";

        const aiRationaleString = rationale.length > 0 
            ? rationale.join(" ") 
            : `Profile analyzed successfully. Source: ${amlScreening.source}. Client Age: ${clientAge}. No threats detected.`;

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
                        details: `KYC Pipeline initialized. Age Verification completed (${clientAge}yo). Cross-referenced with AML lists. Score calculated: ${riskScore}/100.`,
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