import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { verifySync } from "otplib"; // 💡 IMPORT VITAL POUR LE 2FA

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Connexion",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember Me", type: "checkbox" },
        passkeyResponse: { label: "Passkey Response", type: "text" },
        totpCode: { label: "2FA Code", type: "text" } // 💡 On prépare le terrain pour recevoir les 6 chiffres
      },
      async authorize(credentials): Promise<any> { 
        if (!credentials?.email) return null;

        const user = await prisma.user.findUnique({ 
            where: { email: credentials.email },
            include: { passkeys: true } 
        });
        
        if (!user) return null;
        
        // 💡 Typage strict incluant les nouveaux champs de sécurité
        const authUser = user as NonNullable<typeof user> & { 
            companyId: string | null; 
            role: string; 
            totpEnabled: boolean; 
            totpSecret: string | null 
        };

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
                    expectedOrigin: process.env.WEBAUTHN_ORIGIN || "http://localhost:3000",
                    expectedRPID: process.env.WEBAUTHN_RPID || "localhost",
                    credential: {
                        id: passkey.credentialID,
                        publicKey: new Uint8Array(passkey.credentialPublicKey),
                        counter: passkey.counter,
                    },
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
            if (!isPasswordValid) return null; // Mot de passe faux, on rejette.

            // ==========================================================
            // 🛡️ LE MUR 2FA (LE PURGATOIRE)
            // ==========================================================
            if (authUser.totpEnabled) {
                
                // Cas A : Le mot de passe est bon, mais il n'a pas encore envoyé le code 6 chiffres.
                // On bloque la connexion et on avertit le Frontend.
                if (!credentials.totpCode) {
                    throw new Error("2FA_REQUIRED");
                }

                // Cas B : Il a envoyé un code à 6 chiffres, on doit le vérifier.
                if (!authUser.totpSecret) throw new Error("Erreur de configuration 2FA");
                
                const { valid: isValidTotp } = verifySync({
                  token: credentials.totpCode,
                  secret: authUser.totpSecret,
                });

                if (!isValidTotp) {
                    throw new Error("INVALID_2FA_CODE"); // Code faux, on rejette.
                }
            }
            // ==========================================================

            // Si on arrive ici, soit il n'a pas de 2FA, soit son 2FA est valide. On le laisse passer !
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
            token.companyName = (dbUser as any).companyName;
        }
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
        
        (session.user as any).companyId = token.companyId as string;
        (session.user as any).role = token.role as string;
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