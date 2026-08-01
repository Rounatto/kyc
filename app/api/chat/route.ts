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
// ✅ [PHASE B — RÉSOLU] Rate limiting ajouté. Avant, un utilisateur authentifié
// pouvait envoyer des milliers de messages d'affilée : chaque appel a un coût
// réel facturé par Google, et rien ne l'empêchait de vider le budget Gemini.
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";
// 🆕 [PHASE B] Limitation du nombre de requêtes (Upstash Redis).
import { enforceRateLimit, chatLimiter } from "@/lib/ratelimit";

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

  // ==========================================================================
  // 🆕 [PHASE B] LIMITE PAR UTILISATEUR (et non par adresse IP)
  // ==========================================================================
  // Placé juste après le contrôle d'accès, car c'est ce contrôle qui nous
  // donne l'identité de l'appelant (`guard.userId`).
  //
  // 💡 POURQUOI PAR UTILISATEUR ET PAS PAR IP, contrairement aux autres routes :
  // cette route est déjà protégée par une session, on sait donc EXACTEMENT qui
  // appelle. Or dans une entreprise, tous les employés partagent souvent la
  // même adresse IP publique. Une limite par IP ferait qu'un seul utilisateur
  // bavard bloquerait tous ses collègues — injuste et incompréhensible pour
  // eux. En comptant par utilisateur, chacun a son propre quota.
  //
  // Sur les routes publiques (register, verify-register), c'est l'inverse : il
  // n'y a pas encore de session, l'IP est la seule identité disponible.
  const rateLimited = await enforceRateLimit(chatLimiter, guard.userId!);
  if (rateLimited) return rateLimited;

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
      model: "gemini-3.5-flash-lite",
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