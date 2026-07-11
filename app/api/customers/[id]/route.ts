import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendKYCEmail } from "@/lib/mail";
import { getServerSession } from "next-auth/next"; 
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac"; // 💡 IMPORT DU GARDIEN RBAC

export async function GET(
    req: Request, 
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        
        // 🛡️ VERROU RBAC
        const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
        if (!guard.isValid) return guard.response!;

        const { companyId } = guard;
        const resolvedParams = await params;
        const customerId = resolvedParams.id;

        const customer = await prisma.verificationRequest.findUnique({
            where: { 
                id: customerId,
                companyId: companyId! // 🏢 DOUBLE VÉRIFICATION B2B
            },
            include: {
                auditLogs: {
                    orderBy: { timestamp: 'desc' },
                    include: { agent: { select: { fullName: true } } } // Pour afficher le nom de l'agent dans l'historique
                }
            }
        });

        if (!customer) {
            return NextResponse.json({ message: "Customer not found or unauthorized access." }, { status: 404 });
        }
        
        return NextResponse.json(customer);
    } catch (error: any) {
        console.error("GET Error:", error);
        return NextResponse.json({ message: "Internal server error." }, { status: 500 });
    }
}

export async function PATCH(
    req: Request, 
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        
        // 🛡️ VERROU RBAC
        const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
        if (!guard.isValid) return guard.response!;

        const { companyId, userId: serverAgentId } = guard;
        const serverAgentName = session.user?.name || "Unknown Agent";

        const resolvedParams = await params;
        const customerId = resolvedParams.id;

        // Vérifier que le dossier appartient bien à l'entreprise
        const existingCustomer = await prisma.verificationRequest.findUnique({
            where: { id: customerId, companyId: companyId! }
        });

        if (!existingCustomer) {
            return NextResponse.json({ message: "Customer not found or unauthorized." }, { status: 404 });
        }

        const body = await req.json();
        
        // --- 💡 Logique de gestion du Flag pour Audit ---
        if (body.action === "FLAG_AUDIT") {
            const flaggedCustomer = await prisma.verificationRequest.update({
                where: { id: customerId },
                data: {
                    auditLogs: {
                        create: {
                            action: "FLAGGED",
                            details: `Profile manually flagged for internal security audit by ${serverAgentName}. Immediate attention required.`,
                            agentId: serverAgentId!,
                            companyId: companyId! // 💡 UNIFIED AUDIT TRAIL
                        }
                    }
                }
            });
            return NextResponse.json(flaggedCustomer);
        }

        // --- Logique Standard Approve/Reject ---
        const { status, rejectionReason } = body; 

        if (!status || !["verified", "rejected", "pending"].includes(status)) {
            return NextResponse.json({ message: "Invalid status value." }, { status: 400 });
        }

        let actionName = "UPDATED";
        let logDetails = `Status changed to ${status} by ${serverAgentName}.`;

        if (status === "verified") {
            actionName = "APPROVED";
            logDetails = `KYC Profile manually approved by ${serverAgentName}.`;
        } else if (status === "rejected") {
            actionName = "REJECTED";
            logDetails = `KYC Profile rejected by ${serverAgentName}.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`;
        }
        
        const updatedCustomer = await prisma.verificationRequest.update({
            where: { id: customerId },
            data: { 
                status,
                auditLogs: {
                    create: {
                        action: actionName,
                        details: logDetails,
                        agentId: serverAgentId!,
                        companyId: companyId! // 💡 UNIFIED AUDIT TRAIL
                    }
                }
            },
            include: {
                auditLogs: {
                    orderBy: { timestamp: 'desc' } 
                }
            }
        });

        if (status === "verified" || status === "rejected") {
            try {
                sendKYCEmail(
                    updatedCustomer.email, 
                    status, 
                    updatedCustomer.customerName, 
                    rejectionReason
                );
            } catch (emailError) {
                console.error("Async Email Dispatch Failure:", emailError);
            }
        }

        return NextResponse.json(updatedCustomer);
    } catch (error: any) {
        console.error("PATCH Error:", error);
        return NextResponse.json({ message: "Failed to update customer status." }, { status: 500 });
    }
}