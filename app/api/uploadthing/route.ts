// ============================================================================
// 📤 POINT D'ENTRÉE HTTP UPLOADTHING (câblage, pas de logique métier ici)
// ============================================================================
// Fichier généré par convention Uploadthing : relie simplement la config
// définie dans ./core.ts (règles, taille max, middleware d'auth) aux méthodes
// GET/POST que le SDK client d'Uploadthing appelle en coulisses.
import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "./core";

export const { GET, POST } = createRouteHandler({
  router: ourFileRouter,
});