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
// 🆕 [PHASE B] Déchiffrement du secret TOTP stocké en base (AES-256-GCM).
import { decrypt, encrypt, isEncrypted } from "@/lib/crypto";
// 🆕 [PHASE B] Limiteur de tentatives de connexion (Upstash Redis).
import { loginLimiter } from "@/lib/ratelimit";

// ============================================================================
// 🆕 [PHASE B] DURÉES DE SESSION — LE "REMEMBER ME" RENDU FONCTIONNEL
// ============================================================================
// Avant ce correctif, la case "Remember for 15 days" du formulaire de login
// était purement décorative : la valeur `rememberMe` était bien transmise du
// navigateur jusqu'à `authorize()`, mais AUCUN callback ne la lisait ensuite,
// et `session.maxAge` imposait 15 jours à tout le monde — que la case soit
// cochée ou non. La promesse faite à l'utilisateur était donc fausse.
//
// ⚠️ CONTRAINTE TECHNIQUE À CONNAÎTRE : NextAuth v4 ne sait pas faire varier
// la durée de session par utilisateur.
//   - `session.maxAge` est une constante de configuration, lue une seule fois
//     au démarrage : impossible de la personnaliser à la volée.
//   - Surcharger `token.exp` dans le callback `jwt` ne sert à rien non plus :
//     au moment d'encoder le token, NextAuth écrase ce champ avec sa propre
//     valeur dérivée de `maxAge`.
//
// La parade : on gère NOTRE PROPRE date d'expiration dans un champ maison
// (`sessionExpiry`) que NextAuth ignore, et on la vérifie nous-mêmes à chaque
// passage dans le callback `jwt`. `session.maxAge` reste réglé sur la durée
// LA PLUS LONGUE possible (15 jours) : c'est lui qui détermine la durée de vie
// du cookie, et il doit donc couvrir le pire cas. C'est notre vérification
// interne qui coupe plus tôt quand la case n'est pas cochée.
const SESSION_MAX_AGE_SECONDS = 15 * 24 * 60 * 60;      // 15 jours — case cochée
const SESSION_DEFAULT_AGE_SECONDS = 24 * 60 * 60;       // 24 heures — case non cochée

