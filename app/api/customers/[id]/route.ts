import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendKYCEmail } from "@/lib/mail"; // 💡 NOUVEAU : Import de l'utilitaire de mail

export async function GET(
    req: Request, 
    { params }: { params: Promise<{ id: string }> }
) {
    try {
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
        const resolvedParams = await params;
        const customerId = resolvedParams.id;

        const body = await req.json();
        // 💡 NOUVEAU : Récupération de la raison de rejet optionnelle depuis le body
        const { status, agentId, rejectionReason } = body;

        if (!status || !["verified", "rejected", "pending"].includes(status)) {
            return NextResponse.json({ message: "Invalid status value." }, { status: 400 });
        }

        // Récupération de l'identité de l'agent
        let agentName = "System";
        if (agentId) {
            const agent = await prisma.user.findUnique({ where: { id: agentId } });
            if (agent) agentName = agent.fullName;
        }

        let actionName = "UPDATED";
        let logDetails = `Status changed to ${status} by ${agentName}.`;

        if (status === "verified") {
            actionName = "APPROVED";
            logDetails = `KYC Profile manually approved by ${agentName}.`;
        } else if (status === "rejected") {
            actionName = "REJECTED";
            logDetails = `KYC Profile rejected by ${agentName}.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`;
        }
        
        // Mise à jour de la BDD et écriture de l'Audit Log
        const updatedCustomer = await prisma.verificationRequest.update({
            where: { id: customerId },
            data: { 
                status,
                auditLogs: {
                    create: {
                        action: actionName,
                        details: logDetails,
                        agentId: agentId || null
                    }
                }
            },
            include: {
                auditLogs: {
                    orderBy: { timestamp: 'desc' } 
                }
            }
        });

        // 💡 NOUVEAU : Envoi de l'e-mail transactionnel automatique
        if (status === "verified" || status === "rejected") {
            try {
                // On lance l'envoi en tâche de fond pour ne pas ralentir la réponse de l'API
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