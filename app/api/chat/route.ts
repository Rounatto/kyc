// ============================================================================
// 💬 ASSISTANT CHAT IA (Gemini) — dashboard/chat
// ============================================================================
// Relaie le dernier message de l'utilisateur à l'API Gemini et renvoie la
// réponse texte. Pas de mémoire de conversation côté serveur : tout
// l'historique (`messages`) est renvoyé par le frontend à chaque appel, seul
// le DERNIER message est réellement utilisé (`lastUserMessage`) — le modèle
// ne voit donc PAS le fil de discussion précédent.
//
// Comme le lien "Chat" du dashboard n'est filtré par aucun rôle (voir
// app/dashboard/layout.tsx), les deux rôles existants ont accès ici — même
// garde RBAC que le reste de l'API (voir lib/rbac.ts).
//
// ⚠️ Pas de rate limiting sur cette route (roadmap Phase B, item H4) : un
// utilisateur authentifié peut encore spammer des requêtes vers Gemini. La
// protection ici est "connexion requise", pas "usage limité par utilisateur".
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Cadre volontairement le rôle de l'assistant pour éviter qu'il ne réponde à
// n'importe quoi sous l'identité "TrustVerify" (risque réputationnel).
const SYSTEM_INSTRUCTION =
  "You are the in-app support assistant for TrustVerify, a B2B KYC compliance platform. " +
  "Only help with questions about using TrustVerify: the verification workflow, settings, " +
  "billing, and general KYC/compliance concepts. Politely decline unrelated requests.";

const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.string(),
        content: z.string().min(1),
      })
    )
    .min(1, "La conversation est vide."),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
  if (!guard.isValid) return guard.response!;

  // Échec rapide et explicite plutôt que de laisser l'appel Gemini plus bas
  // échouer avec une erreur moins claire côté client.
  if (!process.env.GEMINI_API_KEY) {
    console.error("ERREUR : La variable GEMINI_API_KEY est introuvable !");
    return NextResponse.json(
      { error: "Le chat n'est pas configuré côté serveur." },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const validationResult = chatRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Message invalide ou conversation vide." },
        { status: 400 }
      );
    }

    const { messages } = validationResult.data;
    const lastUserMessage = messages[messages.length - 1].content;

    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash",
      systemInstruction: SYSTEM_INSTRUCTION,
    });

    const result = await model.generateContent(lastUserMessage);
    const text = result.response.text();

    return NextResponse.json({ role: "assistant", content: text });
  } catch (error: any) {
    // Le détail (potentiellement sensible : quota, clé, infra Google) reste
    // côté serveur ; le client ne reçoit qu'un message générique.
    console.error("Erreur Gemini:", error);
    return NextResponse.json(
      { error: "Le service de chat est momentanément indisponible." },
      { status: 500 }
    );
  }
}
