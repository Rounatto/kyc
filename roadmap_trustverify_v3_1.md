# 🛡️ TRUSTVERIFY — AUDIT COMPLET V3 & ROADMAP VERS 10/10
### Re-vérification intégrale, commit `5009a71` — 105 commits relus, 28 routes API, chaque fichier lu

---

## 📊 NOTE GLOBALE HONNÊTE : **7.0 / 10**

Progression depuis la V2 (6.8) : **+0.2**. Je suis transparent sur pourquoi c'est seulement +0.2 malgré ton travail : les corrections faites depuis (suppression de `fix-scores`, protection du cron, fix Zod, `.env.example`) étaient les tâches **rapides** de la Phase A. Pendant ce temps, en relisant TOUT en profondeur, j'ai découvert une **faille critique qui était là depuis le début** mais que je n'avais jamais inspectée : `/api/chat` est **grand ouvert sans authentification**. Cette découverte compense une partie des gains. Et surtout, les gros morceaux (liveness, rate limiting, biométrie côté serveur, chiffrement TOTP) ne sont pas encore commencés.

**Traduction simple :** ton socle est excellent, mais tu n'as pas encore attaqué ce qui sépare un "très bon projet étudiant" d'un "produit international". C'est normal, c'est la suite du plan. Tu es sur la bonne trajectoire.

### Détail par axe

