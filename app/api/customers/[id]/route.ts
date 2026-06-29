import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
    req: Request, 
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolvedParams = await params;
        const customerId = resolvedParams.id;

        // Récupération initiale avec l'historique
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
        const { status, agentId } = body;

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
            logDetails = `KYC Profile rejected by ${agentName}.`;
        }
        
        // Mise à jour ET récupération de l'historique complet
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
            // 💡 AJOUT PRO : On demande à Prisma de renvoyer le client AVEC son historique à jour
            include: {
                auditLogs: {
                    orderBy: { timestamp: 'desc' } 
                }
            }
        });

        return NextResponse.json(updatedCustomer);

    } catch (error: any) {
        console.error("PATCH Error:", error);
        return NextResponse.json({ message: "Failed to update customer status." }, { status: 500 });
    }
}