import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { verifyAuthenticationResponse } from "@simplewebauthn/server"; // 💡 L'outil qui lit l'empreinte

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Connexion",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember Me", type: "checkbox" },
        passkeyResponse: { label: "Passkey Response", type: "text" } // 💡 NOUVEAU : Le champ secret pour la biométrie
      },
      async authorize(credentials): Promise<any> { 
        if (!credentials?.email) return null;

        const user = await prisma.user.findUnique({ 
            where: { email: credentials.email },
            include: { passkeys: true } 
        });
        
        if (!user) return null;

        // 🌟 SCÉNARIO 1 : L'utilisateur a envoyé une empreinte digitale (Passkey)
        if (credentials.passkeyResponse) {
            if (!user.currentChallenge) throw new Error("Challenge expiré ou invalide");

            const response = JSON.parse(credentials.passkeyResponse);
            
            // On cherche la clé exacte utilisée par l'appareil parmi celles enregistrées
            const passkey = user.passkeys.find(pk => pk.credentialID === response.id);
            if (!passkey) throw new Error("Clé biométrique non reconnue");

            let verification;
            try {
                // NextAuth fait les mathématiques complexes ici
                verification = await verifyAuthenticationResponse({
                    response,
                    expectedChallenge: user.currentChallenge,
                    expectedOrigin: "http://localhost:3000",
                    expectedRPID: "localhost",
                    credential: {
                        id: passkey.credentialID,
                        publicKey: new Uint8Array(passkey.credentialPublicKey),
                        counter: passkey.counter,
                    },
                });
            } catch (error) {
                console.error("Erreur crypto:", error);
                throw new Error("Échec de la vérification biométrique");
            }

            if (verification.verified) {
                // On met à jour la sécurité anti-clonage et on détruit le défi
                await prisma.passkey.update({
                    where: { credentialID: passkey.credentialID },
                    data: { counter: verification.authenticationInfo.newCounter }
                });
                await prisma.user.update({
                    where: { id: user.id },
                    data: { currentChallenge: null }
                });

                return { id: user.id, email: user.email, name: user.fullName, image: user.avatarUrl, companyName: user.companyName };
            }
            return null;
        }

        // 🌟 SCÉNARIO 2 : L'utilisateur a envoyé un Mot de Passe classique
        if (credentials.password && user.password) {
            const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
            if (!isPasswordValid) return null;

            return { 
                id: user.id, 
                email: user.email, 
                name: user.fullName, 
                image: user.avatarUrl, 
                companyName: user.companyName, 
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
    maxAge: 15 * 24 * 60 * 60,
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        if (!user.email) return false;
        const existingUser = await prisma.user.findUnique({ where: { email: user.email } });
        if (!existingUser) {
          await prisma.user.create({
            data: { email: user.email, fullName: user.name || "Google User", avatarUrl: user.image }
          });
        }
      }
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.image = user.image;
        token.companyName = (user as any).companyName;
      }
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