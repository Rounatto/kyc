import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route"; // 💡 LE GARDIEN DE SÉCURITÉ

export async function POST(req: Request) {
    try {
        // 🔒 CONFINEMENT PHASE 0 : Vérification stricte
        const session = await getServerSession(authOptions);
        if (!session?.user?.email || !(session.user as any).companyId) {
            return NextResponse.json(
                { error: "Access denied. Valid B2B session required." }, 
                { status: 401 }
            );
        }

        const secureEmail = session.user.email; 
        const companyId = (session.user as any).companyId; // 🏢 On récupère le vrai ID de l'entreprise

        const formData = await req.formData();
        const fullName = formData.get("fullName") as string;
        const companyName = formData.get("companyName") as string;
        const file = formData.get("avatar") as File | null;

        let newAvatarUrl = null;

        // --- GESTION DE L'IMAGE (SUPABASE) ---
        if (file && file.size > 0) {
            const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
            const filename = `${uniqueSuffix}-${file.name.replace(/\s+/g, "-")}`;
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            
            if (!supabaseUrl || !supabaseKey) {
                 return NextResponse.json({ error: "Storage configuration is missing." }, { status: 500 });
            }

            const uploadResponse = await fetch(
                `${supabaseUrl}/storage/v1/object/avatars/${filename}`,
                {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${supabaseKey}`,
                        "Content-Type": file.type,
                    },
                    body: file,
                }
            );

            if (!uploadResponse.ok) {
                const errorText = await uploadResponse.text();
                console.error("Supabase Storage Error:", errorText);
                return NextResponse.json({ error: "Critical failure uploading image to storage" }, { status: 500 });
            }
            newAvatarUrl = `${supabaseUrl}/storage/v1/object/public/avatars/${filename}`;
        }

        // 🏢 CORRECTION B2B (Phase 1) : On met à jour l'Entreprise ET l'Utilisateur en simultané
        await prisma.$transaction(async (tx) => {
            // Mise à jour de la vraie entité Organisation
            if (companyId) {
                await tx.company.update({
                    where: { id: companyId },
                    data: { name: companyName }
                });
            }
            
            // Mise à jour du profil Agent
            await tx.user.update({
                where: { email: secureEmail },
                data: {
                    fullName: fullName,
                    companyName: companyName, // Rétrocompatibilité UI
                    ...(newAvatarUrl && { avatarUrl: newAvatarUrl }),
                },
            });
        });

        return NextResponse.json({
            message: "Profile and Organization updated successfully",
            user: {
                fullName,
                companyName,
                avatarUrl: newAvatarUrl
            }
        });

    } catch (error: any) {
        console.error("Profile API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}