// ============================================================================
// 🆕 [PHASE E] TESTS DE SÉCURITÉ — LES FAILLES CORRIGÉES NE DOIVENT PAS REVENIR
// ============================================================================
// Chaque test de ce fichier correspond à une VRAIE faille trouvée dans l'audit
// du projet. Ce ne sont pas des tests théoriques : ce sont des sentinelles
// placées exactement là où quelque chose a déjà cassé une fois.
//
// 💡 Ces tests ne nécessitent AUCUNE authentification, et c'est délibéré pour
// un premier lot : pas de compte de test à créer, pas de données à préparer,
// pas d'état à nettoyer entre les exécutions. Ils sont donc stables et
// rapides — et ils couvrent malgré tout les failles les plus graves, qui
// concernaient précisément l'accès NON authentifié.
import { test, expect } from "@playwright/test";

// ============================================================================
// GROUPE 1 — LES ROUTES API DOIVENT REFUSER LES REQUÊTES NON AUTHENTIFIÉES
// ============================================================================
// ⚠️ C'EST LA FAILLE N°1 DE L'AUDIT D'ORIGINE. Ces routes n'avaient aucune
// vérification de session : n'importe qui sur Internet pouvait lister les
// dossiers KYC (noms, CIN, emails, photos de pièces d'identité, selfies), en
// créer, ou approuver n'importe quel dossier.
//
// 💡 On utilise `request` et non `page` : ces tests font des appels HTTP directs,
// sans navigateur. C'est exactement ce que ferait un attaquant avec un script —
// et c'est bien plus rapide qu'ouvrir une page.
test.describe("Routes API protégées", () => {

    test("GET /api/customers refuse une requête sans session", async ({ request }) => {
        const response = await request.get("/api/customers");

        // 401 = non authentifié, 403 = authentifié mais sans les droits.
        // Les deux sont des refus valides ; ce qui compte, c'est que ce ne
        // soit PAS un 200 avec des données dedans.
        expect([401, 403]).toContain(response.status());

        // 🔒 Vérification supplémentaire, et elle est importante : on s'assure
        // qu'aucune donnée client ne fuit dans le corps de la réponse. Un
        // serveur mal configuré pourrait renvoyer un code d'erreur ET les
        // données — le code seul ne prouve rien.
        const body = await response.text();
        expect(body).not.toContain("customerName");
        expect(body).not.toContain("cin");
    });

    test("GET /api/customers/[id] refuse une requête sans session", async ({ request }) => {
        // L'identifiant est inventé : peu importe, le refus doit intervenir
        // AVANT même la recherche en base.
        const response = await request.get("/api/customers/fake-id-for-testing");
        expect([401, 403, 404]).toContain(response.status());
    });

    test("GET /api/dashboard/stats refuse une requête sans session", async ({ request }) => {
        const response = await request.get("/api/dashboard/stats");
        expect([401, 403]).toContain(response.status());
    });

    test("POST /api/chat refuse une requête sans session", async ({ request }) => {
        // Cette route appelle l'API Gemini, qui est FACTURÉE. Sans
        // authentification, n'importe qui pouvait drainer le budget du projet
        // ou s'en servir comme proxy Gemini gratuit.
        const response = await request.post("/api/chat", {
            data: { messages: [{ role: "user", content: "test" }] },
        });
        expect([401, 403]).toContain(response.status());
    });

    test("GET /api/settings/team refuse une requête sans session", async ({ request }) => {
        const response = await request.get("/api/settings/team");
        expect([401, 403]).toContain(response.status());
    });
});

