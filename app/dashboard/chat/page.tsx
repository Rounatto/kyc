"use client";

// ============================================================================
// 💬 INTERFACE DU CHAT IA — CLIENT DE app/api/chat
// ============================================================================
// Historique de conversation géré uniquement en state React (`messages`) —
// rien n'est persisté en base, un refresh de page efface tout l'échange.
// ⚠️ Stylé en inline styles (`style={{...}}`) plutôt qu'en classes Tailwind
// comme le reste de l'app — cohérence visuelle à revoir. Rappel : le endpoint
// appelé ici (/api/chat) n'a aucune authentification (voir Lot 5).
import { useState } from "react";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
      } else {
        console.error("Erreur API:", data.details);
        alert("Erreur: " + (data.error || "Impossible de contacter Gemini"));
      }
    } catch (error) {
      console.error("Erreur réseau:", error);
      alert("Erreur de connexion au serveur");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Mon Chat Gemini</h1>
      
      <div style={{ border: "1px solid #ccc", height: "400px", overflowY: "scroll", padding: "10px", marginBottom: "10px", borderRadius: "8px", background: "#f9f9f9", color: "#333" }}>
        {messages.length === 0 && <p style={{ color: "#888" }}>Commencez la conversation...</p>}
        {messages.map((msg, index) => (
          <div key={index} style={{ marginBottom: "15px", textAlign: msg.role === "user" ? "right" : "left" }}>
            <div style={{
              display: "inline-block",
              padding: "10px",
              borderRadius: "10px",
              background: msg.role === "user" ? "#007bff" : "#e9e9eb",
              color: msg.role === "user" ? "white" : "black",
              maxWidth: "80% "
            }}>
              <strong>{msg.role === "user" ? "Vous" : "Gemini"}:</strong>
              <p style={{ margin: "5px 0 0" }}>{msg.content}</p>
            </div>
          </div>
        ))}
        {isLoading && <p style={{ color: "#666" }}>Gemini est en train d'écrire...</p>}
      </div>

      <form onSubmit={sendMessage} style={{ display: "flex", gap: "10px" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Écrivez votre message ici..."
          style={{ flex: 1, padding: "10px", borderRadius: "4px", border: "1px solid #ccc", color: "black" }}
        />
        <button 
          type="submit" 
          disabled={isLoading}
          style={{ padding: "10px 20px", background: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
        >
          Envoyer
        </button>
      </form>
    </div>
  );
}