| Axe | Note | Commentaire honnête |
|---|---|---|
| **Architecture & code** | 8.5/10 | Multi-tenant propre, RBAC réutilisable, transactions atomiques, flux d'invitation par token bien conçu. Au-dessus de beaucoup de vrais SaaS. |
| **Sécurité** | 6/10 | Gros progrès (auth, isolation, IDOR corrigé, 2FA, OTP). Mais chat ouvert, biométrie spoofable, secret TOTP en clair, zéro rate limiting, injection HTML mails. Trop de trous pour un "sécurisé". |
| **Fonctionnalités** | 7.5/10 | Très riche : KYC, Stripe, notifications, team, API keys, invitations, audit. Mais liveness absent et clés API inutilisables (pas d'endpoint public). |
| **UI/UX** | 7.5/10 | Dynamique, dette statique éliminée. Manque i18n, accessibilité, états de chargement soignés. |
| **Fiabilité / production** | 5/10 | **Zéro test, zéro CI, aucun README, logs `console.log` avec PII.** C'est ce qui plombe le plus. |
| **Conformité KYC réelle** | 5.5/10 | Vraie intégration OpenSanctions + audit trail sérieux. Mais liveness absent, mono-document (CIN TN), biométrie contournable, pas de monitoring continu. |

---

## ✅ CE QUI EST CORRIGÉ ET SOLIDE (vérifié dans le code)

Crédit honnête, c'est du vrai travail de qualité :

- ✅ **`/api/fix-scores` supprimé** (commit `9f9eb32`) — la faille béante est fermée.
- ✅ **Cron protégé** par `CRON_SECRET` (commit `880e197`) — vérifié, le check est bien avant toute requête DB.
- ✅ **Bug Zod corrigé** (`.issues`) partout (commit `a1f7c5e`) — aucune occurrence obsolète restante.
- ✅ **`.env.example` créé et documenté** (commit `5009a71`).
- ✅ **Auth serveur** (`enforceRole`) sur toutes les routes sensibles.
- ✅ **Isolation multi-tenant** (`companyId`) propagée partout — vrai cloisonnement B2B.
- ✅ **IDOR corrigé** sur `customers/[id]` — GET et PATCH filtrent par `companyId`, un agent de l'entreprise A ne peut pas toucher les dossiers de B.
- ✅ **Identité agent dérivée de la session** — l'audit log n'est plus falsifiable par le body.
- ✅ **WebAuthn** utilise les variables d'env (plus de `localhost` en dur).
- ✅ **Vérification email par OTP** à l'inscription.
- ✅ **RBAC** (`COMPANY_ADMIN` / `COMPANY_AGENT`) avec masquage de tabs.
- ✅ **2FA TOTP** fonctionnel (QR code, lock-out MFA).
- ✅ **Flux d'invitation d'agent** (`setup`) — token cryptographique 64 caractères, usage unique, expiration 24h, bcrypt 12 rounds. **Très bien fait.**
- ✅ **Clés API** : composant dynamique, génération serveur, et le listing GET **n'expose jamais** la clé (bon réflexe `select`).
- ✅ **Notifications temps réel**, **Stripe billing** (webhook avec vérification de signature), **NotifSetting** persisté.

---

## 🚨 FAILLES ENCORE OUVERTES (classées par gravité)

### 🔴🔴 CRITIQUE — à régler en priorité absolue

#### C1. `/api/chat` est GRAND OUVERT, sans aucune authentification *(NOUVELLE DÉCOUVERTE)*
> ✅ **STATUT : CORRIGÉ** (2026-07-20) — `enforceRole` ajouté, modèle renommé `gemini-2.5-flash`, validation Zod du body, `error.message` ne fuite plus au client, `systemInstruction` de cadrage ajoutée. Code modifié localement, **commit en attente**. Rate limiting toujours absent (voir H4) : un utilisateur connecté légitime peut encore spammer la route.

`app/api/chat/route.ts` n'a **aucun** `getServerSession`, **aucun** `enforceRole`. N'importe qui sur Internet peut envoyer des requêtes à cet endpoint et :
- **utiliser ton API Gemini gratuitement sur ta facture** (drainage de coût — un attaquant peut faire tourner des milliers de requêtes),
- se servir de ton endpoint comme **proxy Gemini gratuit** pour ses propres besoins,
- **faire dire n'importe quoi à "ton" assistant** (le message utilisateur brut part directement à Gemini, sans system prompt ni garde-fou → risque réputationnel).

En plus, le modèle est nommé `"gemini-3.5-flash"` — **ce modèle n'existe pas** (les modèles Gemini sont `gemini-2.5-flash`, `gemini-2.0-flash`, etc.), donc ton chat est probablement **cassé** (erreur 500) en ce moment même. Et l'endpoint renvoie `error.message` au client (fuite d'info) et plante si `messages` est vide (pas de validation d'entrée).

**Correctif :** ajouter `enforceRole` + rate limiting + corriger le nom de modèle + valider l'entrée + system prompt de cadrage + ne pas fuiter `error.message`.

#### C2. Le score biométrique est contrôlé par le client *(TOUJOURS OUVERT)*
`app/api/customers/route.ts` : `biometricScore: z.number()` est pris **du body** de la requête et utilisé directement pour la décision (`< 60` = échec). Le serveur ne recalcule **jamais** rien. Un attaquant intercepte la requête, met `biometricScore: 99.9`, et tout dossier passe "Vérifié" sans la moindre photo. **Ça invalide la valeur probante de TOUS les badges "Vérifié" de la plateforme.**

#### C3. Aucune détection de vivacité (liveness) *(TON INTUITION — 100% CORRECTE)*
Le selfie est un **upload de fichier** (`selfieInputRef`, `handleFileChange`), pas une capture caméra live. Donc on peut uploader une **photo LinkedIn/Facebook** de la cible et passer la vérification. Aucune preuve que la personne était physiquement présente et vivante. C'est LE standard n°1 chez Sumsub/Onfido/Veriff/Persona. (Détails et plan complet en section dédiée plus bas.)

*(Confirmation supplémentaire — passe de documentation, commits `91d2345`→`0b6eaaf`) :* aucune trace de `getUserMedia`/`<video>` nulle part dans le code — la capture caméra live n'existe à aucun stade. Pire, l'écran de décision agent affiche cette photo uploadée sous le libellé **« Live Selfie »**, un libellé trompeur qui fait croire (à l'agent, et dans un audit externe) qu'une preuve de vie a été apportée alors qu'il ne s'agit que d'un fichier importé. **Fix rapide indépendant du gros chantier liveness :** renommer ce libellé (ex. « Uploaded Selfie ») en attendant l'implémentation réelle — 5 minutes de travail qui évitent de mentir involontairement sur la fiabilité du contrôle.

---

### 🟠 HAUTE — à régler avant tout usage réel

#### H1. Brute-force possible sur l'OTP *(TOUJOURS OUVERT)*
`verify-register/route.ts` : `if (otpRecord.code !== otpCode)` — **aucun compteur de tentatives**. Code à 6 chiffres = 1 000 000 combinaisons, brute-forçable tant que le code n'a pas expiré (10 min). Il faut : compteur de tentatives (blocage après 5 échecs) + rate limiting sur cette route.

#### H2. L'OTP est généré avec `Math.random()` *(NOUVELLE DÉCOUVERTE)*
`register/route.ts` : `Math.floor(100000 + Math.random() * 900000)`. `Math.random()` n'est **pas cryptographiquement sûr** — son générateur (V8) est prédictible : à partir de quelques sorties observées, on peut prédire les suivantes. Pour un code de sécurité, c'est une faiblesse réelle. **Fix :** `crypto.randomInt(100000, 1000000)`.

#### H3. Le secret TOTP est stocké EN CLAIR *(TOUJOURS OUVERT)*
`totp/verify/route.ts` : `totpSecret: secret` écrit directement en base sans chiffrement. Si la base fuite (dump, backup volé, injection ailleurs), **tous les 2FA de tous les utilisateurs sont cassés instantanément**. Doit être chiffré au repos (AES-256-GCM, clé en env).

#### H4. Aucun rate limiting nulle part *(TOUJOURS OUVERT)*
Confirmé : zéro rate limiting sur login, register, envoi OTP, vérification OTP, chat, passkey-login. Conséquences : brute-force (H1), spam d'emails OTP (email bombing + coût), abus du chat (C1), énumération de comptes. **Fix global :** `@upstash/ratelimit` + Upstash Redis (gratuit, compatible Vercel).

#### H5. Injection HTML dans les emails *(A4 PAS ENCORE FAIT)*
`lib/mail.ts` : `${name}`, `${customerName}`, `${actionBy}` interpolés bruts dans le HTML sur 5+ templates, sans échappement. Un `customerName` contenant du HTML/JS malveillant part dans un email signé depuis ton domaine → phishing utilisant ta réputation. **Fix :** fonction `escapeHtml()` appliquée à toute donnée utilisateur.

#### H6. Clés API stockées en clair + inutilisables *(TOUJOURS OUVERT)*
`apikeys/route.ts` : `key: rawApiKey` — la clé complète `tv_live_...` est stockée telle quelle. Une fuite de base = toutes les clés clients exposées. De plus, **aucun endpoint n'accepte ces clés en entrée** : elles ne servent à rien (pas de vraie API B2B). **Fix :** stocker un hash SHA-256 + préfixe affichable, et créer l'endpoint public authentifié par clé.

#### H7. IDOR sur `DELETE /api/settings/security/sessions` *(NOUVELLE DÉCOUVERTE — passe de documentation)*
La route ne vérifie pas que la session ciblée par l'ID reçu appartient à l'appelant (ni même à son entreprise). **N'importe quel utilisateur connecté — potentiellement d'une entreprise différente — peut donc déconnecter de force la session de n'importe qui d'autre** en devinant/énumérant un ID de session. C'est le même type de rupture de cloisonnement multi-tenant que l'IDOR déjà corrigé sur `customers/[id]` (voir "CE QUI EST CORRIGÉ ET SOLIDE" plus haut), mais ici sur les sessions : un vecteur de déni de service ciblé (éjecter un admin en pleine action, empêcher un agent de se reconnecter). Classé Haute plutôt que Critique car l'impact reste une déconnexion forcée, pas une fuite de données KYC. **Fix :** filtrer le `where` Prisma par `userId: guard.userId` dérivé de la session serveur — jamais par le seul ID reçu du client.

---

### 🟡 MOYENNE

#### M1. Aucun header de sécurité *(NOUVELLE CONFIRMATION)*
`next.config.ts` n'a ni CSP, ni HSTS, ni X-Frame-Options, ni X-Content-Type-Options, ni Referrer-Policy, ni Permissions-Policy. **Fix :** bloc `headers()` dans `next.config.ts`.

#### M2. Révocation de session cosmétique *(TOUJOURS OUVERT)*
`session: { strategy: "jwt", maxAge: 15j }`. Le JWT est auto-suffisant : "révoquer" une session ne tue pas le vrai token que l'autre appareil possède (valide jusqu'à 15 jours). **Fix :** stratégie `database` avec l'adaptateur Prisma, ou `sessionId` vérifié à chaque requête.

#### M3. `backupCodes` jamais générés *(TOUJOURS OUVERT)*
Le champ existe dans le schéma mais rien ne le remplit. Un utilisateur qui perd son téléphone est **définitivement verrouillé dehors**. **Fix :** générer 10 codes à usage unique (hashés) à l'activation du 2FA.

#### M4. Énumération de comptes et d'entreprises *(TOUJOURS OUVERT)*
`register/route.ts` répond différemment si l'email existe (400) vs OTP envoyé, et révèle le nom des entreprises déjà inscrites (409). Permet de cartographier tes clients. Idem `passkey/generate-login` (404 si email inconnu). **Fix :** réponses uniformes.

#### M5. Chat : pas de validation d'entrée, fuite d'erreur, pas de garde-fou *(inclus dans C1)*

---

### 🟢 BASSE / POLISH

- **B1.** Upload avatar sans validation MIME (un SVG avec JS embarqué passerait → XSS). Rejeter `image/svg+xml`, vérifier la taille serveur.
- **B2.** Challenge WebAuthn sans TTL (`currentChallenge` n'expire jamais).
- **B3.** Changement de mot de passe plante pour un compte Google-only (`user.password` null → `bcrypt.compare` throw).
- **B4.** OpenSanctions sans timeout sur le `fetch` + fallback "liste de mots en dur" qui flaggerait un vrai "Vladimir" innocent (préférer fail-closed → "revue manuelle").
- **B5.** Incohérence taille fichier : client 5 Mo vs uploadthing serveur 4 Mo.
- **B6.** `console.log` de données personnelles (CIN, emails) → logging structuré `pino` avec redaction.
- **B7.** Boucle N+1 dans `dashboard/stats` (14 requêtes séquentielles → 1 agrégat).
- **B8.** *(passe de documentation)* Liens/boutons morts sur la landing page : "Start Free Trial", le menu hamburger mobile, les ancres `#solutions`/`#pricing`/`#resources` — aucun n'est câblé.
- **B9.** *(passe de documentation)* Pages référencées mais inexistantes : `/forgot-password`, `/privacy-policy`, `/terms-of-service` — 404 garantie si un lien y mène un jour.
- **B10.** *(passe de documentation)* Barre de recherche du header principal (`header.tsx`) purement décorative — pas de `value`/`onChange` (celle de l'annuaire clients, elle, fonctionne réellement).
- **B11.** *(passe de documentation)* Icône "Eye" sur les clés API et bouton "Contact Sales" — sans handler, décoratifs.
- **B12.** *(passe de documentation)* Incohérences frontend ⟷ backend : le filtre "1y" du sélecteur dashboard n'est reconnu par aucune branche de l'API (retombe silencieusement sur 30 jours) ; `trends.pendingDelta` est lu côté client mais jamais renvoyé par l'API ; le badge "Security Standard: SHA-256 / Bcrypt" affiche un algorithme (SHA-256) qui n'est en réalité pas utilisé (seul bcrypt l'est) ; `SecurSetting.tsx` affiche un faux fallback de session codé en dur ("Windows 11 Workstation") au lieu de gérer proprement l'absence de données réelles.

---

## 🌍 COMPARAISON AVEC LES LEADERS MONDIAUX (Sumsub, Onfido, Persona, Veriff, Jumio)

| Capacité | Les leaders | TrustVerify aujourd'hui | Écart |
|---|---|---|---|
| Liveness (active + passive) | Standard n°1 | ❌ Absent (upload de photo) | **Critique** |
| Biométrie serveur non contournable | Systématique | ❌ Score client | **Critique** |
| Anti-injection / anti-deepfake | Front de bataille 2026 | ❌ Absent | Élevé |
| Multi-documents / 200+ pays / MRZ | Des milliers de types | 🟡 CIN TN uniquement | Élevé |
| API B2B + webhooks signés (HMAC) | Cœur du produit | 🟡 Clés générées mais inutilisables | Élevé |
| Monitoring continu post-KYC | Standard | ❌ Contrôle unique à l'inscription | Moyen |
| Rate limiting / anti-abus | Systématique | ❌ Absent | Élevé |
| Tests automatisés / CI | Obligatoire | ❌ 0% | Élevé |
| Résidence des données / RGPD | Argument de vente | ❌ Aucune politique | Moyen |
| Screening AML/PEP | Standard | ✅ OpenSanctions réel | **Au niveau** |
| Audit trail | Standard | ✅ Présent (à durcir) | Proche |
| Architecture multi-tenant | Standard | ✅ Propre | **Au niveau** |

**Honnêteté sur la certification :** une vraie **SOC 2 Type II** ou **ISO 27001** demande un audit externe payant, plusieurs mois, et une entité commerciale avec de vrais clients — pas atteignable en projet solo, et ce n'est pas grave. L'objectif réaliste : **construire selon ces standards** pour que la certification devienne un jour de la paperasse, pas une refonte.

---

## 🎥 TON FORMULAIRE `new-verification` — PLAN D'UPGRADE COMPLET

Tu as raison sur le liveness, et il y a d'autres upgrades majeurs. Voici tout, par ordre d'impact :

1. **Capture caméra live** (`getUserMedia`) au lieu de l'upload de selfie — la base de tout.
2. **Liveness actif challenge-response** (ton idée exacte) : "tournez la tête à gauche", "clignez des yeux", "souriez" — ordre **aléatoire** pour empêcher le rejeu d'une vidéo. Bonne nouvelle : `face-api.js` que tu utilises déjà détecte les 68 landmarks + les expressions → tu as ~70% de la brique technique.
3. **Recalcul du score biométrique côté serveur** (règle C2) — ne plus jamais faire confiance au chiffre du client.
4. **Anti-spoofing basique** : détecter si la "personne" est en fait un écran/une photo tenue devant la caméra.
5. **Feedback temps réel** pendant la capture : "rapprochez-vous", "trop sombre", "visage flou".
6. **Détection du type de document par l'image** (pas juste un `<select>`) : vérifier que l'image EST une CIN, pas une facture.
7. **Parsing MRZ pour passeports** (zone `<<<`, norme ICAO 9303, avec checksums) — bien plus fiable que l'OCR libre.
8. **Extraction structurée** (nom/date de naissance/expiration) au lieu d'OCR brut cross-vérifié à la main.
9. **Détection de falsification** du document (recadrage, photoshop, hologrammes manquants).
10. **Détection "photo d'écran"** pour le document lui-même (photo d'une photo).

---

## 🗺️ ROADMAP COMPLÈTE ACTUALISÉE

### ⚡ ORDRE CHRONOLOGIQUE EXACT (avec le point de déploiement démo)

Objectif : déployer le plus vite possible une **preview publique** pour la montrer à ton encadrant sans captures d'écran, puis continuer à corriger en étant déployé.

**🟢 AVANT DE DÉPLOYER (obligatoire, ~1-2h) — PHASE 0 :**
1. ~~**Sécuriser `/api/chat`**~~ ✅ **FAIT** (auth RBAC + modèle corrigé + validation Zod + system prompt — code modifié, commit en attente). Protège ton budget Gemini ET fait marcher le chat dans la démo.
2. **Corriger l'IDOR sur `DELETE /api/settings/security/sessions`** *(nouveau, trouvé pendant la passe de documentation)* — filtrer par `userId`/`companyId` de la session serveur, pas par l'ID brut envoyé par le client.
3. **Mettre un plafond de dépenses** sur ton compte Google AI / Gemini (filet de sécurité de 5 min, au cas où).
4. **Confirmer que `npm run build` passe** en local (Vercel refuse un build cassé).
5. **Configurer TOUTES les variables d'env sur Vercel**, en particulier :
   - `WEBAUTHN_RPID` = ton domaine Vercel (ex: `ton-app.vercel.app`) — sinon les passkeys cassent
   - `WEBAUTHN_ORIGIN` = `https://ton-app.vercel.app`
   - `NEXTAUTH_URL` = `https://ton-app.vercel.app`
   - `NEXTAUTH_SECRET` (généré, obligatoire en prod)
   - `DATABASE_URL` en mode pooler (Supabase port 6543)
   - `CRON_SECRET`, clés Stripe, Supabase, `EMAIL_*`, `GEMINI_API_KEY`, `OPENSANCTIONS_API_KEY`

**🚀 DÉPLOIEMENT (le jour même) :**
6. **Déployer sur Vercel** (push sur `master` → déploiement auto, ou bouton Deploy).
7. **Smoke test de l'URL déployée** : inscription (OTP), login, création d'un dossier de vérification (avec des **données de test, pas de vraies personnes**), navigation dashboard. Corriger les bugs d'environnement réel qui apparaissent.
8. **→ Montrer à ton encadrant.** ✅

**🟠 APRÈS LE DÉPLOIEMENT (itérations, dans cet ordre) :**
9. A4 — Échapper le HTML des emails.
10. Phase B complète (rate limiting, chiffrement TOTP, backup codes, headers de sécurité, anti-énumération, OTP crypto).
11. Phase C — Liveness & biométrie serveur (le gros morceau produit).
12. Phases D → H (API B2B, tests/CI, observabilité, i18n, différenciateurs).

> ⚠️ **Règle d'or pour la démo :** ne mets **jamais de vraies données personnelles** (vrais CIN, vrais selfies de vraies personnes) dans la version déployée tant que la Phase B + la base légale RGPD ne sont pas faites. Utilise des données de test. Ça garde la démo hors de tout risque juridique.

---

### ✅ PHASE A — Colmatage avant déploiement (presque finie)
- [x] Supprimer `/api/fix-scores`
- [x] Protéger le cron avec `CRON_SECRET`
- [x] Corriger le bug Zod (`.issues`)
- [x] Créer `.env.example`
- [x] **A6 — Sécuriser `/api/chat`** (auth RBAC + fix modèle + validation Zod + system prompt) — code modifié 2026-07-20, **commit en attente**. Rate limiting exclu du scope, reste sous H4.
- [ ] **A4 — Échapper le HTML des emails** (`lib/mail.ts`) ← *reste à faire*
- [ ] **A7 — Corriger l'IDOR sur `DELETE /api/settings/security/sessions`** (H7, nouveau — passe de documentation) ← *filtrer par `userId` de la session serveur*
- [ ] A5 — Tester le flux 2FA de bout en bout avec un vrai authenticator (manuel, ton téléphone)

### 🟠 PHASE B — Durcissement sécurité
- [ ] Chiffrer `totpSecret` au repos (AES-256-GCM)
- [ ] Générer + hasher les `backupCodes` à l'activation 2FA
- [ ] Rate limiting global (`@upstash/ratelimit`) : login, register, OTP, chat, passkey-login
- [ ] OTP via `crypto.randomInt` (pas `Math.random`)
- [ ] Compteur de tentatives OTP (blocage après 5 échecs)
- [ ] Anti-énumération (register, passkey-login) : réponses uniformes
- [ ] Headers de sécurité dans `next.config.ts` (CSP, HSTS, etc.)
- [ ] Validation MIME + taille avatar (rejeter SVG)
- [ ] TTL sur le challenge WebAuthn
- [ ] Cas compte Google-only sur le changement de mot de passe
- [ ] Timeout + fail-closed sur OpenSanctions

### 🎥 PHASE C — Liveness & biométrie (LE gros morceau — priorité produit)
- [ ] Capture caméra live (`getUserMedia`)
- [ ] Liveness actif challenge-response (landmarks + expressions `face-api.js`)
- [ ] Recalcul du score biométrique côté serveur
- [ ] Anti-spoofing basique (détection écran/photo)
- [ ] Feedback temps réel (luminosité, netteté, cadrage)
- [ ] Détection type de document + parsing MRZ passeport
- [ ] Extraction structurée du document

### 🔌 PHASE D — Vrai écosystème B2B
- [ ] Endpoint public `POST /api/v1/verifications` authentifié par clé `tv_live_...`
- [ ] Hasher les clés API (SHA-256 + préfixe) au lieu du stockage en clair
- [ ] Middleware de vérification de clé + tracking `lastUsedAt` + quotas
- [ ] Webhooks sortants signés (HMAC-SHA256, header `X-TrustVerify-Signature`, retries backoff)
- [ ] Portail développeur (doc OpenAPI générée depuis les schémas Zod, clés sandbox `tv_test_`)

### 🧪 PHASE E — Qualité industrielle (ce qui plombe le plus la note)
- [ ] Tests unitaires (Vitest) : moteur de scoring, `enforceRole`, logique OTP
- [ ] Tests e2e (Playwright) ciblés sur les failles : "non-connecté → 401", "agent A ne voit pas B"
- [ ] CI GitHub Actions : lint + typecheck + tests + build sur chaque PR
- [ ] Scan de secrets (Gitleaks) + dépendances (Dependabot)
- [ ] Protection de branche sur `master`

### 🔭 PHASE F — Observabilité & scalabilité
- [ ] Logging structuré (`pino`) + redaction PII (remplacer les `console.log`)
- [ ] Sentry pour les erreurs prod
- [ ] Connection pooling Postgres (pooler Supabase 6543 / `pgbouncer=true`)
- [ ] Corriger la boucle N+1 dans `dashboard/stats` + cache Redis court
- [ ] Session `database` pour une vraie révocation
- [ ] Audit log immuable : révoquer `UPDATE`/`DELETE` au niveau Postgres + (bonus) hash-chaining

### 🌍 PHASE G — Finition internationale
- [ ] i18n FR/EN/AR (`next-intl`) — l'arabe RTL, vrai argument pour ton marché
- [ ] Accessibilité WCAG 2.1 AA (aria-labels, contrastes, clavier)
- [ ] README pro + diagramme d'architecture + captures
- [ ] Pages d'erreur dédiées (`error.tsx`, `not-found.tsx`)
- [ ] CGU / Politique de confidentialité / rétention appliquée techniquement (purge auto)
- [ ] Monitoring continu post-vérification (re-screening périodique)

### 🌟 PHASE H — Différenciateurs (bonus, une fois le reste stable)
- [ ] Certificat PDF de vérification horodaté + hash
- [ ] Éditeur visuel du moteur de règles pour compliance officer non-dev
- [ ] Page de suivi publique pour le client final (modèle Stripe/Persona)
- [ ] Assistant IA contextualisé par dossier (chat branché sur `aiRationale` + audit log)
- [ ] Widget "Vérifié par TrustVerify" embarquable

---

## 🚀 PRÊT À ÊTRE DÉPLOYÉ ?

**En preview/staging pour itérer : presque.** Il te reste ces points rapides avant :
1. ~~**Sécuriser `/api/chat`**~~ ✅ **FAIT** (C1/A6) — code corrigé, reste à committer.
2. **Échapper le HTML des emails** (A4).
3. **Corriger l'IDOR sur `DELETE /api/settings/security/sessions`** (H7, nouveau) — sinon n'importe quel compte connecté peut déconnecter n'importe quel autre utilisateur, même d'une autre entreprise.

Après ça, tu peux déployer en preview sans risque majeur et itérer.

**Avec de vrais utilisateurs et de vraies données KYC : NON, pas encore.** Il manque toute la Phase B (durcissement), le liveness (Phase C), et une base légale (CGU/RGPD). Traiter des CIN et selfies de vraies personnes sans ça t'expose juridiquement.

---

*Audit V3 — relecture intégrale de `Rounatto/kyc` au commit `5009a71` (105 commits, 28 routes API, chaque fichier lu ligne par ligne). Chaque point est ancré dans un fichier précis. Nouvelles découvertes de cette passe : `/api/chat` non authentifié (C1), OTP via `Math.random` (H2), absence confirmée de headers de sécurité (M1).*

---

**📌 Addendum (2026-07-20)** — passe de documentation (62 fichiers commentés, ~9 300 lignes, commits `91d2345`→`0b6eaaf`, `npm run build` vert avant chaque commit) : nouvelle découverte critique côté isolation multi-tenant (IDOR sur les sessions, H7), confirmation terrain du gap liveness (mislabeling "Live Selfie", ajouté à C3), et une série d'incohérences UI/frontend-backend mineures (B8-B12). `/api/chat` (C1) corrigé dans la foulée par une autre session — RBAC, modèle valide, validation Zod, plus de fuite d'erreur ; rate limiting toujours hors scope.
