// ============================================================================
// 🌳 ROOT LAYOUT — ENVELOPPE GLOBALE DE TOUTE L'APPLICATION
// ============================================================================
// S'applique à CHAQUE page (login, register, dashboard...) : police, session
// NextAuth disponible partout via NextAuthProvider (voir providers.tsx), et
// le composant de toasts globaux (Sonner) monté une seule fois ici pour que
// n'importe quel composant enfant puisse déclencher `toast.success(...)`
// sans avoir à remonter son propre `<Toaster />`.
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NextAuthProvider } from "./providers";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KYC Dashboard", // J'ai mis un titre un peu plus pro que "Create Next App" 😉
  description: "Enterprise KYC & Compliance Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // 💡 CORRECTION : suppressHydrationWarning prend deux "p"
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <NextAuthProvider>
          {children}
          
          {/* 💡 LE COMPOSANT GLOBAL DES NOTIFICATIONS */}
          <Toaster richColors closeButton position="top-right" />
        </NextAuthProvider>
      </body>
    </html>
  );
}