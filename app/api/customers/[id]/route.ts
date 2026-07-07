import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendKYCEmail } from "@/lib/mail";
import { getServerSession } from "next-auth/next"; // 💡 LE GARDIEN DE SÉCURITÉ
import { authoptions } from "@/api/auth/[...nextauth]/route"; // 💡 LES OPTIONS D'AUTHENTIFICATION

export async function GET(
    req: Request, 
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // 🔒 CONFINEMENT PHASE 0 : VERROUILLAGE DE LA LECTURE
        const session = await getServerSession(authoptions);
        if (!session?.user?.email) {
            console.error("🔴 Sécurité : Tentative d'accès anonyme bloquée sur GET /customers/[id]");
            return NextResponse.json({ message: "Unauthorized access. Valid session required." }, { status: 401 });
        }

        const resolvedParams = await params;
        const customerId = resolvedParams.id;

        const customer = await prisma.verificationRequest.findUnique({
            where: { id: customerId },
            include: {
                auditLogs: {
                    orderBy: { timestamp: 'desc' } 
                }
            }
        });

        if (!customer) {
            return NextResponse.json({ message: "Customer not found." }, { status: 404 });
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
        // 🔒 CONFINEMENT PHASE 0 : VERROUILLAGE DE L'ÉCRITURE
        const session = await getServerSession();
        if (!session?.user?.email || !(session.user as any).id) {
            console.error("🔴 Sécurité : Tentative de modification bloquée sur PATCH /customers/[id]");
            return NextResponse.json({ message: "Unauthorized access. Valid session required." }, { status: 401 });
        }

        // 💡 IDENTITÉ INFALSIFIABLE DE L'AGENT DEPUIS LE SERVEUR
        const serverAgentId = (session.user as any).id;
        const serverAgentName = session.user.name || "Unknown Agent";

        const resolvedParams = await params;
        const customerId = resolvedParams.id;

        const body = await req.json();
        
        // 💡 Logique de gestion du Flag pour Audit
        if (body.action === "FLAG_AUDIT") {
            const flaggedCustomer = await prisma.verificationRequest.update({
                where: { id: customerId },
                data: {
                    auditLogs: {
                        create: {
                            action: "FLAGGED",
                            details: `Profile manually flagged for internal security audit by ${serverAgentName}. Immediate attention required.`,
                            agentId: serverAgentId // 👈 IDENTITÉ SERVEUR
                        }
                    }
                }
            });
            return NextResponse.json(flaggedCustomer);
        }

        // --- Logique Standard Approve/Reject ---
        // ❌ agentId EST SUPPRIMÉ DU BODY. Le client n'a plus le droit de dicter son identité.
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
                        agentId: serverAgentId // 👈 IDENTITÉ SERVEUR INFALSIFIABLE
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