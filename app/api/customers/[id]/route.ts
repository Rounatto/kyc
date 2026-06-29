import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
    req: Request, 
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolvedParams = await params;
        const customerId = resolvedParams.id;

        // Chargement du client en incluant sa piste d'audit complète
        const customer = await prisma.verificationRequest.findUnique({
            where: { id: customerId },
            include: {
                auditLogs: {
                    orderBy: { timestamp: 'desc' } // Du plus récent au plus ancien
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
        // Réception du statut et de l'ID de l'agent depuis le front-end
        const { status, agentId } = body;

        if (!status || !["verified", "rejected", "pending"].includes(status)) {
            return NextResponse.json({ message: "Invalid status value." }, { status: 400 });
        }

        // Récupération de l'identité de l'agent pour graver son nom
        let agentName = "System";
        if (agentId) {
            const agent = await prisma.user.findUnique({ where: { id: agentId } });
            if (agent) agentName = agent.fullName;
        }

        // Configuration du message d'audit selon l'action
        let actionName = "UPDATED";
        let logDetails = `Status changed to ${status} by ${agentName}.`;

        if (status === "verified") {
            actionName = "APPROVED";
            logDetails = `KYC Profile manually approved by ${agentName}.`;
        } else if (status === "rejected") {
            actionName = "REJECTED";
            logDetails = `KYC Profile manually rejected by ${agentName}.`;
        }
        
        // Mise à jour du client ET création du log en une seule transaction
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
        });

        return NextResponse.json(updatedCustomer);

    } catch (error: any) {
        console.error("PATCH Error:", error);
        return NextResponse.json({ message: "Failed to update customer status." }, { status: 500 });
    }
}