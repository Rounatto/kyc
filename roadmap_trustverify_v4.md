# 🛡️ TRUSTVERIFY — AUDIT & ROADMAP VERS 10/10
### Mise à jour du 22 juillet 2026 — **Phase A terminée ✅ · Déployé en production ✅**
### 🌐 En ligne : `https://kyc-project-seven.vercel.app`

---

## 🎯 DEMAIN, ON COMMENCE ICI

**→ PHASE B — Durcissement sécurité.** Premier fichier à traiter : `app/api/settings/security/totp/verify/route.ts` (chiffrement du secret TOTP), puis les backup codes, puis le rate limiting.

Méthode de travail : tu envoies le fichier → je le rends complet, commenté (`// 🆕`) et expliqué.

---

## 📊 NOTE GLOBALE HONNÊTE : **7.2 / 10**

Progression depuis la V3 (7.0) : **+0.2**. Honnêtement : la Phase A était composée des tâches **rapides**, et le déploiement — bien qu'important comme étape — n'ajoute pas de sécurité en soi. En revanche, la mise en production a révélé **2 nouvelles failles** (documents KYC sur URLs publiques, et le pipeline OCR qui ne tient pas dans une fonction serverless) qui compensent une partie des gains.

**Ce qui bloque encore la note :** les gros morceaux (liveness, biométrie serveur, rate limiting, chiffrement TOTP, tests/CI) ne sont pas commencés. Ils valent chacun plusieurs dixièmes.

**Traduction simple :** ton socle est excellent et maintenant *en ligne*. La prochaine phase est celle qui fait vraiment bouger l'aiguille sur la sécurité.

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

**🎉 Phase A — TERMINÉE le 22/07/2026 :**
- ✅ **A4 — Échappement HTML des emails** (commit `301c192`) — fonction `escapeHtml()` appliquée à `name`, `customerName`, `rejectionReason`, `actionBy`. Faille H5 fermée.
- ✅ **A6 — `/api/chat` sécurisé** (commit `874780d`) — `enforceRole` + validation Zod + system prompt de cadrage + plus de fuite d'`error.message`. Faille C1 fermée.
- ✅ **A5 — Flux 2FA validé** de bout en bout avec un vrai authenticator.

**🚀 Déploiement en production — RÉUSSI le 22/07/2026 :**
- ✅ Vercel + Supabase + Stripe (webhook prod signé) + Google OAuth configurés.
- ✅ 3 correctifs de build : `lightningcss` déplacé en `optionalDependencies`, `prisma generate` ajouté au script de build, `maxDuration` + timeouts OCR/AML pour le serverless.
- ✅ Variables d'env production : `WEBAUTHN_RPID`/`WEBAUTHN_ORIGIN` sur le vrai domaine, `NEXTAUTH_SECRET`, `UPLOADTHING_TOKEN`, `DIRECT_URL`.

**Corrections antérieures :**
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

#### ~~C1. `/api/chat` grand ouvert~~ — ✅ **RÉSOLU** (commit `874780d`)
Auth `enforceRole` ajoutée, validation Zod du body, system prompt de cadrage TrustVerify, plus de fuite d'`error.message`. *(Note : le modèle `gemini-3.5-flash` existe bel et bien — lancé le 19 mai 2026 — mon alerte initiale sur ce point était erronée, vérification faite.)* Reste à ajouter le rate limiting → Phase B.

