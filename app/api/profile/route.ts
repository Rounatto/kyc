import { NextResponse } from "next/server";
import prisme from "@/lib/prisma";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
    try{
        const formData = await req.formData();
        const email = formData.get("email") as string;
        const fullName = formData.get("fullName") as string;
        const companyName = formData.get("companyName") as string;
        const file = formData.get("avatar") as File | null;

        let newAvatarUrl = null;

        if (file && file.size > 0) {
            const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
            const filename= `${uniqueSuffix}-${file.name.replace(/\s+/g, "-")}`;
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
                console.error("Erreur de stockage Supabase:", errorText);
                return NextResponse.json({ error: "échec de l'envoi de l'image"}, { status: 500 });
            }
            newAvatarUrl = `${supabaseUrl}/storage/v1/object/public/avatars/${filename}`;
        }
        const updatedUser = await prisma.user.update({
            where: { email: email },
            data: {
                fullName: fullName,
                companyName: companyName,
                ...(newAvatarUrl && { avatarUrl: newAvatarUrl }),
            },
        });
        return NextResponse.json({
            message: "Profil mis à jour avec succès",
            user: updatedUser,
        });
    } catch (error: any) {
        console.error("Erreur API Profile:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}