// ============================================================================
// GROUPE 2 — L'ENDPOINT DE MAINTENANCE NE DOIT PLUS EXISTER
// ============================================================================
test.describe("Endpoints supprimés", () => {

    test("/api/fix-scores n'existe plus", async ({ request }) => {
        // ⚠️ CETTE ROUTE ÉTAIT LA PIRE DE TOUTES : un simple GET public, sans
        // aucune authentification, qui réécrivait en boucle TOUTE la table
        // VerificationRequest — toutes entreprises confondues. Un crawler
        // visitant l'URL suffisait à corrompre l'ensemble des données.
        //
        // Ce test existe pour empêcher qu'un copier-coller malheureux ou un
        // retour en arrière dans l'historique ne la ressuscite un jour.
        const response = await request.get("/api/fix-scores");
        expect(response.status()).toBe(404);
    });

    test("Le cron hebdomadaire refuse un appel sans le secret", async ({ request }) => {
        // Sans ce garde-fou, n'importe qui pouvait déclencher l'envoi de tous
        // les rapports : harcèlement par email, quota Gmail brûlé, et fuite
        // d'informations sur les volumes de chaque entreprise.
        const response = await request.get("/api/cron/weekly-report");
        expect(response.status()).toBe(401);
    });
});

// ============================================================================
// GROUPE 3 — ANTI-ÉNUMÉRATION DE COMPTES
// ============================================================================
// Une réponse qui diffère selon qu'un email existe ou non permet de tester des
// milliers d'adresses pour dresser la liste des clients de la plateforme —
// information à valeur commerciale, et préalable classique au phishing ciblé.
test.describe("Anti-énumération de comptes", () => {

    test("passkey/generate-login répond identiquement pour un email inconnu", async ({ request }) => {
        // Cette route répondait 404 quand l'email était inconnu et 200 quand il
        // existait. Elle renvoie désormais un "leurre" : un challenge
        // cryptographique valide, associé à un identifiant de clé fictif dérivé
        // par HMAC — donc stable d'un appel à l'autre, exactement comme le
        // serait un vrai compte.
        const response = await request.post("/api/auth/passkey/generate-login", {
            data: { email: `inconnu-${Date.now()}@exemple-test.com` },
        });

        // 429 accepté : le rate limiting (10/minute) peut se déclencher si les
        // tests sont relancés plusieurs fois d'affilée. Ce n'est pas un échec
        // du test — c'est même une protection qui fonctionne.
        if (response.status() === 429) {
            test.skip(true, "Rate limit atteint — relance dans une minute.");
        }

        // Le point essentiel : plus de 404. Un compte inconnu obtient la même
        // réponse qu'un compte réel.
        expect(response.status()).toBe(200);

        const body = await response.json();
        // La réponse leurre doit contenir un vrai challenge, sans quoi elle
        // serait immédiatement reconnaissable.
        expect(body).toHaveProperty("challenge");
    });

    test("forgot-password ne révèle pas si un email existe", async ({ request }) => {
        // ⚠️ CONTRAINTE DE TEST : cette route est limitée à 3 demandes par
        // heure et par IP, parce que chaque appel envoie un VRAI email. On ne
        // peut donc pas comparer deux réponses (email connu vs inconnu) sans
        // épuiser le quota en deux exécutions.
        //
        // On se contente donc de vérifier le point décisif : un email inconnu
        // reçoit un 200 avec le message générique, jamais un 404. C'est ce 404
        // qui constituait la fuite d'information.
        const response = await request.post("/api/auth/forgot-password", {
            data: { email: `inconnu-${Date.now()}@exemple-test.com` },
        });

        if (response.status() === 429) {
            test.skip(true, "Rate limit atteint — attends une heure ou relance plus tard.");
        }

        expect(response.status()).toBe(200);

        const body = await response.json();
        // Le message est volontairement au conditionnel ("Si un compte
        // existe..."), honnête envers l'utilisateur légitime sans rien
        // confirmer à un attaquant.
        expect(body.message).toBeTruthy();
        expect(body).not.toHaveProperty("error");
    });
});

