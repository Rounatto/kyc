// ============================================================================
// 🆕 [PHASE B] 🚦 RATE LIMITING — LIMITATION DU NOMBRE DE REQUÊTES
// ============================================================================
// Pourquoi ce fichier existe : sans limite, n'importe qui peut appeler une
// route API en boucle, des milliers de fois par seconde. Concrètement, sur
// TrustVerify, ça permettait :
//   - de casser un code OTP à 6 chiffres par force brute (1 000 000 de
//     combinaisons, testables tant que le code n'a pas expiré) ;
//   - d'inonder la boîte mail d'une victime en réclamant des OTP en boucle
//     (harcèlement + quota Gmail brûlé + réputation d'expéditeur dégradée) ;
//   - de vider le budget Gemini via /api/chat ;
//   - de cartographier les comptes existants (énumération).
//
// ⚠️ POURQUOI UN SERVICE EXTERNE (Redis) ET PAS UN SIMPLE COMPTEUR EN MÉMOIRE :
// sur Vercel, l'application tourne en "serverless". Chaque requête peut être
// traitée par une instance FRAÎCHE, sans aucun souvenir de la précédente. Un
// compteur stocké dans une variable JavaScript serait donc systématiquement
// remis à zéro — totalement inutile. Il faut un compteur PARTAGÉ, accessible
// depuis n'importe quelle instance : c'est le rôle de Redis (Upstash propose
// une version conçue pour le serverless, interrogeable en HTTP).
//
// Variables d'environnement requises :
//   UPSTASH_REDIS_REST_URL   — fournie par Upstash (onglet REST API)
//   UPSTASH_REDIS_REST_TOKEN — idem
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

// ----------------------------------------------------------------------------
// CONNEXION REDIS — initialisée UNE SEULE FOIS, à la demande
// ----------------------------------------------------------------------------
// `Redis.fromEnv()` lit automatiquement les deux variables d'environnement
// ci-dessus. On l'appelle de façon PARESSEUSE (au premier usage, pas au
// chargement du module) pour deux raisons :
//   1. si les variables sont absentes, l'erreur survient au moment de l'appel
//      et peut être rattrapée — plutôt que de faire planter le module entier
//      au démarrage, ce qui casserait la route même pour les requêtes légitimes ;
//   2. les instances serverless réutilisent le module entre deux requêtes
//      "à chaud" : on évite de recréer un client à chaque appel.
let redisClient: Redis | null = null;

function getRedis(): Redis {
    if (!redisClient) {
        redisClient = Redis.fromEnv();
    }
    return redisClient;
}

// ----------------------------------------------------------------------------
// LES LIMITEURS — un par usage, avec des seuils adaptés à la sensibilité
// ----------------------------------------------------------------------------
// Algorithme retenu : "sliding window" (fenêtre glissante).
//
// La différence avec une fenêtre fixe est importante. Avec une fenêtre FIXE de
// 15 minutes, un attaquant peut envoyer 5 requêtes à 14min59 puis 5 autres à
// 15min01 — soit 10 requêtes en 2 secondes, alors qu'on croyait en autoriser 5.
// La fenêtre GLISSANTE regarde toujours les 15 dernières minutes réelles à
// partir de maintenant, ce trou est donc fermé.
//
// `prefix` sert à ranger les compteurs dans des espaces séparés côté Redis :
// sans lui, le compteur du login et celui de l'OTP se mélangeraient pour une
// même IP.
//
// `analytics: false` — Upstash peut enregistrer des statistiques d'usage, mais
// chaque enregistrement consomme des commandes Redis supplémentaires. Sur le
// plan gratuit, autant les réserver au rate limiting lui-même.

// Vérification d'un code OTP, par IP : le plus critique (brute-force direct).
export const otpVerifyByIpLimiter = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(5, "15 m"),
    prefix: "rl:otp-verify:ip",
    analytics: false,
});

// Vérification d'un code OTP, par EMAIL : contre l'attaque distribuée (même
// cible, IP différentes à chaque tentative — la limite par IP ne verrait rien).
//
// ⚠️ COMPROMIS ASSUMÉ : cette limite peut être déclenchée volontairement par un
// tiers pour empêcher quelqu'un de finaliser son inscription. On la règle donc
// plus large que la limite par IP : 10 tentatives sur 15 minutes est très
// confortable pour un utilisateur réel (le code n'est valable que 10 minutes),
// tout en rendant les 1 000 000 de combinaisons totalement hors de portée.
export const otpVerifyByEmailLimiter = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(10, "15 m"),
    prefix: "rl:otp-verify:email",
    analytics: false,
});

// Demande d'un nouveau code OTP (app/api/register) : chaque appel DÉCLENCHE UN
// ENVOI D'EMAIL réel. Limite volontairement basse — c'est ce qui empêche
// d'utiliser TrustVerify comme outil de harcèlement par email.
export const otpRequestLimiter = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(3, "1 h"),
    prefix: "rl:otp-request",
    analytics: false,
});

