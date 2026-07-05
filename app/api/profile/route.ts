import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";

export async function POST(req: Request) {
    try {
        // 🔒 CONTRÔLE DE SÉCURITÉ : Vérification de la session directement sur le serveur
        const session = await getServerSession();
        if (!session?.user?.email) {
            return NextResponse.json(
                { error: "Accès refusé. Session utilisateur introuvable ou expirée." }, 
                { status: 401 }
            );
        }

        // L'email provient du jeton chiffré du serveur, c'est 100% infalsifiable
        const secureEmail = session.user.email; 

        const formData = await req.formData();
        const fullName = formData.get("fullName") as string;
        const companyName = formData.get("companyName") as string;
        const file = formData.get("avatar") as File | null;

        let newAvatarUrl = null;

        // Traitement sécurisé du fichier sur Supabase Storage
        if (file && file.size > 0) {
            const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
            const filename = `${uniqueSuffix}-${file.name.replace(/\s+/g, "-")}`;
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
                console.error("Erreur de stockage Supabase Storage :", errorText);
                return NextResponse.json({ error: "Échec critique du téléversement de l'image" }, { status: 500 });
            }
            newAvatarUrl = `${supabaseUrl}/storage/v1/object/public/avatars/${filename}`;
        }

        // Mise à jour de la ligne utilisateur correspondante dans PostgreSQL via Prisma
        const updatedUser = await prisma.user.update({
            where: { email: secureEmail },
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
        console.error("Erreur API Profile :", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}