// ============================================================================
// 🔐 CONFIGURATION NEXTAUTH — POINT D'ENTRÉE UNIQUE DE L'AUTHENTIFICATION
// ============================================================================
// Ce fichier définit TOUTES les façons de se connecter à TrustVerify. Le
// provider "Credentials" gère à lui seul 2 scénarios différents (passkey OU
// mot de passe+2FA) car NextAuth n'autorise qu'un seul provider Credentials —
// on distingue les scénarios en inspectant quels champs sont remplis dans
// `credentials`. Le provider Google gère l'OAuth (scénario 3).
//
// Stratégie de session : "jwt" (pas de table Session en DB) — les infos
// utilisateur (rôle, companyId, plan) sont embarquées dans le token signé,
// synchronisées à chaque connexion/refresh via les callbacks `jwt` et
// `session` en bas de ce fichier.
import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { verifySync } from "otplib"; // Vérifie un code TOTP de façon synchrone (pas d'appel réseau)
import { logSecurityEvent } from "@/lib/logger"; // Piste d'audit : chaque login réussi/échoué est tracé

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Connexion",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember Me", type: "checkbox" },
        passkeyResponse: { label: "Passkey Response", type: "text" },
        totpCode: { label: "2FA Code", type: "text" } 
      },
      async authorize(credentials): Promise<any> { 
        if (!credentials?.email) return null;

        const user = await prisma.user.findUnique({ 
            where: { email: credentials.email },
            include: { passkeys: true } 
        });
        
        if (!user) return null;
        
        const authUser = user as NonNullable<typeof user> & { 
            companyId: string | null; 
            role: string; 
            totpEnabled: boolean; 
            totpSecret: string | null 
        };

        // 🌟 SCÉNARIO 1 : CONNEXION PAR PASSKEY (WebAuthn)
        // Le frontend a déjà appelé /api/auth/passkey/generate-login pour obtenir
        // un "challenge" aléatoire, l'a fait signer par l'appareil (Face ID, empreinte,
        // clé de sécurité...) et renvoie ici la réponse signée à vérifier.
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

                // 📜 AUDIT TRAIL : Succès Biométrique
                if (authUser.companyId) {
                    await logSecurityEvent({
                        action: "LOGIN_SUCCESS",
                        details: "User authenticated successfully via Biometric Passkey.",
                        companyId: authUser.companyId,
                        agentId: user.id
                    });
                }

                return { id: user.id, email: user.email, name: user.fullName, image: user.avatarUrl, companyId: authUser.companyId, role: authUser.role };
            }
            return null;
        }

        // 🌟 SCÉNARIO 2 : CONNEXION PAR MOT DE PASSE (+ 2FA optionnelle)
        if (credentials.password && user.password) {
            const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
            if (!isPasswordValid) return null;

            if (authUser.totpEnabled) {
                // Le frontend envoie un premier POST sans totpCode ; NextAuth relaie
                // cette erreur "2FA_REQUIRED" jusqu'au formulaire de login, qui affiche
                // alors le champ code à 6 chiffres et renvoie une 2e tentative complète.
                if (!credentials.totpCode) throw new Error("2FA_REQUIRED");
                if (!authUser.totpSecret) throw new Error("Erreur de configuration 2FA");

                const { valid: isValidTotp } = verifySync({
                  token: credentials.totpCode,
                  secret: authUser.totpSecret,
                });

                if (!isValidTotp) {
                    // 📜 AUDIT TRAIL : Échec 2FA
                    if (authUser.companyId) {
                        await logSecurityEvent({
                            action: "LOGIN_FAILED",
                            details: "User provided correct password but failed 2FA verification.",
                            companyId: authUser.companyId,
                            agentId: user.id
                        });
                    }
                    throw new Error("INVALID_2FA_CODE"); 
                }
            }

            // 📜 AUDIT TRAIL : Succès Mot de Passe (+ 2FA optionnel)
            if (authUser.companyId) {
                await logSecurityEvent({
                    action: "LOGIN_SUCCESS",
                    details: `User authenticated successfully via Password${authUser.totpEnabled ? " and 2FA" : ""}.`,
                    companyId: authUser.companyId,
                    agentId: user.id
                });
            }

            return { 
                id: user.id, email: user.email, name: user.fullName, image: user.avatarUrl, 
                companyId: authUser.companyId, role: authUser.role, rememberMe: credentials.rememberMe === "true" 
            };
        }

        return null;
      }
    }),
    
    // 🌟 SCÉNARIO 3 : CONNEXION GOOGLE OAUTH
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    })
  ],
  session: { strategy: "jwt" as const, maxAge: 15 * 24 * 60 * 60 },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        if (!user.email) return false;
        const existingUser = await prisma.user.findUnique({ where: { email: user.email } });

        // Première connexion Google jamais vue : on crée automatiquement une
        // nouvelle entreprise ET son compte admin dans la même transaction —
        // pas de formulaire "nom d'entreprise" pour l'OAuth, contrairement au
        // flux email/mot de passe (app/api/register). Le nom est dérivé du
        // nom Google et renommable ensuite dans les Settings.
        if (!existingUser) {
          await prisma.$transaction(async (tx) => {
            const txWithCompany = tx as any;
            const newCompany = await txWithCompany.company.create({
                data: { name: `${user.name || "Google User"} Workspace`, plan: "trial" }
            });
            const newUser = await tx.user.create({
              data: { 
                  email: user.email as string, fullName: user.name || "Google User", avatarUrl: user.image,
                  companyId: newCompany.id, role: "COMPANY_ADMIN"
              }
            });
            
            // 📜 AUDIT TRAIL : Nouveau compte Google
            await txWithCompany.auditLog.create({
                data: {
                    action: "ACCOUNT_CREATED", details: "Company Workspace created via Google OAuth Sign-in.",
                    companyId: newCompany.id, agentId: newUser.id
                }
            });
          });
        } else {
            // 📜 AUDIT TRAIL : Succès Google
            if (existingUser.companyId) {
                await logSecurityEvent({
                    action: "LOGIN_SUCCESS", details: "User authenticated successfully via Google OAuth.",
                    companyId: existingUser.companyId, agentId: existingUser.id
                });
            }
        }
      }
      return true;
    },
    // Le token JWT est la SEULE source de vérité entre les requêtes (pas de
    // session en DB) : on doit donc y recopier manuellement tout ce dont le
    // reste de l'app a besoin (rôle, companyId, plan...). Ce callback tourne
    // à chaque connexion (`user`/`account` définis) ET peut être forcé à se
    // rafraîchir manuellement via `trigger === "update"` (ex: après un
    // changement d'avatar dans les Settings, sans obliger l'utilisateur à se
    // reconnecter).
    async jwt({ token, user, trigger, session, account }) {
    if (account || user) {
        const dbUser = await prisma.user.findUnique({
        where: { email: token.email as string },
        include: { company: { select: { plan: true } } }
        });
        if (dbUser) {
            const typedDbUser = dbUser as typeof dbUser & { companyId?: string | null; role?: string | null };
            token.id = dbUser.id; token.name = dbUser.fullName; token.image = dbUser.avatarUrl;
            token.companyId = typedDbUser.companyId; token.role = typedDbUser.role;          
            token.companyName = (dbUser as any).companyName; token.totpEnabled = (dbUser as any).totpEnabled;
            token.companyPlan = dbUser.company?.plan ?? "trial";
        }
    }
    if (trigger === "update" && session?.user) {
        token.name = session.user.name; token.image = session.user.image;
        token.companyName = session.user.companyName; token.totpEnabled = session.user.totpEnabled;
        token.companyPlan = session.user.companyPlan;
    }
    return token;
    },
    async session({ session, token }) {
    if (token && session.user) {
        session.user.id = token.id as string; session.user.name = token.name; session.user.image = token.image as string;
        (session.user as any).companyId = token.companyId as string; (session.user as any).role = token.role as string;
        (session.user as any).companyName = token.companyName as string; (session.user as any).totpEnabled = token.totpEnabled as boolean;
        (session.user as any).companyPlan = token.companyPlan as string;
    }
    return session;
    }
  },
  pages: { signIn: "/login" }
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };