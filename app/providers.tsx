"use client"
// ============================================================================
// 🔑 PONT CLIENT ⟷ SESSION NEXTAUTH
// ============================================================================
// `SessionProvider` doit être un Client Component (NextAuth s'appuie sur le
// Context React) — ce fichier existe uniquement pour isoler ce "use client"
// du RootLayout (app/layout.tsx), qui lui reste un Server Component. C'est ce
// Provider qui rend `useSession()` utilisable depuis n'importe quel composant
// de l'app (ex: dashboard/layout.tsx pour vérifier `totpEnabled`).
import { SessionProvider } from "next-auth/react";

export const NextAuthProvider = ({children }: { children: React.ReactNode }) => {
    return <SessionProvider>{children}</SessionProvider>;
}