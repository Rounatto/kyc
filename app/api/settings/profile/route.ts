import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";

export async function POST(req: Request) {
    try {
        const session = await getServerSession();
        if (!session?.user?.email) {
            return NextResponse.json(
                { error: "Access denied. User session missing or expired." }, 
                { status: 401 }
            );
        }

        const secureEmail = session.user.email; 

        const formData = await req.formData();
        const fullName = formData.get("fullName") as string;
        const companyName = formData.get("companyName") as string;
        const file = formData.get("avatar") as File | null;

        let newAvatarUrl = null;

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

        const updatedUser = await prisma.user.update({
            where: { email: secureEmail },
            data: {
                fullName: fullName,
                companyName: companyName,
                ...(newAvatarUrl && { avatarUrl: newAvatarUrl }),
            },
        });

        return NextResponse.json({
            message: "Profile updated successfully",
            user: updatedUser,
        });

    } catch (error: any) {
        console.error("Profile API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}