// Tentatives de connexion : contre le brute-force de mot de passe.
export const loginLimiter = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(10, "15 m"),
    prefix: "rl:login",
    analytics: false,
});

// Chat IA : chaque message a un coût réel facturé par Google. Limite plus
// permissive (c'est un usage légitime et interactif), mais bornée.
export const chatLimiter = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(20, "1 m"),
    prefix: "rl:chat",
    analytics: false,
});

// Démarrage d'une connexion par passkey : cette route révèle si un email existe
// (404 si inconnu), elle est donc utilisable pour cartographier les comptes.
export const passkeyLoginLimiter = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(10, "1 m"),
    prefix: "rl:passkey-login",
    analytics: false,
});

// ----------------------------------------------------------------------------
// EXTRACTION DE L'ADRESSE IP DU VISITEUR
// ----------------------------------------------------------------------------
// Sur Vercel, la requête ne vient pas directement du visiteur : elle traverse
// le réseau de Vercel (un "proxy"). L'IP réelle est donc transmise dans l'en-tête
// `x-forwarded-for`, qui contient une liste séparée par des virgules :
//     "IP-du-visiteur, IP-proxy-1, IP-proxy-2"
// La PREMIÈRE de la liste est celle du visiteur d'origine : c'est celle qu'on veut.
//
// ⚠️ Cet en-tête est falsifiable en théorie (le client peut l'envoyer lui-même),
// mais sur Vercel l'infrastructure le réécrit avant d'atteindre notre code — on
// peut donc s'y fier ici. Ce ne serait PAS le cas sur un serveur exposé
// directement à Internet sans proxy de confiance devant.
export function getClientIp(req: Request): string {
    const forwardedFor = req.headers.get("x-forwarded-for");
    if (forwardedFor) {
        return forwardedFor.split(",")[0].trim();
    }
    // Repli : en développement local, cet en-tête est souvent absent.
    return req.headers.get("x-real-ip") ?? "unknown";
}

// ----------------------------------------------------------------------------
// LE GARDE — même logique d'utilisation que `enforceRole` dans lib/rbac.ts
// ----------------------------------------------------------------------------
// Retourne `null` si la requête peut passer, ou une réponse 429 toute prête à
// renvoyer si le quota est dépassé. Ce format permet d'écrire dans une route :
//
//     const limited = await enforceRateLimit(monLimiteur, identifiant);
//     if (limited) return limited;
//
// ...soit deux lignes, cohérentes avec le style déjà en place dans le projet.
//
// ⚠️ CHOIX IMPORTANT — "FAIL-OPEN" EN CAS DE PANNE REDIS :
// si Redis est injoignable ou mal configuré, cette fonction LAISSE PASSER la
// requête au lieu de la bloquer. C'est le comportement standard pour du rate
// limiting : un incident sur Redis ne doit pas empêcher tous les utilisateurs
// légitimes de se connecter. La contrepartie est réelle et assumée : pendant
// une panne Redis, la protection anti-brute-force disparaît. L'erreur est donc
// journalisée bruyamment pour être détectée.
// Pour inverser ce choix (refuser plutôt que laisser passer), il suffit de
// renvoyer une réponse 503 dans le bloc `catch` ci-dessous.
export async function enforceRateLimit(
    limiter: Ratelimit,
    identifier: string
): Promise<NextResponse | null> {
    try {
        // `limit()` incrémente le compteur ET renvoie l'état actuel :
        //   success   — la requête est-elle autorisée ?
        //   limit     — le plafond configuré
        //   remaining — combien de requêtes il reste dans la fenêtre
        //   reset     — horodatage (en millisecondes) de libération du quota
        const { success, limit, remaining, reset } = await limiter.limit(identifier);

        if (success) {
            return null; // feu vert
        }

        // Nombre de secondes à attendre avant de pouvoir réessayer.
        // Math.max(..., 1) évite d'annoncer "réessayez dans 0 seconde".
        const retryAfterSeconds = Math.max(
            Math.ceil((reset - Date.now()) / 1000),
            1
        );

        // 429 = "Too Many Requests", le code HTTP prévu pour ce cas précis.
        // Les en-têtes suivent la convention utilisée par GitHub, Stripe, etc. :
        // ils permettent au frontend d'afficher "réessayez dans X secondes"
        // plutôt qu'un message d'erreur brut et déroutant.
        return NextResponse.json(
            {
                error: `Trop de tentatives. Veuillez réessayer dans ${retryAfterSeconds} seconde(s).`,
                retryAfter: retryAfterSeconds,
            },
            {
                status: 429,
                headers: {
                    "Retry-After": String(retryAfterSeconds),
                    "X-RateLimit-Limit": String(limit),
                    "X-RateLimit-Remaining": String(remaining),
                    "X-RateLimit-Reset": String(reset),
                },
            }
        );
    } catch (error) {
        console.error(
            "[RATE-LIMIT] Redis injoignable — la requête est laissée passer (fail-open) :",
            error
        );
        return null;
    }
}