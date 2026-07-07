import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Connexion",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember Me", type: "checkbox" },
        passkeyResponse: { label: "Passkey Response", type: "text" }
      },
      async authorize(credentials): Promise<any> { 
        if (!credentials?.email) return null;

        const user = await prisma.user.findUnique({ 
            where: { email: credentials.email },
            include: { passkeys: true } 
        });
        
        if (!user) return null;
        const authUser = user as NonNullable<typeof user> & { companyId: string | null; role: string };

        // 🌟 SCÉNARIO 1 : L'utilisateur a envoyé une empreinte digitale (Passkey)
        if (credentials.passkeyResponse) {
            if (!user.currentChallenge) throw new Error("Challenge expiré ou invalide");

            const response = JSON.parse(credentials.passkeyResponse);
            
            const passkey = user.passkeys.find(pk => pk.credentialID === response.id);
            if (!passkey) throw new Error("Clé biométrique non reconnue");

            let verification;
            try {
                verification = await verifyAuthenticationResponse({
                    response,
                    expectedChallenge: user.currentChallenge,
                    // 💡 SÉCURITÉ : Variables dynamiques pour la production
                    expectedOrigin: process.env.WEBAUTHN_ORIGIN || "http://localhost:3000",
                    expectedRPID: process.env.WEBAUTHN_RPID || "localhost",
                    credential: {
                        id: passkey.credentialID,
                        publicKey: new Uint8Array(passkey.credentialPublicKey),
                        counter: passkey.counter,
                    },
                    // 💡 SÉCURITÉ : Exigence biométrique stricte restaurée (Standard 9.9/10)
                    requireUserVerification: true, 
                });
            } catch (error) {
                console.error("Erreur crypto:", error);
                throw new Error("Échec de la vérification biométrique");
            }

            if (verification.verified) {
                await prisma.passkey.update({
                    where: { credentialID: passkey.credentialID },
                    data: { counter: verification.authenticationInfo.newCounter }
                });
                await prisma.user.update({
                    where: { id: user.id },
                    data: { currentChallenge: null }
                });

                // 💡 INJECTION B2B
                return { 
                    id: user.id, 
                    email: user.email, 
                    name: user.fullName, 
                    image: user.avatarUrl, 
                  companyId: authUser.companyId, 
                  role: authUser.role 
                };
            }
            return null;
        }

        // 🌟 SCÉNARIO 2 : L'utilisateur a envoyé un Mot de Passe classique
        if (credentials.password && user.password) {
            const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
            if (!isPasswordValid) return null;

            // 💡 INJECTION B2B
            return { 
                id: user.id, 
                email: user.email, 
                name: user.fullName, 
                image: user.avatarUrl, 
              companyId: authUser.companyId, 
              role: authUser.role,
                rememberMe: credentials.rememberMe === "true" 
            };
        }

        return null;
      }
    }),
    
    // 🌟 SCÉNARIO 3 : Connexion Google
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    })
  ],
  session: {
    strategy: "jwt" as const,
    maxAge: 15 * 24 * 60 * 60, // 15 jours
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        if (!user.email) return false;
        const existingUser = await prisma.user.findUnique({ where: { email: user.email } });
        
        if (!existingUser) {
          await prisma.$transaction(async (tx) => {
            const txWithCompany = tx as any;
            const newCompany = await txWithCompany.company.create({
                data: { name: `${user.name || "Google User"} Workspace`, plan: "trial" }
            });
            await tx.user.create({
              data: { 
                  email: user.email as string, 
                  fullName: user.name || "Google User", 
                  avatarUrl: user.image,
                  companyId: newCompany.id,
                  role: "COMPANY_ADMIN"
              }
            });
          });
        }
      }
      return true;
    },
    async jwt({ token, user, trigger, session, account }) {
      if (account || user) {
        // 💡 CORRECTION : On demande à Prisma d'inclure les infos de la table Company
        const dbUser = await prisma.user.findUnique({ 
            where: { email: token.email as string },
        });
        if (dbUser) {
        const typedDbUser = dbUser as typeof dbUser & { companyId?: string | null; role?: string | null };
            token.id = dbUser.id;
            token.name = dbUser.fullName;
            token.image = dbUser.avatarUrl;
        token.companyId = typedDbUser.companyId; 
        token.role = typedDbUser.role;           
            // 💡 CORRECTION : On met le VRAI nom de l'entreprise dans le Token !
        token.companyName = dbUser.companyName;
        }
      }
      
      if (trigger === "update" && session?.user) {
        token.name = session.user.name;
        token.image = session.user.image;
        token.companyName = session.user.companyName; // Mise à jour à chaud
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name;
        session.user.image = token.image as string;
        
        session.user.companyId = token.companyId as string;
        session.user.role = token.role as string;
        // 💡 CORRECTION : On expose enfin l'info au Frontend (UI)
        session.user.companyName = token.companyName as string;
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