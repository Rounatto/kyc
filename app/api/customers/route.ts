import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Engine } from "json-rules-engine";
import kycRules from "@/lib/kyc-rules.json";
import Tesseract from "tesseract.js";
import { z } from "zod"; 
import { getServerSession } from "next-auth/next"; 
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";

const customerRegistrationSchema = z.object({
    customerName: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
    email: z.string().email("Format d'email invalide"),
    type: z.string().min(1, "Le type de procédure est requis"),
    cin: z.string().min(4, "Le numéro d'identification est trop court"),
    documentType: z.string().min(1, "Le type de document est requis"),
    nationality: z.string().min(1, "La nationalité est requise"),
    dateOfBirth: z.string().optional().or(z.literal('')),
    phoneNumber: z.string().optional().or(z.literal('')),
    idCardUrl: z.string().url("L'URL de la carte d'identité est invalide ou corrompue"),
    selfieUrl: z.string().url("L'URL du selfie est invalide ou corrompue"),
    biometricScore: z.number().nullable().optional() 
});

async function performGlobalSanctionsLookup(name: string, country: string) {
    let apiSanctioned = false;
    let apiPep = false;
    let lookupSource = "Local Heuristic Engine";
    let topScore = 0.0;

    const normalized = name.toLowerCase().trim();
    const localSanctionList = ["malicious", "scam", "fraud", "hacker", "fake", "darknet", "vladimir", "putin", "al capone"];
    const localPepList = ["politician", "minister", "president", "gouverneur", "putin", "vladimir"];

    const localSanctionMatch = localSanctionList.some(badWord => normalized.includes(badWord));
    const localPepMatch = localPepList.some(pepWord => normalized.includes(pepWord));

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

    return {
        sanctioned: apiSanctioned || localSanctionMatch,
        isPep: apiPep || localPepMatch,
        source: (apiSanctioned || apiPep) ? lookupSource : (localSanctionMatch || localPepMatch ? "Local Hardcoded Match" : lookupSource),
        confidenceScore: topScore > 0 ? topScore : (localSanctionMatch || localPepMatch ? 1.0 : 0.0)
    };
}

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        
        const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
        if (!guard.isValid) return guard.response!;

        const { companyId } = guard;

        const { searchParams } = new URL(req.url);
        const search = searchParams.get("search") || "";
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "5");
        const status = searchParams.get("status") || "all";
        const risk = searchParams.get("risk") || "all";
        const sort = searchParams.get("sort") || "oldest";
        const skip = (page - 1) * limit;

        const whereCondition: any = { companyId: companyId };
        
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
            where: { status: "pending", companyId: companyId }
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const verifiedTodayCount = await prisma.verificationRequest.count({
            where: {
                status: "verified",
                updatedAt: { gte: today },
                companyId: companyId
            } as any
        });

        const totalAbsolute = await prisma.verificationRequest.count({
            where: { companyId: companyId } as any
        }); 
        
        const highRiskCount = await prisma.verificationRequest.count({
            where: { riskLevel: "High", companyId: companyId } as any
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

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        
        const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
        if (!guard.isValid) return guard.response!;

        const { companyId, userId: serverAgentId } = guard;

        const body = await req.json();
        const validationResult = customerRegistrationSchema.safeParse(body);
        
        if (!validationResult.success) {
            const errorMessages = validationResult.error.issues
                .map((err) => `${err.path.map(String).join('.')}: ${err.message}`)
                .join(' | ');
            console.error("❌ Zod Security Block:", errorMessages);
            return NextResponse.json({ error: `Security Validation Failed: ${errorMessages}` }, { status: 400 });
        }

        const { customerName, email, type, cin, documentType, nationality, dateOfBirth, phoneNumber, idCardUrl, selfieUrl, biometricScore } = validationResult.data;

        const agent = await prisma.user.findUnique({ where: { id: serverAgentId } });
        if (!agent) {
            return NextResponse.json({ error: "Agent session invalid or revoked." }, { status: 401 });
        }

        const existingRecord = await prisma.verificationRequest.findFirst({
            where: {
                companyId: companyId,
                OR: [ { email: email }, { cin: cin } ],
                status: { in: ["pending", "verified"] } 
            }
        });
        if (existingRecord) {
            return NextResponse.json({ error: "This applicant or identification document is already linked to an active KYC pipeline." }, { status: 409 });
        }

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

        let ocrText = "";
        let ocrFailed = false;
        let isNameOnDoc = false;
        let isCinOnDoc = false;

        try {
            if (idCardUrl && idCardUrl.trim() !== "") {
                const { data } = await Tesseract.recognize(idCardUrl, 'eng+fra+ara');
                ocrText = data.text.toLowerCase();

                const nameParts = String(customerName).toLowerCase().split(" ");
                isNameOnDoc = nameParts.every((part: string) => ocrText.includes(part));
                isCinOnDoc = ocrText.includes(String(cin).toLowerCase());
            } else {
                ocrFailed = true;
            }
        } catch (error) {
            console.error("Critical OCR Extraction failed. Falling back to manual review:", error);
            ocrFailed = true; 
        }

        const amlScreening = await performGlobalSanctionsLookup(customerName, nationality || "");
        const normalizedEmail = String(email).toLowerCase();
        const faceMismatchDetected = biometricScore !== null && biometricScore !== undefined && biometricScore < 60;

        const facts = {
            isSanctionedName: amlScreening.sanctioned,
            isStolenDocument: String(cin).endsWith("999") || String(cin).endsWith("000"),
            isDisposableEmail: ["yopmail.com", "mailinator.com", "trashmail.com"].some(d => normalizedEmail.endsWith(d)),
            invalidCinFormat: (nationality === "Tunisia" || nationality === "TN") && !/^[0-9]{8}$/.test(cin),
            missingPhone: !phoneNumber || phoneNumber === "Not specified" || phoneNumber.trim() === "",
            isPassport: documentType === "Passport",
            isUnderage: isUnderage,
            isYoungAdult: isYoungAdult,
            ocrNameMismatch: !ocrFailed && !isNameOnDoc,
            ocrCinMismatch: !ocrFailed && !isCinOnDoc,
            faceMismatch: faceMismatchDetected 
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

        if (biometricScore !== null && biometricScore !== undefined) {
            if (faceMismatchDetected) {
                rationale.unshift(`⛔ BIOMETRIC FAILURE: Face match score is ${biometricScore.toFixed(1)}%. The face on the Live Selfie does NOT match the ID Document photo.`);
            } else {
                rationale.unshift(`✅ BIOMETRIC SUCCESS: Face match verified with ${biometricScore.toFixed(1)}% similarity.`);
            }
        } else {
            rationale.unshift(`⚠️ BIOMETRIC WARNING: Face detection skipped or failed to extract geometric landmarks.`);
        }

        if (ocrFailed) {
            rationale.push("NOTICE: Image parsing skipped or image unreadable. Manual document verification required.");
        } else if (facts.ocrNameMismatch || facts.ocrCinMismatch) {
            rationale.push("⚠️ OCR COMPLETED: Structural inconsistencies found. Form metadata does not match document text extraction.");
        } else {
            rationale.push("✅ OCR COMPLETED: High correspondence. Form data matches document text extraction.");
        }

        riskScore = Math.min(100, Math.max(0, riskScore));
        const formattedScore = riskScore.toString().padStart(3, '0');

        let riskLevel = "Low";
        if (riskScore >= 50) riskLevel = "High";
        else if (riskScore >= 20) riskLevel = "Medium";

        const aiRationaleString = rationale.length > 0 
            ? rationale.join(" ") 
            : `Profile analyzed successfully. Source: ${amlScreening.source}. Client Age: ${clientAge}. Document validation successful.`;

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
                userId: serverAgentId!, 
                companyId: companyId!,  
                idCardUrl,
                selfieUrl,
                status: "pending", 
                score: formattedScore,
                riskLevel: riskLevel,
                aiRationale: aiRationaleString,
                
                auditLogs: {
                    create: {
                        action: "CREATED",
                        details: `KYC Pipeline initialized. Modules processed: Biometrics, Age Check (${clientAge}yo), AML Screening, OCR Document Analysis. Calculated Risk Score: ${riskScore}/100.`,
                        agentId: serverAgentId!, 
                        companyId: companyId!
                    }
                }
            },
        });

        // 💡 NOUVEAU : ALERTE HIGH RISK
        if (riskLevel === "High") {
            await prisma.notification.create({
                data: {
                    type: "HIGH_RISK_ALERT",
                    title: "High Risk Profile Detected",
                    message: `${customerName} generated a critical risk score of ${riskScore}/100. Immediate review required.`,
                    companyId: companyId!
                }
            });
        }

        return NextResponse.json(newRequest, { status: 201 });
    } catch (error: any) {
        console.error("POST Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}