#### C4. Les documents KYC sont sur des URLs publiques *(🆕 DÉCOUVERT AU DÉPLOIEMENT)*
Les fichiers uploadés via uploadthing (pièces d'identité, selfies) sont servis par un CDN **sans aucune vérification d'authentification**. Toute personne disposant de l'URL d'un fichier peut voir la carte d'identité et le selfie d'un client, **sans compte, sans session**. Pour une plateforme KYC, c'est un problème de confidentialité majeur : ces documents sont la donnée la plus sensible du produit.

**À vérifier puis corriger :** configurer un contrôle d'accès sur les uploads (uploadthing propose des ACL/URLs signées), ou migrer le stockage des documents vers Supabase Storage avec des *signed URLs* à expiration courte, servies uniquement après vérification de session + `companyId`.

**Action immédiate :** purger les dossiers de test contenant de vraies données personnelles.

#### C2. Le score biométrique est contrôlé par le client *(TOUJOURS OUVERT)*
`app/api/customers/route.ts` : `biometricScore: z.number()` est pris **du body** de la requête et utilisé directement pour la décision (`< 60` = échec). Le serveur ne recalcule **jamais** rien. Un attaquant intercepte la requête, met `biometricScore: 99.9`, et tout dossier passe "Vérifié" sans la moindre photo. **Ça invalide la valeur probante de TOUS les badges "Vérifié" de la plateforme.**

#### C3. Aucune détection de vivacité (liveness) *(TON INTUITION — 100% CORRECTE)*
Le selfie est un **upload de fichier** (`selfieInputRef`, `handleFileChange`), pas une capture caméra live. Donc on peut uploader une **photo LinkedIn/Facebook** de la cible et passer la vérification. Aucune preuve que la personne était physiquement présente et vivante. C'est LE standard n°1 chez Sumsub/Onfido/Veriff/Persona. (Détails et plan complet en section dédiée plus bas.)

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

#### ~~H5. Injection HTML dans les emails~~ — ✅ **RÉSOLU** (commit `301c192`)
Fonction `escapeHtml()` ajoutée dans `lib/mail.ts`, appliquée à toutes les valeurs d'origine utilisateur. Décision documentée : le *sujet* de l'email n'est volontairement pas échappé (un sujet est du texte brut, jamais interprété comme du HTML).

#### H7. Le pipeline KYC ne tient pas dans une fonction serverless *(🆕 DÉCOUVERT AU DÉPLOIEMENT)*
En production, la création d'un dossier restait bloquée à l'infini sur « Analyzing AI Risk… ». Cause : `POST /api/customers` exécute **synchroniquement** l'OCR Tesseract 3 langues (téléchargement des modèles à froid + analyse sur 2 cœurs) puis l'appel OpenSanctions — bien au-delà de la limite de 10 s du plan Hobby, donc la fonction était tuée sans jamais répondre.

**Correctif appliqué (temporaire) :** `export const maxDuration = 60`, `AbortSignal.timeout(8000)` sur OpenSanctions, et `Promise.race` de 35 s sur l'OCR (échec propre → revue manuelle plutôt que blocage).

**⚠️ C'est un pansement, pas une solution.** Le plafond de 60 s reste atteignable sur un cold start, et l'utilisateur attend jusqu'à une minute devant un écran figé. La vraie correction est le **pipeline asynchrone de la Phase C** : réponse immédiate en statut `processing` → traitement en tâche de fond → mise à jour temps réel. Cette découverte rend cet item **nettement plus prioritaire** qu'estimé initialement.

#### H6. Clés API stockées en clair + inutilisables *(TOUJOURS OUVERT)*
`apikeys/route.ts` : `key: rawApiKey` — la clé complète `tv_live_...` est stockée telle quelle. Une fuite de base = toutes les clés clients exposées. De plus, **aucun endpoint n'accepte ces clés en entrée** : elles ne servent à rien (pas de vraie API B2B). **Fix :** stocker un hash SHA-256 + préfixe affichable, et créer l'endpoint public authentifié par clé.

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

### ⚡ OÙ ON EN EST — ET LA SUITE

**✅ FAIT (22/07/2026) :** Phase A complète + déploiement production réussi + smoke test validé. L'URL est prête à être montrée à l'encadrant.

**🔜 ORDRE DE REPRISE :**
1. **Nettoyage immédiat (5 min)** — purger les dossiers de test contenant de vraies données personnelles (cf. faille C4).
2. **Phase B — Durcissement sécurité** ← *on commence ici demain*
3. **Phase C — Liveness & biométrie serveur** (inclut le pipeline asynchrone, devenu prioritaire suite à H7)
4. **Phase D → H** (API B2B, tests/CI, observabilité, i18n, différenciateurs)

> ⚠️ **Règle d'or maintenue :** pas de vraies données personnelles (vrais CIN, vrais selfies) dans la version déployée tant que la Phase B + le contrôle d'accès aux fichiers (C4) + la base légale RGPD ne sont pas faits. Les documents sont actuellement sur des URLs publiques.

### 📌 CONFIGURATION DE PRODUCTION — À NE PAS RECASSER
Notes acquises pendant le déploiement, pour ne pas refaire les mêmes erreurs :
- `lightningcss-win32-x64-msvc` doit rester dans `optionalDependencies` (jamais `devDependencies` → casse le build Linux).
- Le script de build **doit** être `prisma generate && next build` (sinon les types Prisma sont absents sur Vercel).
- `WEBAUTHN_RPID` = domaine **nu** (`kyc-project-seven.vercel.app`), sans `https://`.
- Tester toujours sur le domaine stable, jamais sur l'URL de déploiement à identifiant aléatoire (les passkeys y échouent).
- Le `STRIPE_WEBHOOK_SECRET` de production est **différent** de celui du CLI local.
- Chaque `git push` sur `master` redéploie automatiquement.

---

### ✅ PHASE A — TERMINÉE ✅
- [x] Supprimer `/api/fix-scores`
- [x] Protéger le cron avec `CRON_SECRET`
- [x] Corriger le bug Zod (`.issues`)
- [x] Créer `.env.example`
- [x] **A4 — Échapper le HTML des emails** (`lib/mail.ts`)
- [x] **A6 — Sécuriser `/api/chat`** (auth + validation + system prompt)
- [x] **A5 — Tester le flux 2FA** de bout en bout avec un vrai authenticator
- [x] **Déploiement production** + smoke test validé

### 🟠 PHASE B — Durcissement sécurité ← **ON COMMENCE ICI**

**Ordre suggéré (du plus critique au moins urgent) :**
- [ ] **1. Chiffrer `totpSecret` au repos** (AES-256-GCM, clé en variable d'env) — fichier : `app/api/settings/security/totp/verify/route.ts`
- [ ] **2. Générer + hasher les `backupCodes`** à l'activation 2FA — *priorité rehaussée : lock-out vécu en conditions réelles pendant le smoke test*
- [ ] **3. Rate limiting global** (`@upstash/ratelimit` + Upstash Redis) : login, register, OTP, chat, passkey-login
- [ ] **4. Compteur de tentatives OTP** (blocage après 5 échecs) — sans ça, un code à 6 chiffres est brute-forçable
- [ ] **5. OTP via `crypto.randomInt`** (pas `Math.random`, prédictible)
- [ ] 6. Headers de sécurité dans `next.config.ts` (CSP, HSTS, X-Frame-Options, etc.)
- [ ] 7. Anti-énumération (register, passkey-login) : réponses uniformes
- [ ] 8. **Contrôle d'accès aux documents KYC** (faille C4) — ACL uploadthing ou migration vers signed URLs
- [ ] 9. Validation MIME + taille avatar (rejeter `image/svg+xml`)
- [ ] 10. TTL sur le challenge WebAuthn
- [ ] 11. Cas compte Google-only sur le changement de mot de passe
- [x] ~~Timeout sur OpenSanctions~~ — fait pendant le déploiement (`AbortSignal.timeout(8000)`)
- [ ] 12. Fail-closed sur OpenSanctions (revue manuelle au lieu de la liste de mots en dur)

### 🎥 PHASE C — Liveness & biométrie (LE gros morceau — priorité produit)
- [ ] **Pipeline KYC asynchrone** (statut `processing` → job de fond → notification temps réel) — *priorité rehaussée suite à la faille H7 : le `maxDuration=60` actuel n'est qu'un pansement*
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

**En preview/staging pour itérer : presque.** Il te reste 2 choses rapides avant :
1. **Sécuriser `/api/chat`** (C1/A6) — sinon un crawler peut drainer ton budget Gemini dès le déploiement.
2. **Échapper le HTML des emails** (A4).

Après ça, tu peux déployer en preview sans risque majeur et itérer.

**Avec de vrais utilisateurs et de vraies données KYC : NON, pas encore.** Il manque toute la Phase B (durcissement), le liveness (Phase C), et une base légale (CGU/RGPD). Traiter des CIN et selfies de vraies personnes sans ça t'expose juridiquement.

---

*Roadmap mise à jour le 22 juillet 2026 après la clôture de la Phase A et le premier déploiement en production. Basée sur la relecture intégrale de `Rounatto/kyc` (105+ commits, 28 routes API, chaque fichier lu). Nouvelles failles identifiées lors de la mise en production : C4 (documents KYC sur URLs publiques) et H7 (pipeline OCR incompatible avec les limites serverless). Prochaine étape : Phase B — durcissement sécurité.*
