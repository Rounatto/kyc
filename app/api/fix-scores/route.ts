import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
    try {
        // 1. Récupérer tous les clients
        const clients = await prisma.verificationRequest.findMany();
        let updatedCount = 0;

        // 2. Boucler et corriger le format
        for (const client of clients) {
            // Extraire uniquement les chiffres (au cas où il y aurait des lettres/espaces)
            const match = String(client.score).match(/\d+/);
            if (match) {
                const numericScore = parseInt(match[0], 10);
                // Appliquer le fameux format sur 3 caractères
                const fixedScore = numericScore.toString().padStart(3, '0');
                
                // Mettre à jour si le format actuel est différent
                if (client.score !== fixedScore) {
                    await prisma.verificationRequest.update({
                        where: { id: client.id },
                        data: { score: fixedScore }
                    });
                    updatedCount++;
                }
            }
        }

        return NextResponse.json({ message: `Nettoyage terminé. ${updatedCount} scores corrigés.` });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}