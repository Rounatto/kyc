import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google"; // 💡 IMPORT DU PROVIDER GOOGLE
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  providers: [
    // 1. CONNEXION PAR EMAIL / MOT DE PASSE
    CredentialsProvider({
      name: "Connexion",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "test@example.com" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember Me", type: "checkbox" }
      },
      async authorize(credentials): Promise<any> { 
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({ where: { email: credentials.email} });
        if (!user || !user.password) return null; // Si l'utilisateur n'a pas de mot de passe, c'est un compte Google !

        const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
        if (!isPasswordValid) return null;

        return {
          id : user.id,
          email: user.email,
          name: user.fullName,
          companyName: user.companyName,
          image: user.avatarUrl,
          rememberMe: credentials?.rememberMe === "true"
        };
      }
    }),
    // 2. 💡 NOUVEAU : CONNEXION PAR GOOGLE
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    })
  ],
  session: {
    strategy: "jwt" as const,
    maxAge: 15 * 24 * 60 * 60,
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        if (!user.email) return false;

        const existingUser = await prisma.user.findUnique({ where: { email: user.email } });

        if (!existingUser) {
          await prisma.user.create({
            data: {
              email: user.email,
              fullName: user.name || "Google User",
              avatarUrl: user.image,
            }
          });
        }
      }
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      // 1. À la connexion initiale
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.image = user.image;
        token.companyName = (user as any).companyName;
      }
      // 2. 💡 LA PIÈCE MANQUANTE : Quand le frontend demande une mise à jour (ex: changement d'avatar)
      if (trigger === "update" && session?.user) {
        token.name = session.user.name;
        token.image = session.user.image;
        token.companyName = session.user.companyName;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name;
        session.user.image = token.image as string;
        (session.user as any).companyName = token.companyName as string;
      }
      return session;
    }
  },
  pages: {
    signIn: "/login",
  }
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };