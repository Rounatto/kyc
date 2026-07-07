import { createUploadthing, type FileRouter } from "uploadthing/next";
import { getServerSession } from "next-auth/next"; // 💡 LE GARDIEN

const f = createUploadthing();

export const ourFileRouter = {
  // Définition de la route pour les documents KYC
  kycDocumentUploader: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    // 🔒 CONFINEMENT PHASE 0 : VERROUILLAGE DE L'UPLOAD
    .middleware(async ({ req }) => {
      const session = await getServerSession();
      if (!session?.user?.email || !(session.user as any).id) {
          console.error("🔴 Sécurité : Tentative d'upload de document bloquée");
          throw new Error("Unauthorized access. Valid session required to upload files.");
      }
      
      // On attache l'identité de l'agent aux métadonnées du fichier
      return { uploaderId: (session.user as any).id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log(`✅ Upload autorisé complété par l'agent ID: ${metadata.uploaderId}`);
      console.log("File URL:", file.ufsUrl);
      
      return { url: file.ufsUrl };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;