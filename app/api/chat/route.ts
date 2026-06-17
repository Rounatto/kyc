import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// On utilise ici le nom exact que tu as mis dans ton fichier .env.local
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  // Vérification de sécurité dans la console
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