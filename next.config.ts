import type { NextConfig } from "next";

// ============================================================================
// 🆕 [PHASE B] EN-TÊTES DE SÉCURITÉ HTTP
// ============================================================================
// Ces en-têtes sont envoyés avec chaque réponse. Ils demandent au NAVIGATEUR
// d'appliquer des protections que le serveur seul ne peut pas garantir : ils ne
// corrigent pas une faille du code, ils réduisent ce qu'un attaquant peut faire
// s'il en trouve une. C'est une couche de défense en profondeur, pas un pansement.
//
// 💡 Ils ne coûtent rien en performance (quelques octets par réponse) et sont
// systématiquement vérifiés lors d'un audit de sécurité.
const securityHeaders = [
    {
        // 🔒 HSTS — force le navigateur à n'utiliser QUE HTTPS sur ce domaine.
        //
        // Le scénario évité : quelqu'un tape "kyc-project-seven.vercel.app" sans
        // "https://". Le navigateur tente HTTP en premier, et cette requête en
        // clair peut être interceptée sur un réseau Wi-Fi public avant même la
        // redirection vers HTTPS. Avec HSTS, le navigateur se souvient qu'il ne
        // doit JAMAIS parler à ce domaine en clair — la redirection ne part même
        // plus.
        //
        // ⚠️ `preload` inscrit le domaine dans une liste intégrée aux navigateurs.
        // C'est très efficace mais quasi irréversible : à ne demander que sur un
        // domaine définitif. Ici on le déclare sans soumettre le domaine à la
        // liste, ce qui est sans risque.
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
    },
    {
        // 🔒 Anti-clickjacking : interdit d'afficher le site dans une iframe.
        //
        // L'attaque évitée : un site pirate charge ton dashboard dans une iframe
        // invisible, superposée à un faux bouton. L'agent croit cliquer sur
        // "Télécharger", mais clique en réalité sur "Approve Profile" de TON
        // interface, avec sa session active. Aucune donnée volée — une décision
        // de conformité falsifiée, ce qui est pire.
        key: "X-Frame-Options",
        value: "DENY",
    },
    {
        // 🔒 Empêche le navigateur de "deviner" le type d'un fichier.
        //
        // Sans ça, un fichier servi en `text/plain` mais contenant du HTML peut
        // être interprété comme du HTML par certains navigateurs — donc exécuté.
        // C'est une seconde barrière derrière notre liste blanche MIME des
        // documents KYC.
        key: "X-Content-Type-Options",
        value: "nosniff",
    },
    {
        // 🔒 Contrôle ce qui est transmis dans l'en-tête `Referer`.
        //
        // ⚠️ PARTICULIÈREMENT IMPORTANT DANS CE PROJET : nos URLs signées
        // contiennent un jeton d'accès dans leurs paramètres, et nos liens de
        // réinitialisation de mot de passe aussi (/reset-password?token=...).
        // Avec une politique permissive, l'URL COMPLÈTE — jeton inclus — serait
        // envoyée à tout site tiers vers lequel l'utilisateur navigue ensuite.
        // Ici, seul le nom de domaine part, jamais le chemin ni les paramètres.
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
    },
    {
        // 🔒 Désactive les fonctionnalités matérielles que le site n'utilise pas.
        // Si une faille XSS survenait malgré tout, elle ne pourrait pas activer
        // le micro ou lire la géolocalisation : le navigateur refuse en amont.
        //
        // 💡 `camera=(self)` est volontairement AUTORISÉ pour notre propre
        // domaine : la détection de vivacité (Phase C) aura besoin d'accéder à
        // la caméra via getUserMedia. Le mettre à `()` casserait ce travail à
        // venir, avec un message d'erreur difficile à relier à ce fichier.
        key: "Permissions-Policy",
        value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
    },
    {
        // 🔒 CSP — l'en-tête le plus puissant : il déclare d'où le navigateur a
        // le droit de charger scripts, images, styles, etc. Une faille XSS
        // devient largement inoffensive si le code injecté ne peut ni se charger
        // ni communiquer avec l'extérieur.
        //
        // ⚠️ VOLONTAIREMENT EN MODE "REPORT-ONLY" : le navigateur SIGNALE les
        // violations dans la console sans RIEN bloquer. C'est délibéré — un CSP
        // trop strict casse une application silencieusement (une image qui ne
        // charge plus, face-api.js qui refuse de démarrer), et le lien avec ce
        // fichier n'est pas évident quand ça arrive.
        //
        // 📋 POUR L'ACTIVER RÉELLEMENT, une fois testé :
        //    1. Utilise l'app quelques jours (créer un dossier, consulter,
        //       facturation, chat) en gardant la console ouverte
        //    2. Note chaque message "Content Security Policy" qui apparaît
        //    3. Ajoute les domaines manquants ci-dessous
        //    4. Renomme la clé en "Content-Security-Policy" (sans -Report-Only)
        key: "Content-Security-Policy-Report-Only",
        value: [
            // Tout ce qui n'est pas explicitement autorisé plus bas est refusé.
            "default-src 'self'",

            // ⚠️ 'unsafe-eval' et 'unsafe-inline' affaiblissent la protection,
            // mais sont ici incontournables : Next.js injecte des scripts inline
            // pour l'hydratation, et face-api.js (TensorFlow.js) compile ses
            // modèles à la volée, ce qui passe par eval.
            "script-src 'self' 'unsafe-eval' 'unsafe-inline'",

            // Tailwind injecte ses styles en ligne.
            "style-src 'self' 'unsafe-inline'",

            // blob: → aperçus locaux du formulaire (URL.createObjectURL)
            // *.supabase.co → documents KYC signés + avatars
            // flagcdn.com → drapeaux du sélecteur de nationalité
            "img-src 'self' data: blob: https://*.supabase.co https://flagcdn.com",

            "font-src 'self' data:",

            // Requêtes sortantes du NAVIGATEUR uniquement. Supabase y figure
            // pour l'envoi direct des documents (PUT vers l'URL signée).
            // 💡 OpenSanctions, Gemini et Upstash sont absents à dessein : ils
            // sont appelés depuis le SERVEUR, jamais depuis le navigateur.
            "connect-src 'self' https://*.supabase.co",

            // TensorFlow.js peut créer des workers via blob:.
            "worker-src 'self' blob:",

            // Double du X-Frame-Options ci-dessus, en version moderne.
            "frame-ancestors 'none'",

            // Empêche l'injection d'une balise <base> qui détournerait tous les
            // liens relatifs de la page vers un domaine pirate.
            "base-uri 'self'",

            // Un formulaire ne peut soumettre que vers notre propre domaine.
            "form-action 'self'",

            // Bloque <object>/<embed> — vecteurs hérités, jamais utilisés ici.
            "object-src 'none'",
        ].join("; "),
    },
];

const nextConfig: NextConfig = {
  // 💡 L'ajout magique : on dit à Next.js de ne pas casser les workers de Tesseract !
  serverExternalPackages: ["tesseract.js"],
  
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'mrizqoqlwcfnwgupuhyl.supabase.co',
      },
    ],
  },

  // 🆕 [PHASE B] Applique les en-têtes ci-dessus à TOUTES les routes.
  // Le motif ":path*" couvre l'intégralité du site — pages et routes API.
  // Aucune exception : une page oubliée serait précisément celle qu'un
  // attaquant chercherait.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;