// ============================================================================
// GROUPE 4 — LES EN-TÊTES DE SÉCURITÉ SONT BIEN ENVOYÉS
// ============================================================================
// Ces en-têtes ne corrigent aucune faille du code : ils réduisent ce qu'un
// attaquant pourrait faire s'il en trouvait une. Il suffit d'une erreur dans
// next.config.ts pour qu'ils disparaissent tous d'un coup, sans que rien ne
// casse visiblement — d'où l'intérêt d'un test.
test.describe("En-têtes de sécurité HTTP", () => {

    test("La page de login envoie les en-têtes attendus", async ({ request }) => {
        const response = await request.get("/login");
        const headers = response.headers();

        // Interdit d'afficher le site dans une iframe : empêche qu'un site
        // pirate superpose un faux bouton au-dessus du dashboard pour faire
        // cliquer un agent sur "Approve Profile" à son insu.
        expect(headers["x-frame-options"]).toBe("DENY");

        // Empêche le navigateur de "deviner" le type d'un fichier — seconde
        // barrière derrière la liste blanche MIME des documents.
        expect(headers["x-content-type-options"]).toBe("nosniff");

        // ⚠️ LE PLUS IMPORTANT DANS CE PROJET : nos URLs signées de documents et
        // nos liens de réinitialisation contiennent des jetons dans leurs
        // paramètres. Sans cet en-tête, l'URL COMPLÈTE — jeton inclus — partait
        // vers tout site tiers visité ensuite. Une fuite parfaitement
        // silencieuse, qu'aucun log n'aurait révélée.
        expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");

        // Le CSP est encore en mode observation (Report-Only) : il signale les
        // violations sans rien bloquer. Le test accepte donc les deux noms
        // d'en-tête, et restera valide le jour où tu passeras en mode strict.
        const csp =
            headers["content-security-policy"] ??
            headers["content-security-policy-report-only"];
        expect(csp).toBeTruthy();
    });
});

// ============================================================================
// GROUPE 5 — PAGES PUBLIQUES ET GESTION DES LIENS INVALIDES
// ============================================================================
test.describe("Pages publiques", () => {

    test("Un lien de réinitialisation sans jeton affiche une erreur claire", async ({ page }) => {
        // Cas réel : certains clients mail tronquent les URLs longues. Sans
        // cette gestion, l'utilisateur voyait un formulaire qui échouerait de
        // toute façon — on lui dit maintenant tout de suite de redemander un lien.
        await page.goto("/reset-password");
        await expect(page.getByText("Invalid Link")).toBeVisible();
    });

    test("La page mot de passe oublié est accessible", async ({ page }) => {
        // Cette page n'existait pas du tout : le lien "Forgot password?" de
        // l'écran de connexion menait à une 404, et un utilisateur ayant oublié
        // son mot de passe était définitivement verrouillé dehors.
        await page.goto("/forgot-password");
        await expect(page.getByRole("heading", { name: /forgot password/i })).toBeVisible();
    });

    test("La page de connexion propose bien les trois méthodes", async ({ page }) => {
        await page.goto("/login");
        await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
        await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
        await expect(page.getByRole("button", { name: /passkey/i })).toBeVisible();
    });
});

// ============================================================================
// GROUPE 6 — LE DASHBOARD EST INACCESSIBLE SANS SESSION
// ============================================================================
test.describe("Protection des pages du dashboard", () => {

    test("Un visiteur non connecté est redirigé vers la connexion", async ({ page }) => {
        // ⚠️ CE TEST EST LE PLUS SUSCEPTIBLE D'ÉCHOUER, et ce serait une VRAIE
        // DÉCOUVERTE plutôt qu'un défaut du test.
        //
        // La protection repose sur proxy.ts, qui utilise `withAuth` de
        // next-auth v4. Or Next.js 16 a remplacé le modèle `middleware.ts` par
        // `proxy.ts`, et next-auth v4 est antérieur à ce changement : sa
        // compatibilité réelle avec le nouveau modèle d'exécution n'a jamais
        // été vérifiée autrement qu'à l'œil.
        //
        // Si ce test échoue, cela signifie que les pages du dashboard sont
        // accessibles sans session — un point resté en suspens depuis l'audit
        // d'origine. Les données resteraient protégées (les routes API, elles,
        // vérifient bien la session — voir groupe 1), mais la coquille de
        // l'interface s'afficherait, ce qui est trompeur et peu professionnel.
        await page.goto("/dashboard");

        // On attend soit une redirection vers /login, soit l'affichage du
        // formulaire de connexion.
        await page.waitForURL(/\/login/, { timeout: 10000 });
        expect(page.url()).toContain("/login");
    });
});