// ============================================================================
// 👤 MISE À JOUR DU PROFIL (personnel + organisation, selon le rôle)
// ============================================================================
// Une seule route sert 2 usages différents selon le rôle de l'appelant :
//   - COMPANY_AGENT : ne peut renommer que SON PROPRE profil (fullName, avatar).
//   - COMPANY_ADMIN : peut EN PLUS renommer l'entreprise elle-même (`Company.name`).
// La distinction est faite via `isAdmin` dérivé du rôle de la session (jamais
// d'un champ envoyé par le client), donc un agent ne peut pas se faire passer
// pour un admin en modifiant juste le payload envoyé.
// Upload d'avatar : passe directement par l'API Storage de Supabase (pas par
// Uploadthing, utilisé lui pour les documents KYC) — voir la note MIME plus bas.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized access." }, { status: 401 });
        }
        
        // 🛡️ VERROU RBAC : On autorise les Admins ET les Agents à accéder à cette route
        const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
        if (!guard.isValid) return guard.response!; // Bloque les intrus (Erreur 401 ou 403)

        // 💡 Extraction sécurisée des accréditations par le Gardien
        const { companyId, role } = guard;
        const secureEmail = session.user.email;
        const sessionCompanyName = session.user ? (session.user as any).companyName : undefined;
        
        // On vérifie le rôle exact pour conditionner l'écriture en base
        const isAdmin = role === "COMPANY_ADMIN";

        const formData = await req.formData();
        const fullName = formData.get("fullName") as string;
        // On récupère le nom de l'entreprise envoyé par le frontend
        const companyName = formData.get("companyName") as string;
        const file = formData.get("avatar") as File | null;

        let newAvatarUrl = null;

        // --- GESTION DE L'IMAGE (SUPABASE) ---
        // ⚠️ Aucune validation stricte du type MIME ici (`file.type` est
        // envoyé par le navigateur, donc falsifiable) : un fichier `image/svg+xml`
        // contenant du JavaScript embarqué serait accepté et stocké comme avatar,
        // ce qui est un vecteur XSS classique si le SVG est ensuite affiché
        // directement (plutôt que converti en PNG/rasterisé).
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

        // 🏢 SAUVEGARDE B2B AVEC FILTRAGE DE PRIVILÈGES (RBAC)
        await prisma.$transaction(async (tx) => {
            
            // 💡 RÈGLE 1 : Seul l'ADMINISTRATEUR a le droit de renommer la vraie entité Organisation
            if (isAdmin && companyId) {
                await (tx as any).company.update({
                    where: { id: companyId },
                    data: { name: companyName }
                });
            }
            
            // 💡 RÈGLE 2 : TOUT LE MONDE peut mettre à jour son propre profil
            await tx.user.update({
                where: { email: secureEmail },
                data: {
                    fullName: fullName,
                    // L'agent n'a pas le droit d'écraser le label "companyName" sur son profil
                    ...(isAdmin && { companyName: companyName }), 
                    ...(newAvatarUrl && { avatarUrl: newAvatarUrl }),
                },
            });
        });

        // On renvoie les bonnes données au Frontend selon ce qui a été réellement sauvegardé
        return NextResponse.json({
            message: isAdmin ? "Profile and Organization updated successfully" : "Personal profile updated successfully",
            user: {
                fullName,
                // Si l'utilisateur est un agent, on renvoie l'ancien nom de la session pour ne pas faire croire que ça a marché
                companyName: isAdmin ? companyName : sessionCompanyName,
                avatarUrl: newAvatarUrl
            }
        });

    } catch (error: any) {
        console.error("Profile API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}