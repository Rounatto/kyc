// ============================================================================
// 💬 ASSISTANT CHAT IA (Gemini) — dashboard/chat
// ============================================================================
// Relaie le dernier message de l'utilisateur à l'API Gemini et renvoie la
// réponse texte. Pas de mémoire de conversation côté serveur : tout
// l'historique (`messages`) est renvoyé par le frontend à chaque appel, seul
// le DERNIER message est réellement utilisé (`lastUserMessage`) — le modèle
// ne voit donc PAS le fil de discussion précédent.
//
// 🚨 FAILLE (nouvelle, non documentée dans la roadmap) : AUCUNE vérification
// de session ici (pas de `getServerSession`, aucun projet `middleware.ts` à la
// racine pour protéger les routes API globalement) — n'importe quel visiteur
// non connecté peut appeler cette route et consommer le quota/la facturation
// de la clé GEMINI_API_KEY du projet, sans rate limiting.
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  // ⚠️ Ce check ne fait que loguer dans la console — il ne bloque PAS la
  // requête (pas de `return`) : si la clé est absente, on continue quand même
  // et l'appel Gemini plus bas échouera avec une erreur moins claire.
  if (!process.env.GEMINI_API_KEY) {
    console.error("ERREUR : La variable GEMINI_API_KEY est introuvable !");
  }

  try {
    const { messages } = await req.json();
    const lastUserMessage = messages[messages.length - 1].content;

    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

    const result = await model.generateContent(lastUserMessage);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ role: "assistant", content: text });
  } catch (error: any) {
    console.error("Détail de l'erreur :", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}