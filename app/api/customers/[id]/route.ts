import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
    req: Request, 
    { params }: { params: Promise<{ id: string }> } // <-- params est une Promise
) {
    try {
        // 1. On "ouvre le colis" avec await pour extraire l'ID proprement
        const resolvedParams = await params;
        const customerId = resolvedParams.id;

        // 2. On cherche le client dans la base de données
        const customer = await prisma.verificationRequest.findUnique({
            where: { id: customerId },
        });

        if (!customer) {
            return NextResponse.json({ message: "Customer not found" }, { status: 404 });
        }
        
        return NextResponse.json(customer);
        
    } catch (error: any) {
        console.error("GET Error:", error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> } // <-- params est une Promise
) {
    try {
        // 1. On "ouvre le colis" avec await pour l'ID
        const resolvedParams = await params;
        const customerId = resolvedParams.id;

        // 2. On lit le contenu envoyé par les boutons du frontend
        const body = await req.json();
        const { status } = body;

        // 3. Sécurité : on refuse tout ce qui n'est pas un de ces trois mots exacts
        if (!status || !["verified", "rejected", "pending"].includes(status)) {
            return NextResponse.json({ message: "Invalid status value" }, { status: 400 });
        }
        
        // 4. Mise à jour dans la base de données
        const updatedCustomer = await prisma.verificationRequest.update({
            where: { id: customerId },
            data: { status },
        });

        return NextResponse.json(updatedCustomer);

    } catch (error: any) {
        console.error("PATCH Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}