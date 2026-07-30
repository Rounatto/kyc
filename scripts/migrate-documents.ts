// ============================================================================
// 🔄 [PHASE B] MIGRATION DES ANCIENS DOCUMENTS — uploadthing → Supabase privé
// ============================================================================
// Script ONE-OFF, lancé à la main. À NE PAS exposer en HTTP (souviens-toi de
// /api/fix-scores : une route de maintenance publique = une faille).
//
// Ce qu'il fait, dossier par dossier :
//   1. Trouve ceux qui ont encore une URL publique mais pas de chemin privé
//   2. Télécharge le fichier depuis uploadthing
//   3. Le renvoie dans le bucket privé Supabase
//   4. Écrit le chemin en base ET vide la colonne URL
//
// 🔒 L'étape 4 est la seule qui compte vraiment : tant que idCardUrl est
// renseignée, le document reste accessible publiquement. La vider est ce qui
// referme réellement la faille.
//
// Lancer avec :  npx tsx --env-file=.env.local app/api/scripts/migrate-documents.ts
import prisma from "../lib/prisma";
import { buildDocumentPath, uploadDocumentFromServer } from "../lib/storage";

// Déduit le type MIME depuis la réponse HTTP. On ne se fie pas à l'extension
// du nom de fichier : elle peut mentir, l'en-tête du serveur est plus fiable.
function resolveMimeType(contentType: string | null): string {
    if (!contentType) return "image/jpeg";
    const clean = contentType.split(";")[0].trim().toLowerCase();
    // Le bucket n'accepte que ces trois formats (voir lib/storage.ts).
    if (["image/jpeg", "image/png", "image/webp"].includes(clean)) return clean;
    // Repli : les vieux uploads uploadthing sont quasi tous en JPEG.
    return "image/jpeg";
}

// Télécharge un fichier public et le republie dans le bucket privé.
// Retourne le nouveau chemin, ou null si quoi que ce soit échoue.
async function migrateFile(
    publicUrl: string,
    companyId: string,
    kind: "idcard" | "selfie"
): Promise<string | null> {
    try {
        const res = await fetch(publicUrl);
        if (!res.ok) {
            console.error(`   ✗ Téléchargement impossible (HTTP ${res.status}) : ${publicUrl}`);
            return null;
        }

        const mimeType = resolveMimeType(res.headers.get("content-type"));
        const buffer = Buffer.from(await res.arrayBuffer());
        const path = buildDocumentPath(companyId, kind, mimeType);

        await uploadDocumentFromServer(path, buffer, mimeType);
        return path;
    } catch (error) {
        console.error(`   ✗ Échec de migration :`, error);
        return null;
    }
}

async function main() {
    console.log("🔄 Migration des documents KYC vers le bucket privé\n");
    // 🔍 Diagnostic : sans ça, une variable manquante donne une erreur Prisma
    // cryptique ("Can't reach database server at base") au lieu de dire
    // simplement que la configuration n'est pas chargée.
    if (!process.env.DATABASE_URL) {
        console.error("❌ DATABASE_URL introuvable. Vérifie le fichier passé à --env-file.");
        process.exit(1);
    }
    console.log(`   Base cible : ${new URL(process.env.DATABASE_URL).host}\n`);
    // On ne prend que les dossiers non encore migrés : le script est donc
    // RELANÇABLE sans risque. S'il plante à mi-parcours, le relancer reprend
    // simplement là où il s'est arrêté.
    const records = await prisma.verificationRequest.findMany({
        where: {
            companyId: { not: null },
            OR: [
                { AND: [{ idCardUrl: { not: null } }, { idCardPath: null }] },
                { AND: [{ selfieUrl: { not: null } }, { selfiePath: null }] },
            ],
        },
        select: {
            id: true,
            companyId: true,
            customerName: true,
            idCardUrl: true,
            selfieUrl: true,
            idCardPath: true,
            selfiePath: true,
        },
    });

    if (records.length === 0) {
        console.log("✅ Rien à migrer — tous les documents sont déjà dans le bucket privé.");
        return;
    }

    console.log(`${records.length} dossier(s) à traiter.\n`);
    let migrated = 0;
    let failed = 0;

    // Traitement SÉQUENTIEL, volontairement. En parallèle on saturerait
    // uploadthing et Supabase, et le journal deviendrait illisible en cas
    // d'erreur. C'est un script lancé une seule fois : la lenteur n'a aucune
    // importance, la traçabilité si.
    for (const rec of records) {
        console.log(`→ ${rec.customerName} (${rec.id})`);
        const updates: Record<string, string | null> = {};

        if (rec.idCardUrl && !rec.idCardPath) {
            const path = await migrateFile(rec.idCardUrl, rec.companyId!, "idcard");
            if (path) {
                updates.idCardPath = path;
                // 🔒 On vide l'URL publique : c'est CE geste qui referme la faille.
                updates.idCardUrl = null;
                console.log(`   ✓ Pièce d'identité migrée`);
            }
        }

        if (rec.selfieUrl && !rec.selfiePath) {
            const path = await migrateFile(rec.selfieUrl, rec.companyId!, "selfie");
            if (path) {
                updates.selfiePath = path;
                updates.selfieUrl = null;
                console.log(`   ✓ Selfie migré`);
            }
        }

        if (Object.keys(updates).length > 0) {
            await prisma.verificationRequest.update({
                where: { id: rec.id },
                data: updates,
            });
            migrated++;
        } else {
            // Aucun fichier n'a pu être récupéré : on laisse le dossier EN
            // L'ÉTAT. Vider l'URL sans avoir le fichier ailleurs le rendrait
            // définitivement inconsultable — mieux vaut un document encore
            // exposé qu'un document perdu.
            console.log(`   ⚠ Aucun fichier migré, dossier laissé inchangé`);
            failed++;
        }
    }

    console.log(`\n✅ Terminé : ${migrated} migré(s), ${failed} en échec.`);
    if (failed > 0) {
        console.log("⚠️ Les dossiers en échec gardent leurs URLs publiques. Relance le script ou traite-les à la main.");
    }
}

main()
    .catch((e) => {
        console.error("💥 Échec du script :", e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());