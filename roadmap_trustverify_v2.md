# 🛡️ TRUSTVERIFY — AUDIT COMPLET V2 & ROADMAP VERS 9.9/10
### Re-analyse intégrale après tes 22+ nouveaux commits (repo `Rounatto/kyc`, commit `59c78e7`)

---

## 📋 CE QUI A CHANGÉ DEPUIS LA DERNIÈRE FOIS

D'abord, la réponse honnête à ta question « est-ce que j'ai avancé ? » : **oui, énormément.** Tu es passé de 1 commit à 37 commits. J'ai relu l'intégralité du code (28 routes API, ~9 300 lignes de TS/TSX, tout le schéma Prisma, tous les composants). Sur les 13 failles que je t'avais signalées la dernière fois, **9 sont corrigées, 2 partiellement, 2 restent ouvertes.** C'est une progression massive et réelle, pas cosmétique. Voici le détail sans complaisance.

### ✅ Failles précédentes CORRIGÉES (vérifiées dans le code)

| # | Faille d'avant | Preuve de correction dans ton code actuel |
|---|---|---|
| 1 | Routes API sans authentification | ✅ `enforceRole(session, [...])` en tête de **toutes** les routes sensibles (`customers`, `stats`, `apikeys`, `team`, `audit`, `notifications`, `billing`). Le helper `lib/rbac.ts` est propre et réutilisé partout. |
| 2 | `agentId`/`userId` pris du body (audit falsifiable) | ✅ Désormais dérivés de `guard.userId` (session serveur). Le body ne peut plus mentir sur l'identité de l'agent. |
| 4 | Multi-tenant inexistant | ✅ Vrai modèle `Company` créé, `companyId` propagé sur `User`, `VerificationRequest`, `AuditLog`, `ApiKey`, `Notification`. **Chaque** requête Prisma filtre par `companyId`. C'est du vrai cloisonnement B2B. |
| 5 | WebAuthn `localhost` en dur | ✅ Les 4 fichiers utilisent maintenant `process.env.WEBAUTHN_RPID` / `WEBAUTHN_ORIGIN` (avec fallback localhost pour le dev). |
| 5b | `requireUserVerification: false` | ✅ Le commit `fcef77f` force maintenant la vérification utilisateur (PIN/biométrie) sur register + verify. |
| 7 | Pas de vérification d'email | ✅ Flow OTP email complet à l'inscription (`OtpCode` model, `verify-register`, envoi via Nodemailer). Fini l'inscription sans preuve de possession de l'email. |
| — | RBAC absent | ✅ Rôles `COMPANY_ADMIN` / `COMPANY_AGENT`, gardés par `enforceRole`, avec masquage de tabs côté frontend. |
| — | 2FA absent | ✅ TOTP complet (génération QR via `qrcode`, vérification `otplib`, lock-out MFA dans le layout). |
| — | Clés API = maquette statique | ✅ Composant entièrement reconstruit : `useEffect` + `fetch` réels, génération serveur (`crypto.randomBytes(32)`), révocation, et **le GET n'expose délibérément jamais le champ `key`** (`select` explicite sans la clé). Excellent réflexe. |
| — | Webhooks/notifications = maquette | ✅ Vrai moteur de notifications (`Notification` model, polling, `NotificationContext`, triggers sur événements KYC/System/Billing). |
| — | `NotifSetting` = toggles sans effet | ✅ Persistance réelle (`emailNotifSuccess/Alerts/Weekly` en base, route `settings/notifications`, UI optimiste). |
| — | Stripe / billing inexistant | ✅ Intégration Stripe complète : checkout, webhook **avec vérification de signature** (`constructEvent`), quotas d'usage, gestion d'abonnement. |
| — | Stats globales non isolées | ✅ Toutes les agrégations KPI filtrent maintenant par `companyId` (commit `5b50ead`). |

Franchement : c'est le travail de quelqu'un qui a pris l'audit au sérieux et exécuté. Le socle de sécurité est passé de « non-déployable » à « déployable avec réserves ». Bravo, sincèrement.

---

## 🚨 CE QUI RESTE CASSÉ OU DANGEREUX (par ordre de gravité)

