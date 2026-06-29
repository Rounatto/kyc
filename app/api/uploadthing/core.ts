import { createUploadthing, type FileRouter } from "uploadthing/next";

const f = createUploadthing();

// Configuration du routeur d'upload (Niveau Pro)
export const ourFileRouter = {
  // Définition de la route pour les documents KYC
  kycDocumentUploader: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .onUploadComplete(async ({ metadata, file }) => {
      // Ce code s'exécute sur ton serveur quand l'upload est fini
      console.log("Upload complete! File URL:", file.ufsUrl);
      
      // On retourne l'URL pour que le frontend puisse l'afficher
      return { url: file.ufsUrl };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;