// ============================================================================
// 🆕 [PHASE B] EXTRACTION DE L'IP DANS LE CONTEXTE PARTICULIER DE NEXTAUTH
// ============================================================================
// Pourquoi ne pas réutiliser `getClientIp` de lib/ratelimit.ts : cette
// fonction attend un objet `Request` standard, sur lequel on lit les en-têtes
// avec `.headers.get("...")`. Or l'objet que NextAuth transmet à `authorize()`
// n'est PAS un `Request` : c'est un objet interne simplifié dont `headers` est
// un simple dictionnaire clé/valeur. On y accède donc avec des crochets.
//
// Comme pour l'autre helper : sur Vercel, l'IP réelle du visiteur arrive dans
// l'en-tête `x-forwarded-for`, sous forme de liste séparée par des virgules
// ("IP-visiteur, IP-proxy-1, ..."). La première est celle qui nous intéresse.
function getIpFromAuthRequest(req: any): string {
    const forwardedFor = req?.headers?.["x-forwarded-for"];
    if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
        return forwardedFor.split(",")[0].trim();
    }
    const realIp = req?.headers?.["x-real-ip"];
    if (typeof realIp === "string" && realIp.length > 0) {
        return realIp;
    }
    // Repli : en développement local, ces en-têtes sont souvent absents.
    return "unknown";
}

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
      // 🆕 [PHASE B] Le second paramètre `req` était jusqu'ici ignoré. On le
      // récupère maintenant : c'est la SEULE façon d'obtenir l'adresse IP de
      // l'appelant à l'intérieur de `authorize()`.
      async authorize(credentials, req): Promise<any> { 
        if (!credentials?.email) return null;

        // ====================================================================
        // 🆕 [PHASE B] LIMITE DE TENTATIVES DE CONNEXION (par adresse IP)
        // ====================================================================
        // Sans cette barrière, un script pouvait tester des mots de passe en
        // continu, aussi vite que le serveur pouvait répondre.
        //
        // ⚠️ POURQUOI ON N'UTILISE PAS `enforceRateLimit()` ICI : ce helper
        // renvoie un objet `NextResponse` (une réponse HTTP toute prête). Or
        // `authorize()` n'a pas le droit de renvoyer une réponse HTTP — NextAuth
        // attend soit un utilisateur, soit `null`, soit une exception. On appelle
        // donc le limiteur directement et on lève une erreur, exactement comme
        // le fait déjà le code plus bas avec "2FA_REQUIRED".
        //
        // ⚠️ POURQUOI PAR IP UNIQUEMENT, ET PAS AUSSI PAR EMAIL (contrairement
        // à verify-register) : bloquer par email permettrait à n'importe qui de
        // VERROUILLER VOLONTAIREMENT le compte d'un tiers, simplement en
        // envoyant des mots de passe faux sur son adresse. C'est un déni de
        // service trivial. Sur l'inscription, ce risque est acceptable (au pire
        // on retarde une création de compte) ; sur la connexion, on empêcherait
        // un vrai client d'accéder à son propre espace. La défense contre une
        // attaque distribuée repose ici sur les autres couches : mot de passe
        // de 12 caractères minimum, haché en bcrypt (volontairement lent), et
        // 2FA disponible.
        //
        // 🔒 FAIL-OPEN : si Redis est injoignable, on laisse passer plutôt que
        // de bloquer toutes les connexions du site. Même compromis assumé que
        // dans lib/ratelimit.ts, et journalisé pour être détecté.
        try {
            const clientIp = getIpFromAuthRequest(req);
            const { success } = await loginLimiter.limit(`login:${clientIp}`);
            if (!success) {
                // Ce message remonte jusqu'au formulaire de login, de la même
                // façon que "2FA_REQUIRED" ou "INVALID_2FA_CODE".
                throw new Error("TOO_MANY_ATTEMPTS");
            }
        } catch (rateLimitError: any) {
            // On distingue les deux cas : notre propre blocage doit remonter,
            // une panne Redis ne doit pas empêcher les gens de se connecter.
            if (rateLimitError?.message === "TOO_MANY_ATTEMPTS") {
                throw rateLimitError;
            }
            console.error("[RATE-LIMIT] Redis injoignable sur le login (fail-open) :", rateLimitError);
        }

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

                // 🆕 [PHASE B] `rememberMe` ajouté ici aussi : le formulaire de
                // login envoie la case cochée quel que soit le mode choisi, il
                // n'y a donc aucune raison qu'une connexion par passkey ignore
                // le choix de l'utilisateur alors qu'une connexion par mot de
                // passe le respecte.
                return { 
                    id: user.id, email: user.email, name: user.fullName, image: user.avatarUrl, 
                    companyId: authUser.companyId, role: authUser.role,
                    rememberMe: credentials.rememberMe === "true"
                };
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

                // 🆕 [PHASE B] DÉCHIFFREMENT DU SECRET AVANT VÉRIFICATION
                // Le secret est désormais stocké chiffré (AES-256-GCM). otplib a
                // besoin de la valeur en clair pour recalculer le code attendu,
                // on le déchiffre donc ici, en mémoire, juste le temps du calcul.
                //
                // 🔁 RÉTROCOMPATIBILITÉ : decrypt() renvoie la valeur telle quelle
                // si elle n'est pas au format chiffré — les comptes dont la 2FA a
                // été activée AVANT ce correctif continuent donc de fonctionner
                // sans aucune intervention.
                //
                // 🔒 FAIL-CLOSED : si le déchiffrement échoue (clé changée, donnée
                // corrompue, tag d'authentification invalide), on REFUSE la
                // connexion. On ne laisse jamais passer un login en "sautant" la
                // 2FA sous prétexte qu'on n'a pas pu lire le secret — ce serait
                // exactement le contraire du but recherché.
                let decryptedSecret: string;
                try {
                    decryptedSecret = decrypt(authUser.totpSecret);
                } catch (cryptoError) {
                    console.error("[2FA] Impossible de déchiffrer le secret TOTP :", cryptoError);
                    throw new Error("Erreur de configuration 2FA");
                }

                const { valid: isValidTotp } = verifySync({
                  token: credentials.totpCode,
                  secret: decryptedSecret,
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

                // 🆕 [PHASE B] MIGRATION OPPORTUNISTE DES ANCIENS SECRETS
                // Le code 2FA vient d'être validé, donc le secret déchiffré est
                // forcément correct. Si ce secret était encore stocké en clair
                // (compte créé avant ce correctif), on profite de ce moment pour
                // le rechiffrer silencieusement en base.
                //
                // Pourquoi ici et pas dans un script de migration : ça migre les
                // comptes au fil de l'eau, sans downtime, sans manipuler la base
                // à la main, et sans risque de bloquer un utilisateur (on ne
                // rechiffre QUE des secrets dont on vient de prouver la validité).
                // Une fois tous les comptes passés, la tolérance au clair dans
                // decrypt() pourra être retirée.
                if (!isEncrypted(authUser.totpSecret)) {
                    try {
                        await prisma.user.update({
                            where: { id: user.id },
                            data: { totpSecret: encrypt(decryptedSecret) }
                        });
                        console.log(`🔐 [2FA] Secret TOTP migré vers le chiffrement pour : ${user.email}`);
                    } catch (migrationError) {
                        // Échec non bloquant : la connexion est déjà validée, on ne
                        // pénalise pas l'utilisateur pour une migration ratée. Le
                        // prochain login retentera.
                        console.error("[2FA] Échec de la migration du secret :", migrationError);
                    }
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
  // 🆕 [PHASE B] `maxAge` reste sur la durée LA PLUS LONGUE (15 jours) : cette
  // valeur pilote la durée de vie du cookie de session, elle doit donc couvrir
  // le cas "Remember me coché". La coupure anticipée pour les sessions courtes
  // est assurée par le champ `sessionExpiry` géré dans le callback `jwt`.
  session: { strategy: "jwt" as const, maxAge: SESSION_MAX_AGE_SECONDS },
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
    // 🆕 [PHASE B] Horodatage courant en SECONDES (et non en millisecondes) :
    // c'est l'unité des timestamps standard d'un JWT, on s'y aligne.
    const nowInSeconds = Math.floor(Date.now() / 1000);

    // 🆕 [PHASE B] ÉTAPE 1 — À LA CONNEXION : on fige la date de fin de session
    // Ce bloc ne s'exécute qu'au moment du login (`user` n'est défini que là).
    // On lit le choix de l'utilisateur et on calcule une date d'expiration
    // ABSOLUE, stockée dans le token. Elle ne bougera plus ensuite : la session
    // ne se prolonge donc pas indéfiniment tant que l'utilisateur reste actif.
    if (user) {
        const isCredentialsLogin = account?.provider === "credentials";

        // Pour une connexion Google, il n'existe pas de case à cocher dans le
        // flux OAuth : on ne peut donc pas connaître le souhait de l'utilisateur.
        // On applique la durée longue, ce qui correspond au comportement en
        // place avant ce correctif (aucune régression pour les comptes Google).
        const wantsLongSession = isCredentialsLogin
            ? (user as any).rememberMe === true
            : true;

        (token as any).sessionExpiry =
            nowInSeconds + (wantsLongSession ? SESSION_MAX_AGE_SECONDS : SESSION_DEFAULT_AGE_SECONDS);
    }

    // 🆕 [PHASE B] ÉTAPE 2 — À CHAQUE REQUÊTE : on fait respecter cette date
    // NextAuth ne connaît pas notre champ `sessionExpiry`, c'est donc à nous de
    // le vérifier. Passé le délai, on renvoie un token VIDE : le callback
    // `session` juste en dessous ne trouvera plus d'`id` à recopier, la session
    // sera donc inexploitable et `enforceRole` rejettera toutes les requêtes
    // protégées avec un 401.
    const sessionExpiry = (token as any).sessionExpiry as number | undefined;
    if (sessionExpiry && nowInSeconds > sessionExpiry) {
        return {};
    }

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
    // 🆕 [PHASE B] Garde-fou : si le token a été vidé par l'expiration ci-dessus,
    // il n'a plus d'`id`. On sort sans rien recopier, pour ne pas produire une
    // session à moitié remplie qui pourrait tromper un appelant peu regardant.
    if (!token?.id) {
        return session;
    }

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