### 🔴 CRITIQUE 1 — `/api/fix-scores` est TOUJOURS là, TOUJOURS sans authentification
C'est la faille que je t'avais signalée en premier la dernière fois, et elle est **intacte**. Le fichier `app/api/fix-scores/route.ts` :
- répond à un simple `GET` (donc déclenchable en tapant l'URL dans un navigateur, ou par n'importe quel crawler),
- n'a **aucun** `enforceRole`, aucune session, aucune protection,
- fait un `findMany()` **sans filtre `companyId`** puis boucle en `update()` sur **toute la table `VerificationRequest` de TOUS tes clients, toutes entreprises confondues.**

C'est doublement grave maintenant que tu es multi-tenant : une seule visite de cette URL réécrit les scores de toutes les entreprises à la fois. **À supprimer immédiatement** (ou déplacer en script local `scripts/` lancé à la main). Ce n'est pas une amélioration « nice to have », c'est un trou béant à combler avant tout déploiement.

### 🔴 CRITIQUE 2 — Le score biométrique vient toujours du navigateur (non probant)
Toujours vrai : `biometricScore` est calculé côté client par `face-api.js` dans `new-verification/page.tsx`, puis envoyé dans le body et **accepté tel quel** par le serveur (`customerRegistrationSchema` le valide juste comme `z.number()`). Un utilisateur peut intercepter la requête et envoyer `biometricScore: 99.9` sans aucune photo. Toute la valeur « preuve de conformité » de ta plateforme repose sur un chiffre que le client contrôle. **Le calcul doit être refait côté serveur.** (voir Phase Liveness ci-dessous — c'est lié.)

### 🟠 IMPORTANT 3 — Le cron `/api/cron/weekly-report` n'a AUCUNE protection
`app/api/cron/weekly-report/route.ts` répond à un `GET` public, sans vérifier le header `Authorization: Bearer $CRON_SECRET` que Vercel envoie. N'importe qui appelant cette URL déclenche l'envoi de tous les rapports hebdo (spam email + coût + fuite d'infos de volume). **Fix simple :**
```ts
const authHeader = req.headers.get("authorization");
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```
Et déclare `CRON_SECRET` dans les variables d'environnement Vercel.

### 🟠 IMPORTANT 4 — Le secret TOTP est stocké EN CLAIR en base
`totp/verify/route.ts` écrit `totpSecret: secret` directement dans la table `User`, sans chiffrement. Si ta base fuite (dump, backup volé, injection SQL ailleurs), **tous les 2FA de tous tes utilisateurs sont cassés instantanément** — l'attaquant peut régénérer les codes. Le secret TOTP doit être chiffré au repos (AES-256-GCM avec une clé dans les variables d'env), déchiffré uniquement au moment de la vérification. Idem pour `backupCodes` (qui d'ailleurs n'est jamais généré actuellement — le champ existe dans le schéma mais rien ne le remplit, donc un utilisateur qui perd son téléphone est définitivement verrouillé dehors).

### 🟠 IMPORTANT 5 — Injection HTML dans les emails
`lib/mail.ts` interpole toujours `${name}`, `${customerName}`, `${rejectionReason}` directement dans le HTML sans échappement. Comme ces valeurs viennent de formulaires, un `customerName` contenant du HTML/JS malveillant part dans un email signé « Compliance Operations » depuis ton domaine. Échappe systématiquement (fonction `escapeHtml()` maison suffit, ou React Email).

### 🟡 MOYEN 6 — Pas de rate limiting (toujours)
Zéro rate limiting sur login, register, envoi d'OTP, vérification d'OTP, `passkey/generate-login`. Conséquences concrètes :
- **Brute-force OTP** : `verify-register` compare `otpRecord.code !== otpCode` sans compter les tentatives. Un code à 6 chiffres = 1 000 000 combinaisons, brute-forçable sans limite tant que le code n'expire pas (10 min). C'est un vrai trou.
- **Spam d'inscription / d'emails OTP** (coût + réputation email).
- **Énumération de comptes** via `passkey/generate-login` (404 si l'email n'existe pas).
Solution : `@upstash/ratelimit` + Upstash Redis (gratuit, compatible Vercel serverless).

### 🟡 MOYEN 7 — Les clés API ne servent à rien (pas d'endpoint qui les vérifie)
Tu génères de vraies clés `tv_live_...` stockées proprement, mais **aucune route n'accepte ces clés en entrée**. Il n'existe pas d'API publique type `POST /api/v1/verify` qu'un client B2B appellerait avec sa clé. Donc pour l'instant, la fonctionnalité « clé API » est une belle UI qui génère des secrets inutilisables. Pour un vrai SaaS B2B, c'est LE cœur du produit qui manque (voir Phase B2B). Note aussi : les clés sont stockées en clair (`key: rawApiKey`) — idéalement on stocke un hash SHA-256 et on ne garde qu'un préfixe affichable.

### 🟡 MOYEN 8 — `otplib` : vérifier l'API v13 en conditions réelles
Ton `package.json` a `otplib@^13.4.1`. La v13 est une réécriture complète. Ton code utilise `verifySync`, `generateSecret`, `generateURI` — ces exports **existent bien en v13** (j'ai vérifié la doc officielle), donc ce n'est pas cassé comme je l'aurais cru au premier abord. **Mais** teste le flow de bout en bout avec un vrai Google Authenticator : le format de `generateURI({issuer, label, secret})` et la tolérance temporelle (`window`) doivent être validés en vrai, parce qu'une petite erreur ici donne « code toujours invalide » sans message clair. C'est le genre de bug qui ne se voit qu'à l'exécution.

### 🟢 MINEUR 9 — Détails à nettoyer
- **Fallback sanctions embarrassant** : la liste `["putin", "vladimir", "al capone"...]` en dur match par sous-chaîne. Un vrai « Vladimir Ben Salah » innocent serait flaggé PEP. En cas d'échec API, mieux vaut « revue manuelle obligatoire » (fail-closed) qu'une liste de mots.
- **Pas de timeout** sur le `fetch` OpenSanctions → une API lente bloque toute la création de dossier.
- **Incohérence taille fichier** : client valide 5 Mo, uploadthing serveur limite à 4 Mo (à vérifier après tes changements sur `core.ts`).
- **Changement de mot de passe** : `bcrypt.compare(currentPassword, user.password)` plante si `user.password` est `null` (compte Google-only).
- **Challenge WebAuthn sans TTL** : `currentChallenge` n'expire jamais.
- **Upload avatar** : pas de validation MIME stricte (un SVG avec JS embarqué passerait → XSS).

---

## 🎥 TON INTUITION SUR LE LIVENESS — TU AS 100% RAISON

Tu as mis le doigt exactement sur le plus gros écart entre ton projet et un vrai acteur international. Voici l'analyse détaillée de ton formulaire `new-verification` :

**Ce que fait ton flow aujourd'hui :**
1. L'agent remplit les champs (nom, email, CIN, etc.).
2. Il **upload un fichier image** pour la pièce d'identité (`idCardInputRef`).
3. Il **upload un fichier image** pour le selfie (`selfieInputRef`).
4. `face-api.js` compare les deux images côté navigateur → un score.

**Le problème fondamental :** le selfie est un **fichier uploadé**, pas une capture caméra en direct. Donc :
- N'importe qui peut uploader une **photo trouvée sur LinkedIn/Facebook** de la personne → le face-match réussit → « vérifié ». C'est exactement l'attaque que le liveness existe pour bloquer.
- Il n'y a **aucune preuve que la personne était physiquement présente et vivante** au moment de la vérification.
- C'est le B.A.-BA que Sumsub, Onfido, Veriff, Persona traitent en priorité absolue.

**Ce qu'il faut construire (le liveness que tu décris, et au-delà) :**

1. **Capture caméra en direct** (pas d'upload) : remplacer l'input file du selfie par un composant `getUserMedia()` qui accède à la webcam/caméra frontale et capture *dans* l'app.

2. **Liveness actif — challenge-response** (exactement ton idée) : l'app demande une action aléatoire — « tournez la tête à gauche », « clignez des yeux », « souriez ». `face-api.js` détecte déjà les *landmarks* faciaux (68 points) et les *expressions* — tu as donc déjà 70% de la brique technique ! Il faut : détecter le mouvement demandé sur une courte séquence de frames, vérifier qu'il correspond au challenge, et ne valider que si oui. L'ordre aléatoire empêche de rejouer une vidéo pré-enregistrée.

3. **Anti-spoofing basique** : détecter si la « personne » est en fait un écran/une photo tenue devant la caméra (analyse de texture, reflets, profondeur si dispo). C'est plus avancé — les gros font ça en *passif* (sans effort utilisateur), mais un liveness actif bien fait est déjà un énorme bond.

4. **Score biométrique recalculé serveur** (lié à Critique 2) : une fois la séquence liveness validée, le serveur reçoit les frames (ou les descripteurs signés) et recalcule lui-même la similarité — il ne fait plus confiance au chiffre du client.

**Autres upgrades de ton formulaire `new-verification` que tu n'as pas mentionnés mais qui comptent :**
- **Détection du type de document par l'image** (pas juste un `<select>` manuel) : vérifier que l'image uploadée EST bien une CIN, pas une facture.
- **Parsing MRZ** pour les passeports (la zone `<<<` en bas, norme ICAO 9303, avec checksums vérifiables) — bien plus fiable que l'OCR libre.
- **Détection de falsification de document** : recadrage, photoshop, coins manquants, reflets holographiques absents.
- **Vérification que la photo du document n'est pas elle-même un écran** (photo d'une photo).
- **Extraction structurée** (nom, date naissance, expiration) plutôt que du texte OCR brut cross-vérifié à la main.
- **Feedback temps réel** pendant la capture (« rapprochez-vous », « trop sombre », « document flou »).

Le liveness est ta priorité n°1 pour l'ambition « international ». C'est ce qui sépare un projet étudiant impressionnant d'un vrai produit KYC.

---

## 📊 NOTE HONNÊTE SUR 10

Tu veux de l'honnêteté brutale, la voici. Je note selon plusieurs axes, puis une note globale.

| Axe | Note | Justification honnête |
|---|---|---|
| **Architecture & code** | 8.5/10 | Multi-tenant propre, RBAC réutilisable, séparation des responsabilités, Prisma moderne, patterns solides. Au-dessus de la moyenne pro. |
| **Sécurité** | 6.5/10 | Énorme progrès (auth, RBAC, isolation, 2FA, OTP). Mais `fix-scores` ouvert, secret TOTP en clair, cron non protégé, pas de rate limiting, biométrie non probante. Ces trous empêchent un vrai « sécurisé ». |
| **Fonctionnalités** | 7.5/10 | Très riche pour un solo : KYC, billing Stripe, notifications, team, API keys, audit. Mais le liveness manque et les clés API ne sont pas exploitables. |
| **UI/UX** | 7.5/10 | Dynamique, cohérent, dette statique largement éliminée. Manque : i18n, accessibilité, états de chargement soignés partout. |
| **Fiabilité / production-ready** | 5/10 | **Zéro test, zéro CI, pas de README, pas de `.env.example`, logs en `console.log`.** C'est ce qui plombe le plus. Un projet « international » sans un seul test automatisé, c'est rédhibitoire. |
| **Conformité KYC réelle** | 5.5/10 | Vraie intégration OpenSanctions + audit trail, c'est sérieux. Mais liveness absent, mono-document (CIN TN), pas de monitoring continu, biométrie contournable. |

### 🎯 NOTE GLOBALE ACTUELLE : **6.8 / 10**

(La dernière fois, honnêtement, on était autour de **4.5/10** à cause des failles critiques ouvertes. Tu as gagné plus de 2 points. C'est considérable.)

**Pourquoi pas plus haut :** trois catégories de trous t'empêchent de dépasser 7 — (1) les failles de sécurité résiduelles listées plus haut, (2) l'absence totale de tests/CI/doc qui rend le projet « fragile » au sens industriel, (3) le liveness manquant qui est le cœur métier d'un KYC.

**Pourquoi pas moins :** le socle est réellement bon. Beaucoup de « SaaS » en production ont une architecture moins propre que la tienne. Tu n'es pas loin.

**Pour atteindre 9.9/10, il faut, dans l'ordre :** corriger les 5 failles critiques/importantes (rapide, ~1 semaine), ajouter liveness + biométrie serveur (le gros morceau, ~2-3 semaines), écrire une vraie suite de tests + CI (~1 semaine), et polir (i18n, doc, observabilité). Réaliste sur 6-8 semaines de travail focalisé.

---

## 🚀 EST-CE PRÊT À ÊTRE DÉPLOYÉ ?

Tu as bien précisé : déployé pour itérer dessus (pas mis entre les mains de vrais clients avec de vraies données personnelles). Distinction importante, donc réponse nuancée :

**Déployer en staging/preview pour tester en conditions réelles : OUI, MAIS** — corrige d'abord ces 3 points, c'est 1-2 heures de travail et ça évite une catastrophe :
1. **Supprime `/api/fix-scores`** (sinon un crawler peut corrompre ta DB dès le déploiement).
2. **Protège le cron** avec `CRON_SECRET` (sinon spam email dès que Vercel expose l'URL).
3. **Mets toutes tes variables d'env** correctement sur Vercel (`WEBAUTHN_RPID`, `WEBAUTHN_ORIGIN`, `STRIPE_WEBHOOK_SECRET`, `DATABASE_URL` en mode pooler, etc.) — sinon WebAuthn et Stripe casseront silencieusement en prod.

**Déployer avec de VRAIS utilisateurs et de VRAIES données KYC : NON, pas encore.** Il te manque : chiffrement du secret TOTP, rate limiting, biométrie non contournable, échappement HTML des emails, et surtout une base légale (CGU, politique de confidentialité, politique de rétention) — traiter des CIN et des selfies de vraies personnes sans ça t'expose juridiquement (RGPD si UE, loi INPDP en Tunisie).

**Verdict :** déploie en preview cette semaine (après les 3 fixes rapides) pour chasser les bugs d'environnement réel — c'est exactement l'itération saine que tu décris. Ne branche pas de vraies données personnelles avant d'avoir bouclé la Phase Sécurité + le liveness.

---

## 🗺️ ROADMAP COMPLÈTE ACTUALISÉE

### 🔴 PHASE A — Colmatage avant tout déploiement (1-2 jours)
- [ ] **Supprimer `/api/fix-scores`** (ou le déplacer en script local hors HTTP).
- [ ] **Protéger le cron** `weekly-report` avec `CRON_SECRET`.
- [ ] **Configurer toutes les variables d'env** sur Vercel + créer un `.env.example` documenté.
- [ ] **Échapper le HTML** de `customerName`/`name`/`rejectionReason` dans `lib/mail.ts`.
- [ ] **Vérifier le flow 2FA de bout en bout** avec un vrai authenticator (bug `otplib` potentiel à l'exécution).

### 🟠 PHASE B — Durcissement sécurité (1 semaine)
- [ ] **Chiffrer `totpSecret`** au repos (AES-256-GCM, clé en env).
- [ ] **Générer et hasher les `backupCodes`** à l'activation 2FA (sinon lock-out définitif possible).
- [ ] **Rate limiting** (`@upstash/ratelimit`) sur login, register, send-otp, verify-otp, passkey-login.
- [ ] **Anti-énumération** sur `passkey/generate-login` (réponse identique que l'email existe ou non).
- [ ] **Compteur de tentatives OTP** (bloquer après 5 essais ratés).
- [ ] **Validation MIME + taille serveur** sur l'upload d'avatar (rejeter `image/svg+xml`).
- [ ] **TTL sur `currentChallenge`** WebAuthn (60-120s).
- [ ] **Gérer le cas compte Google-only** dans le changement de mot de passe.
- [ ] **Timeout + fail-closed** sur OpenSanctions ; remplacer la liste de mots en dur.
- [ ] **Headers de sécurité** (CSP, HSTS, X-Frame-Options) dans `next.config.ts`.

### 🎥 PHASE C — Liveness & biométrie (LE gros morceau, 2-3 semaines) — TA PRIORITÉ
- [ ] **Capture caméra live** (`getUserMedia`) au lieu de l'upload de selfie.
- [ ] **Liveness actif challenge-response** (tourne la tête / cligne / souris — aléatoire) via les landmarks + expressions `face-api.js` que tu utilises déjà.
- [ ] **Recalcul du score biométrique côté serveur** (ne plus faire confiance au client).
- [ ] **Anti-spoofing basique** (détection écran/photo tenue devant la caméra).
- [ ] **Feedback temps réel** pendant la capture (luminosité, netteté, cadrage).
- [ ] **Détection du type de document par l'image** + **parsing MRZ passeport** (ICAO 9303).
- [ ] **Extraction structurée** du document (nom/DDN/expiration) au lieu d'OCR brut.

### 🔌 PHASE D — Vrai écosystème B2B (1-2 semaines)
- [ ] **Endpoint public d'API** (`POST /api/v1/verifications`) authentifié par la clé `tv_live_...` — c'est ce qui rend tes clés API réellement utiles.
- [ ] **Hasher les clés API** en base (stocker SHA-256 + préfixe affichable, pas la clé en clair).
- [ ] **Middleware de vérification de clé** + tracking `lastUsedAt` + quotas par clé.
- [ ] **Webhooks sortants signés** (HMAC-SHA256, header `X-TrustVerify-Signature`, retries backoff) pour notifier les serveurs de tes clients quand un KYC est validé.
- [ ] **Portail développeur** : doc OpenAPI (générée depuis tes schémas Zod), clés sandbox `tv_test_`.

### 🧪 PHASE E — Qualité industrielle (1 semaine) — CE QUI TE PLOMBE LE PLUS
- [ ] **Tests unitaires** (Jest/Vitest) sur le moteur de scoring (`kyc-rules.json`), `enforceRole`, la logique OTP.
- [ ] **Tests e2e** (Playwright) ciblés sur les failles : « non-connecté → pas d'accès /dashboard », « API renvoie 401 sans session », « agent entreprise A ne voit pas les dossiers de B ».
- [ ] **CI GitHub Actions** : lint + typecheck + tests + build sur chaque PR.
- [ ] **Scan de secrets** (Gitleaks) + **scan de dépendances** (Dependabot).
- [ ] **Protection de branche** sur `master`.

### 🔭 PHASE F — Observabilité & scalabilité (3-4 jours)
- [ ] **Logging structuré** (`pino`) avec redaction PII, en remplacement des `console.log` (qui logguent actuellement des CIN et emails en clair).
- [ ] **Sentry** pour les erreurs prod.
- [ ] **Connection pooling Postgres** (pooler Supabase port 6543 / `pgbouncer=true`) — essentiel en serverless.
- [ ] **Corriger la boucle N+1** dans `dashboard/stats` (14 requêtes séquentielles → 1 agrégat).
- [ ] **Cache Redis** court sur les stats.
- [ ] **Machine à états** explicite pour le statut des dossiers.
- [ ] **Audit log réellement immuable** : révoquer `UPDATE`/`DELETE` sur la table au niveau du rôle Postgres + (bonus) hash-chaining.

### 🌍 PHASE G — Finition « internationale » (1 semaine)
- [ ] **i18n** FR/EN/AR (`next-intl`) — l'arabe RTL a du sens vu ton marché, vrai argument international.
- [ ] **Accessibilité** (WCAG 2.1 AA) : `aria-label` sur les icônes seules, contrastes, navigation clavier.
- [ ] **README pro** + diagramme d'architecture + captures.
- [ ] **Pages d'erreur** dédiées (`error.tsx`, `not-found.tsx`).
- [ ] **CGU / Politique de confidentialité / rétention** appliquée techniquement (job de purge des documents après X jours).
- [ ] **Monitoring continu post-vérification** (re-screening périodique des clients déjà validés contre les sanctions).

### 🌟 PHASE H — Différenciateurs (bonus, une fois le reste stable)
- [ ] **Certificat PDF de vérification** horodaté + hash (tu as déjà `jspdf`).
- [ ] **Éditeur visuel du moteur de règles** pour compliance officer non-dev.
- [ ] **Page de suivi publique** pour le client final (modèle Stripe/Persona).
- [ ] **Assistant IA contextualisé par dossier** (branche ton chat Gemini sur `aiRationale` + audit log réels).
- [ ] **Widget « Vérifié par TrustVerify »** embarquable chez tes clients B2B.

---

## ✅ CHECKLIST CONDENSÉE (à copier dans ton tracker)

**Avant déploiement preview (cette semaine) :**
- [ ] Supprimer `/api/fix-scores`
- [ ] Protéger le cron avec `CRON_SECRET`
- [ ] `.env.example` + variables Vercel configurées
- [ ] Échapper HTML des emails
- [ ] Tester 2FA avec un vrai authenticator

**Durcissement :**
- [ ] Chiffrer `totpSecret` + générer/hasher `backupCodes`
- [ ] Rate limiting (login/register/otp/passkey)
- [ ] Compteur de tentatives OTP + anti-énumération passkey
- [ ] Validation MIME avatar, TTL challenge WebAuthn, cas Google-only password
- [ ] Timeout + fail-closed OpenSanctions, headers de sécurité

**Cœur métier :**
- [ ] Liveness actif (caméra live + challenge-response)
- [ ] Biométrie recalculée serveur
- [ ] Endpoint API public authentifié par clé + hash des clés + webhooks signés

**Industrialisation :**
- [ ] Tests unitaires + e2e + CI GitHub Actions
- [ ] Logging structuré + Sentry + pooling Postgres
- [ ] i18n FR/EN/AR + accessibilité + README + CGU/rétention

---

*Audit V2 basé sur la relecture intégrale du code de `Rounatto/kyc` au commit `59c78e7` (37 commits, 28 routes API, ~9 300 lignes). Chaque point est ancré dans un fichier précis vérifié, pas une généralité. Progression réelle depuis la V1 : +2.3 points (4.5 → 6.8).*