// ============================================================================
// 🆕 [PHASE E] CONFIGURATION PLAYWRIGHT — TESTS AUTOMATISÉS
// ============================================================================
// Pourquoi ce fichier existe : le projet n'avait AUCUN test. Trois semaines de
// corrections de sécurité, et rien ne garantissait qu'une seule d'entre elles
// ne serait pas silencieusement rouverte lors d'une refonte. Un test qui passe
// au rouge est un signal immédiat ; une faille rouverte sans test se découvre
// en production.
//
// Playwright pilote un vrai navigateur et fait de vraies requêtes HTTP : il
// teste l'application telle qu'un utilisateur (ou un attaquant) la rencontre,
// pas telle que le code prétend fonctionner.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    // Où Playwright cherche les fichiers de test.
    testDir: "./tests",

    // ⚠️ EXÉCUTION SÉQUENTIELLE, PAS PARALLÈLE (`fullyParallel: false`).
    //
    // C'est contre-intuitif — le parallèle est plus rapide — mais indispensable
    // ici : plusieurs de nos routes sont protégées par un rate limiting strict
    // (3 demandes/heure sur forgot-password, 10/minute sur passkey-login).
    // Lancer les tests en parallèle déclencherait ces limites, et des tests
    // parfaitement corrects échoueraient avec un 429. Un test qui échoue au
    // hasard est pire qu'un test absent : on finit par l'ignorer.
    fullyParallel: false,
    workers: 1,

    // Interdit de committer un `test.only(...)` oublié, qui ferait passer la
    // CI au vert en n'exécutant qu'un seul test.
    forbidOnly: !!process.env.CI,

    // En CI uniquement : une seconde tentative en cas d'échec. Les tests
    // réseau connaissent des ratés ponctuels ; en local on veut au contraire
    // voir l'échec tout de suite.
    retries: process.env.CI ? 1 : 0,

    // Rapport HTML consultable après coup, avec captures d'écran des échecs.
    reporter: [["html", { open: "never" }], ["list"]],

    use: {
        // Toutes les URLs des tests sont relatives à cette base : on écrit
        // `page.goto("/dashboard")` au lieu de répéter le domaine partout.
        baseURL: "http://localhost:3000",

        // Enregistre une trace rejouable quand un test rate — bien plus utile
        // qu'un message d'erreur pour comprendre ce qui s'est réellement passé.
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },

    projects: [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ],

    // ========================================================================
    // DÉMARRAGE AUTOMATIQUE DU SERVEUR
    // ========================================================================
    // Playwright lance l'application avant les tests et l'arrête après.
    //
    // 💡 `reuseExistingServer: true` en local : si tu as déjà `npm run dev` qui
    // tourne dans un terminal, Playwright l'utilise au lieu d'en démarrer un
    // second (qui échouerait, le port étant occupé). En CI, il n'y a jamais de
    // serveur préexistant, donc on force le démarrage.
    //
    // ⚠️ On teste contre le serveur LOCAL, jamais contre la production. Tester
    // en prod déclencherait de vrais envois d'emails, polluerait les données
    // réelles, et t'obligerait à déployer avant de pouvoir vérifier quoi que
    // ce soit.
    webServer: {
        // 🆕 [CI] Commande différente selon l'environnement.
        //
        // En local : `npm run dev` (démarrage rapide, rechargement à chaud).
        //
        // En CI : `npm start`, qui sert la version COMPILÉE. Deux raisons —
        //   1. On teste alors exactement ce qui partirait en production, pas une
        //      version de développement plus permissive.
        //   2. `npm run dev` passe par scripts/dev-safe.js, un script maison dont
        //      le comportement sur un serveur vierge est incertain. En CI, on
        //      veut le chemin le plus prévisible possible.
        //
        // ⚠️ Cela impose que le workflow lance `npm run build` AVANT les tests,
        // sinon `npm start` ne trouverait rien à servir.
        command: process.env.CI ? "npm start" : "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        // Le démarrage d'un serveur Next.js à froid peut être long.
        timeout: 180 * 1000,
    },
});