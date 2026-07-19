// ============================================================================
// 📤 CONFIGURATION UPLOADTHING — UPLOAD DES DOCUMENTS KYC (pièce d'identité + selfie)
// ============================================================================
// Uploadthing gère l'upload de FICHIERS (stockage, CDN, limites de taille) —
// une fois le fichier hébergé, seule son URL (`file.ufsUrl`) est transmise à
// app/api/customers pour créer le dossier KYC. `kycDocumentUploader` est le
// nom de route que le composant frontend (`useUploadThing("kycDocumentUploader")`)
// doit référencer pour utiliser cette config précise.
//
// ⚠️ Le selfie transite par ce MÊME uploader qu'une pièce d'identité classique
// (limite 4 Mo, type "image" générique) : c'est un simple upload de FICHIER,
// pas une capture caméra en direct — voir new-verification/page.tsx (Lot 7)
// pour le détail de la faille liveness que ça implique.
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
const f = createUploadthing();

export const ourFileRouter = {
  kycDocumentUploader: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    // Vérifie la session AVANT d'accepter l'upload : un visiteur non connecté
    // ne peut pas utiliser ce endpoint pour héberger des fichiers arbitraires
    // sur le compte Uploadthing du projet.
    .middleware(async ({ req }) => {
      const session = await getServerSession(authOptions);
      if (!session?.user?.email || !session.user.id) {
          console.error("🔴 Sécurité : Tentative d'upload de document bloquée");
          throw new Error("Unauthorized access. Valid session required to upload files.");
      }
      
      // On attache l'identité de l'agent aux métadonnées du fichier
      return { uploaderId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log(`✅ Upload autorisé complété par l'agent ID: ${metadata.uploaderId}`);
      console.log("File URL:", file.ufsUrl);
      
      return { url: file.ufsUrl };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;