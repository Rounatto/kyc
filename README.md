# TrustVerify

**A multi-tenant KYC/AML platform for identity verification, built for the Tunisian market.**

An agent enrols a customer, captures their identity document and a live presence sequence. The server then runs a complete verification pipeline — document OCR, sanctions screening, facial comparison, liveness proof, duplicate-identity detection — and produces a risk score, a human-readable rationale, and an immutable audit entry.

Built solo, from an empty repository. Next.js 16, TypeScript, Prisma 7, PostgreSQL, Gemini Vision, deployed on Vercel.

> **Live demo:** https://kyc-project-seven.vercel.app
> **Repository:** github.com/Rounatto/kyc

---

## Contents

- [What it does](#what-it-does)
- [Screenshots](#screenshots)
- [Feature set](#feature-set)
- [Architecture](#architecture)
- [The verification pipeline](#the-verification-pipeline)
- [How this was built](#how-this-was-built) — the chronology
- [Engineering decisions](#engineering-decisions) — **the core of this document**
- [Security architecture](#security-architecture)
- [Testing and CI](#testing-and-ci)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)
- [Stack](#stack)
- [Running locally](#running-locally)
- [A note on the AI usage](#a-note-on-the-ai-usage)

---

## What it does

TrustVerify is a B2B platform. Its customers are institutions — banks, insurers, fintechs — that must verify the identity of their own customers before entering a business relationship, as anti-money-laundering regulation requires.

Each institution gets an isolated workspace. Its agents enrol applicants, and the platform automates what a compliance officer would otherwise do by hand: read the document, check the name against sanctions lists, confirm the face matches, confirm a real person was present, and flag anything that does not add up.

The output is not a yes/no. It is a **risk score with its reasoning attached** — because in compliance, a decision that cannot be justified is worthless.

---

## Screenshots

### Dashboard

KPIs, seven-day activity chart, and recent files. Note the trend badges: where no comparison base exists, they read **No data** rather than a fabricated `0.0%`.

![Dashboard](docs/screenshots/dashboard.png)

### New verification — applicant details

The Arabic name field carries its own explanation, because leaving it empty silently degrades the document check on Tunisian cards.

![New verification form](docs/screenshots/new-verification.png)

### New verification — physical presence check

Camera capture is mandatory. No file upload. The applicant is asked to hold two poses drawn at random by the server.

![Liveness check](docs/screenshots/liveness.png)

### Customer file — the full rationale

Every check states its result **and its source**. Liveness confirmed with both actions named, biometric match with the model's estimate in parentheses, AML screening source, OCR name check at 5/5 in Arabic script — and the age note explicitly marked as informational with no score impact.

The line that matters most: *"Server-side facial comparison (Gemini Vision). The client-supplied score was ignored."*

![Customer file with AI rationale](docs/screenshots/customer-file.png)

### Audit trail

Each file records which modules ran, each verdict, and the resulting score.

![Audit trail](docs/screenshots/audit-trail.png)

---

## Feature set

### Identity verification
- Document capture and OCR (Gemini Vision primary, Tesseract fallback)
- Structured field extraction: Arabic name, Latin name, ID number, date of birth, expiry date
- Arabic-script name matching with OCR-error tolerance
- Server-side facial comparison between document portrait and live capture
- Two-action randomised liveness challenge, verified server-side
- Duplicate-identity detection across a workspace's files
- AML and PEP screening via OpenSanctions
- FATF blacklist and greylist jurisdiction checks
- Multi-country ID format validation
- Age verification with a hard block on minors
- Declarative risk-scoring engine with a full rationale

### Compliance and audit
- Immutable audit trail on every file and every decision
- Twelve structured rejection reasons across four categories, each carrying a separate internal label and customer-facing message
- Tipping-off protection: sanctions-related rejections send a generic email
- Weekly compliance report by email, split between work completed and incoming backlog
- CSV and executive-report export

### Platform
- Multi-tenant workspaces with strict data isolation
- Role-based access control (company admin, agent)
- Secure agent invitation flow with expiring tokens
- Dashboard with KPIs, trend indicators and a seven-day activity chart
- Paginated, filterable customer directory with debounced search
- Notification system with targeted and workspace-wide alerts
- Active session management and revocation
- API keys for programmatic access
- Stripe billing with a usage quota and paywall

### Authentication
- Email and password with a two-step OTP registration flow
- TOTP two-factor authentication, encrypted at rest
- Ten single-use backup codes with a remaining-count notification
- WebAuthn passkeys (biometric and hardware key)
- Google OAuth
- Password reset with hashed, single-use, expiring tokens
- Configurable session duration ("remember me")

---

## Architecture

### Multi-tenancy

`Company` is the root of the tenancy model. Almost every other model carries a `companyId`.

**Isolation is enforced at the application layer**, not by Postgres row-level security. Every Prisma query filters on a `companyId` **derived from the server session** — never from a request body or query string. The same rule governs the agent identity written into audit entries.

This is a deliberate choice with a known trade-off: it depends on discipline in every query rather than being guaranteed by the database. It is documented here so that whoever reads the code knows the guarantee comes from the application, not the storage layer.

### Cascade conventions

The schema uses two deletion behaviours, chosen per relationship:

- `onDelete: Cascade` — the child is meaningless without its parent (a KYC file without a company)
- `onDelete: SetNull` — the child must **survive** the parent for legal traceability (an audit entry, or a KYC file, must stay readable after the agent who processed it leaves the company)

### Document storage

The database stores **paths**, not URLs.

The distinction matters. A URL is directly addressable — paste it in a browser and the file appears. A path is a coordinate inside a private bucket: no domain, no protocol, useless on its own. Viewing a document requires asking the server for a short-lived signed URL, which it grants only after checking the session and the requesting tenant.

---

## The verification pipeline

A single request to `POST /api/customers` orchestrates the whole chain:

| Step | What happens |
|---|---|
| 1 | RBAC guard, Zod validation, `companyId` from the session |
| 2 | Path ownership check — every referenced document must sit under the caller's tenant prefix |
| 3 | Duplicate check on email and ID number within the workspace |
| 4 | Document OCR — Gemini Vision, Tesseract as fallback |
| 5 | Date-of-birth resolution: form value, document value, or neither |
| 6 | **In parallel:** AML screening, facial comparison, liveness verification, duplicate-face detection |
| 7 | Declarative rules engine produces the score and rationale |
| 8 | File, audit entry, and high-risk notification written |

### Why step 6 is parallel

Run sequentially, the four checks would take 8 + 20 + 25 + 20 = 73 seconds, plus 15 for the OCR — 88 seconds against Vercel's 60-second ceiling.

Run in parallel, the worst case falls to about 40 seconds total.

**The parallelism is not an optimisation. It is what makes the pipeline possible at all.**

### The scoring engine

Risk facts are computed in the route, then evaluated by `json-rules-engine` against a declarative JSON file. Four event types:

- `hard_kill` — forces the score to 100 regardless of anything else (sanctions match, minor, FATF blacklist)
- `risk_penalty` — cumulative points
- `trust_bonus` — negative points for positive evidence obtained
- `informational` — zero points, but recorded in the rationale

Thresholds: 0-19 Low, 20-49 Medium, 50-100 High.

Keeping the rules in JSON means business thresholds, point values and messages change without touching application code — and it is what allowed the entire biometric engine to be replaced without rewriting a single rule.

---

## How this was built

### 1. The product first

The project began as a frontend. Dashboard layout, customer directory, verification form, settings — built in Next.js with Tailwind, then progressively backed by real data: Prisma models, API routes, NextAuth, Supabase, Stripe.

By the end of that phase the platform did everything on the feature list above. It looked finished.

### 2. The audit that changed the project

A deep security review found **thirteen critical vulnerabilities** in code that appeared to work: unauthenticated API endpoints, a hardcoded WebAuthn relying-party ID, biometric scoring computed entirely client-side, broken session revocation, and more.

That review produced an eleven-phase remediation roadmap and reframed the whole project. **The interesting work was no longer adding features — it was finding out which of the existing ones were real.**

### 3. Phase A — the immediate holes

Removed a `fix-scores` endpoint that could rewrite risk scores without authentication. Added `CRON_SECRET` verification to the scheduled job. Fixed a Zod error-handling bug. Added authentication to the AI chat route. Escaped HTML in outbound emails. Added `.env.example`. Validated the 2FA flow end to end.

### 4. First deployment

Going live on Vercel surfaced problems that never appear locally: `lightningcss` had to move to `optionalDependencies`, `prisma generate` had to join the build script, and serverless execution limits forced explicit `maxDuration` settings plus timeouts on every external call.

### 5. Phase B — eleven security items

TOTP secrets encrypted at rest with AES-256-GCM, including opportunistic migration of legacy plaintext secrets at login. A "remember me" checkbox that had been purely decorative made functional. Rate limiting via Upstash across five routes. Cryptographic OTP generation. Anti-enumeration on password reset and passkey login. A complete password-reset feature that did not exist at all — the link on the login page led to a 404. Migration of KYC documents from public permanent URLs to a private bucket. 2FA backup codes. 2FA management with password re-authentication. An OTP attempt counter. A cleanup job for expired tokens.

### 6. Phase E — tests and CI

The project had zero tests. Fourteen Playwright security tests now run on every push via GitHub Actions.

One of them settled a question open since the first audit: **`proxy.ts` with NextAuth v4 `withAuth` does work on Next.js 16** — unauthenticated visitors are correctly redirected away from `/dashboard`.

### 7. The scoring engine audit

A second review, this time of the risk engine itself, found seven issues. Three were serious enough to reshape the project's remaining work — covered in detail below.

### 8. Arabic support

Not in the original plan, but it turned out to be the single most impactful fix for the target market. Covered below.

### 9. Phase C — biometrics and liveness

Server-side facial comparison, graduated biometric facts, age verification hardening, and a complete liveness system built in five stages: camera component, randomised challenge, secure upload, server verification, and integration into the scoring engine.

### 10. Duplicate-identity detection

The last feature added — and the one whose *investigation* proved more valuable than the result.

---

## Engineering decisions

This is the part worth reading. Several of these involved **deleting or weakening things that already worked**, because they did not do what they claimed.

### 1. I deleted a check because it was lying

The scoring engine had a rule called `isStolenDocument`. Its audit message read:

> *matched stolen/lost document databases*

Its implementation was:

```js
cin.endsWith("999") || cin.endsWith("000")
```

No database was ever consulted. The rule fired on roughly 1% of ID numbers chosen at random, and wrote a **false statement into a compliance audit trail** every time it did.

I removed it rather than fix it, because there is no free path to the real thing — Interpol's SLTD database is restricted to law enforcement.

A missing check is a gap. A check that fabricates its own justification is worse than a gap, because someone will trust it.

### 2. Fail-closed became the default everywhere

The original design shared a consistent flaw: **when a check could not run, the system behaved as though it had run and found nothing.**

The AML screening was the clearest case. If OpenSanctions was unreachable, the function returned `sanctioned: false` — indistinguishable from "screened, no match". Twenty files could pass as Low Risk during a two-hour outage while the audit trail claimed screening had taken place.

I reversed the default on every external check:

| Check | Unavailable now costs | Rationale message |
|---|---|---|
| AML screening | +45 | *This profile has NOT been screened* |
| Document OCR | +25 | *Document data was NOT cross-verified* |
| Biometric comparison | +40 | *Identity was NOT biometrically verified* |
| Liveness | +40 | *Physical presence was NOT confirmed* |
| Duplicate check | +20 | *Identity reuse was NOT ruled out* |

The pattern is identical each time: **the system states what it does not know, rather than producing a reassuring value.**

### 3. The fail-closed change immediately exposed two real bugs

This is the part I did not anticipate.

Within minutes of making the AML screening declare its own failures, the logs showed it had **never worked since day one**. Two independent bugs:

- The auth header sent `Bearer <key>`. OpenSanctions documents `ApiKey <key>`. The keyword is part of the value the server compares, so every request returned 401.
- The response was read from `data.queries.q1`. The API accepts requests in `queries` but replies in `responses`. A `|| []` fallback turned the missing key into an empty result — no error, no result, no signal.

Both had been invisible because the old code silently fell back to a local list of nine hardcoded words.

**The fail-open behaviour was not a theoretical risk. It had been concealing a total outage for months.**

I removed that local list too. It produced false positives on innocent customers — a Tunisian applicant named "Vladimir Ben Salah" was flagged as both a sanctions match and a politically exposed person, on the strength of his first name — and had never produced a single true positive.

### 4. Biometric scoring moved out of the browser

`face-api.js` loaded three neural networks in the browser, computed a facial similarity score, and posted it to the server, which fed it straight into the rules engine.

Opening devtools, intercepting the request and changing `biometricScore: 12.4` to `99.9` defeated the entire biometric check. Two photographs of different people scored clean.

**A security check that runs on a machine the user controls is not a check. It is a display.**

The comparison now happens server-side: the server downloads both images from the private bucket itself and has Gemini Vision compare them. The client-supplied field is still accepted by the schema — so a stale browser tab does not break — but it is never read.

Side benefit: several megabytes of model weights no longer download on every page load.

### 5. Verdicts, not scores

`face-api.js` produced a **euclidean distance** between two 128-dimension vectors. That is a measurement: reproducible, comparable across files, convertible into a percentage that means something.

Gemini does not measure. It judges. Asked for a percentage it will produce one, but the same pair of images may return 82 today and 76 tomorrow.

So `lib/face-match.ts` returns a **verdict** — `same_person`, `likely_same_person`, `inconclusive`, `different_person`, `unavailable` — and never a bare number. The model's similarity estimate is shown to the agent in parentheses, never as the basis for the decision.

The old thresholds (40/60/75) were deleted. They had been calibrated against a mathematical distance; applying them to a language model's opinion would have manufactured a false impression of precision. **I would rather lose apparent rigour than fake it.**

The rules engine needed no changes: the same four facts are derived, only their source differs. That is what a declarative rules layer is for.

### 6. Making the document check work on Tunisian ID cards

Tunisian national ID cards print the holder's name in Arabic. The form collected it in Latin script. The OCR check therefore searched for `"rayen"` inside Arabic text — a string that could never be found.

`ocrNameMismatch` fired on **100% of Tunisian files**, costing 40 points to every legitimate customer on the platform's primary market.

Two things came out of fixing it.

**A separate Arabic name field, not automatic transliteration.** There is no single correct transliteration: *Mhalla* may be written محلة, المحلة or محلا depending on the civil registry. And some entries are administrative conventions rather than transliterations at all — *dit* becomes شهرة on Tunisian cards. No tool would guess that. The agent copies what they see.

**Tesseract had to go.** The diagnostic log showed pure noise — it was reading the anti-copy guilloche background as characters, matching one name word out of five, probably by accident.

This was structural, not a tuning problem. Tesseract is built for clean printed text; an ID card combines everything it handles badly — security background, stylised Arabic type, holograms, phone photography with glare and angle.

Gemini Vision replaced it as the primary reader, with Tesseract kept as fallback and `ocrUnavailable` as the final fail-closed state. Result on the same document: **5/5 name parts matched.**

An unexpected gain: Gemini returns the Arabic name as a structured field, so the check now works even when the agent leaves the field empty. It also extracts the date of birth and expiry date, which enabled two checks that had never been possible before.

`lib/arabic.ts` handles the comparison itself: normalisation of Arabic letter variants, Levenshtein tolerance for OCR misreads, a 60% word-match threshold, and Arabic-Indic digit conversion for ID numbers.

### 7. Liveness — designing the check, not just adding one

The selfie was a file upload, using exactly the same mechanism as the ID document. Anyone holding a photograph of their victim — from Facebook, LinkedIn, a screenshot — could submit it, and the facial comparison would dutifully confirm the match.

**The biometric check worked perfectly and validated an impersonation.**

Four design decisions shaped the fix.

**No file-upload fallback.** Sumsub, Onfido and Veriff offer none either. A fallback *is* an escape hatch: even heavily penalised, it becomes the route chosen by exactly the people the check exists to stop. And in this product specifically, an agent enrols a customer who is physically present — so the only genuine reason to upload a file is that the person is absent, which is the fraud case.

The escape hatch is instead a **traced bypass**: the agent may proceed without capture, but must write a justification, which is stored with the file, penalised (+45), and recorded in the audit trail under their name. Nobody takes that route without leaving their name on it.

**Hold the pose, don't perform a movement.** My first version asked the applicant to "slowly turn your head". Testing showed the flaw immediately: by the time someone reads the instruction and understands it, the movement is over and they have returned to neutral.

Asking them to *hold* the position converts a fleeting event into a stable state — which means the time they take to read no longer affects the capture at all. That single change is what allowed the read phase and the capture phase to be separated, with a "we're ready" button and a ten-second fallback.

**Two random actions, not one.** With a single action drawn from four, a fraudster holding the right photo has a one-in-four chance, and can simply relaunch until it comes up. Two distinct actions raise it to twelve combinations, and require the correct *pair* of images, revealed only seconds beforehand.

A pre-recorded video no longer suffices — it would take a deepfake driven live by the on-screen instructions.

**The server draws the challenge, not the browser.** The two actions are sealed in an HMAC-SHA256 token that the client can read (it must display the instructions) but cannot modify. No database table, no state — which matters on serverless, where consecutive requests may hit different instances.

Verification is server-side, and the token is checked **before anything is downloaded**: verifying images without knowing what was asked is meaningless, and it avoids burning API quota on a forged request.

The strongest signal turned out to be the simplest. Three frames captured seconds apart from a real person are never identical — breathing, micro-movements, light variation. Three identical frames mean a photograph was held in front of the lens. That check alone catches the most common attack.

**One more detail that mattered:** the reference frame — the neutral capture taken before any instruction appears — becomes the file's selfie. It *is* a selfie: a front-facing neutral portrait, except taken live rather than chosen from a gallery. The entire existing facial-comparison chain kept working unchanged, on a strictly better source.

### 8. Retry counting, without a review button

An early version let the agent review the three captured frames before deciding whether to submit them.

That is wrong, and the reason is worth stating: **if the agent can review and then decide, they can relaunch until they get frames that pass.** The check would become "does the agent find these convincing?" — precisely the question the system exists to take out of their hands. In a collusion scenario it hands a malicious agent complete control.

Capture is therefore always submitted, immediately, with no filtering. What is tracked instead is the **number of attempts**, incremented on launch rather than on success — so abandoned sequences count too.

Nothing is blocked. Two or three retries are normal; a real person misreads an instruction or moves too early. Ten retries on one file is a signal, surfaced in the rationale for the reviewer to weigh.

**The principle throughout: do not forbid, make it impossible to go unnoticed.**

Relaunching also deletes the previous attempt's images, so a single sequence exists in storage at a time — the retry counter preserves the history that deletion removes.

### 9. I removed a penalty that worked

`isYoungAdult` added 20 points to any customer under 25. The business thresholds place Medium Risk at 20. So **every clean file from a young adult was automatically flagged.**

On a market with a young population, that is a large share of legitimate customers. A risk engine that alerts on everyone alerts on no one.

The underlying signal is real — money-mule recruitment does target 18-25 year olds, and it is documented. But no vendor in the sector applies a standalone age penalty at the identity-verification stage: age says nothing about *is this person who they claim to be*. It has value only in combination.

The fact is still produced and scores nothing on its own. It costs 30 points only when combined with a disposable email address — a pattern that actually resembles mule-account recruitment. Alone, it produces a note in the audit trail and nothing more.

### 10. The worst fail-open was the one nobody would look for

Age verification defaulted to `let clientAge = 30`. No date of birth meant the applicant was treated as a 30-year-old adult, and no signal was raised.

The `isUnderage` rule is a **hard kill** — the strictest control in the engine, and a regulatory obligation. Leaving the optional date-of-birth field empty silently disabled it.

Three cases are now distinguished:

- Date provided → normal check, plus comparison against the document
- Field empty but date readable on the document → age derived from the document, no penalty (a *stronger* source than manual entry)
- Neither → `dobMissing`, +40, mandatory review

And when both dates exist but disagree, the check uses the **younger** of the two. Someone typing 1990 while their card reads 2010 should not escape the block. A penalty is not a substitute for a prohibition.

### 11. A rate limiter that could never rate-limit

`lib/ratelimit.ts` carried a carefully written comment explaining that Redis was initialised lazily so a missing environment variable would not crash the module.

It did not do that. The eleven limiters were constructed at module scope, so `Redis.fromEnv()` ran **at import time** — before any route began executing, and therefore outside the `try/catch` implementing the documented fail-open. A missing Upstash variable produced a bare 500, not graceful degradation.

Fixed with a `Proxy` that defers the connection until a Redis method is actually called — inside the try/catch, where the fail-open finally works. The module's public signature did not change, so no other file needed touching.

I also raised the OTP verification limit from 5 to 15 per 15 minutes. It had been calibrated at exactly `MAX_OTP_ATTEMPTS`, which meant it added nothing the per-code counter did not already do — while penalising users behind carrier-grade NAT, where hundreds of subscribers share one public IP.

### 12. Duplicate-identity detection, and three dead ends

Every file was verified in isolation. Nothing checked whether the *same face* had already been enrolled under a different name — the defining pattern of a fraud ring, where each individual file looks perfectly clean.

The correct solution is vector search: compute a face embedding, index it, retrieve nearest neighbours in one query regardless of volume. I investigated three routes to that, and **all three failed** — for reasons worth recording, because the diagnosis proved more useful than the feature.

- **`@xenova/transformers`** exposes no face-recognition model at all. Its `image-feature-extraction` pipeline runs CLIP/ViT, which encode *semantic appearance*, not *facial identity*. Two different people with similar hair and background would score as a strong match; the same person clean-shaven a month later would not. That is not a tuning problem — it is the wrong kind of vector.
- **Hosted inference** on Hugging Face's free tier does not reliably serve face-recognition models, and Gemini's embedding API is text-only. No viable free provider exists.
- **Local ONNX** via `onnxruntime-node` downloads its native binary from an external CDN at install time, making the build depend on a remote fetch — and native binaries sit badly with serverless deployment.

Running a face-recognition model on free-tier serverless is not a solved problem. The JavaScript ecosystem has no maintained equivalent of the Python tooling.

What shipped instead reuses the working Gemini comparison against **at most three** recent files from the same workspace, within a 90-day window. The candidate cap comes from the execution budget, not the business need: each comparison is a ~20-second API call, and the pipeline can already have five running concurrently.

Two deliberate choices:

**Only `same_person` counts as a duplicate** — stricter than the document/face comparison, where doubt weighs against the applicant. Here a match *accuses someone of fraud*. A `likely_same_person` verdict on two brothers would be a serious and false accusation. **I would rather miss duplicates than invent them.**

**Comparison is scoped to one company.** Comparing across tenants would reveal to bank A that one of its customers also banks with B. That is a data leak, not a feature. The trade-off — a fraudster spreading identities across institutions goes undetected — is what industry consortiums exist to solve, contractually rather than technically.

### 13. Rejection reasons, and the tipping-off problem

The rejection reason list was incomplete: no data-mismatch reasons, no fraud reasons, no compliance reasons — despite the engine already detecting sanctions matches, PEP status and minors.

But the more serious issue was that **the selected reason was emailed straight to the customer.**

For a sanctions-related rejection, telling the applicant why they were refused is *tipping off* — informing a potentially sanctioned person that they have been identified. It is prohibited in most AML regimes.

The list was rebuilt as twelve reasons across four categories (document quality, data mismatch, fraud indicators, compliance). Each carries **two separate texts**: an internal label for the audit trail, and a customer-facing message. Compliance reasons are marked internal-only and send a generic message. The server uses the customer-facing text and never falls back to the internal one.

### 14. Weekly report statistics that measured the wrong thing

The weekly compliance email counted "Total Verifications Processed" — but the query counted files *submitted*, pending ones included, with no line showing them. And the approved/rejected counters filtered on `submittedAt` rather than `updatedAt`.

The consequence: an agent who spent Monday clearing fifty files submitted the previous month saw **"Successfully Approved: 0"**. All their work was invisible, and the gap between the total and the sum of approved plus rejected was explained nowhere, making the whole email look broken.

The counters now filter on `updatedAt` — work *done* — a pending line was added, and the email is structured in two sections: work completed, and incoming backlog.

### 15. A dashboard statistic that always said "no change"

The trend badges beside each KPI showed `0.0%` with a neutral icon on cards whose value had gone from 0 to 4.

Two causes. The API returned `+100%` whenever the previous period was empty — but 0→1 and 0→400 are not both "100% growth", they are *undefined* growth; there is no base to divide by. And the component's guard, `Number(value) || 0`, converted the resulting `NaN` into a clean, confident zero.

**The same pattern as `isStolenDocument`, in a different corner of the codebase: a silent fallback turning missing information into reassuring information.**

The API now returns `null` when there is no comparison base, and the shared component renders three distinct states — a real percentage, *New* (activity with no history), or *No data*. Two more bugs surfaced in the same pass: a `pendingDelta` the API never sent, and a "Last Year" option the API did not recognise, silently showing thirty days instead.

### 16. An intermittent bug in the search dropdown

Clicking a search result sometimes did nothing at all. No error, no navigation.

The cause was a race between two browser events. The dropdown closed on `onBlur` behind a 200 ms timer; clicking a result fires `mousedown` → blur → `mouseup` → `click`, in that order. When the timer elapsed before the `click` — a slightly slow click, a loaded machine — the list item had already left the DOM and the click landed on nothing.

**Lengthening the timer does not fix a race, it only moves the threshold.** The correct fix is `preventDefault()` on `mousedown` over the dropdown: the input never loses focus, `onBlur` never fires, and the click always reaches its target.

Worth recording because the failure was intermittent — which is exactly why the timer pattern is so common and so misleading. It works every time you test it.

### 17. Email deliverability — a problem I could not fix in code

Agent invitations were arriving in spam, and their links did not work.

The link failure turned out to be Gmail disabling links inside spam-flagged mail — a symptom, not the cause. The root cause is structural: the platform sends through Gmail SMTP without an owned domain, so there is no SPF or DKIM alignment.

Code-side mitigations shipped (neutral subject lines, plain-text alternative parts, a single sender identity, plain link fallbacks under buttons), and they helped. But **the honest conclusion is that no amount of code fixes this.** It needs a domain and a transactional email provider.

Recorded here rather than left as a mysterious intermittent bug.

---

## Security architecture

**Multi-tenancy** — every query filters on a `companyId` derived from the server session. Never from the request body, never from a query string. The same rule governs the agent identity written into audit entries.

**Path ownership** — document paths arrive from the client, so they cannot be trusted. Every path referenced in a file creation must start with the caller's tenant prefix. Without it, an agent from company A who learned a path from company B could attach that document to their own file and view it legitimately, since display permissions derive from the *file's* owner.

**Upload authorisation** — the destination path is computed server-side from the session. The browser never chooses where a file lands, making cross-tenant writes structurally impossible rather than merely checked. The file transfers directly from browser to storage, never through the application, which also sidesteps the 4.5 MB serverless request-body limit.

**Deletion safety** — the route that discards abandoned liveness attempts carries two independent guards: the tenant prefix, and a `-liveness-` marker in the path. The second exists so the route is *structurally incapable* of deleting an ID document even if a bug elsewhere passes it the wrong paths. The first protects other tenants; the second protects the tenant from us.

**TOTP secrets** encrypted at rest with AES-256-GCM, with opportunistic migration of legacy plaintext secrets at login — no downtime, no manual database work, and only secrets whose validity has just been proven get re-encrypted.

**2FA backup codes** stored as HMAC-SHA256 hashes, single-use, consumed at login, with a notification showing the remaining count and an escalating tone as the reserve runs low.

**WebAuthn challenges** expire after two minutes. Previously they never expired, so a signed response obtained by an attacker could be replayed weeks later. Challenges with no expiry date are treated as expired — fail-closed by default.

**Password reset tokens** stored as SHA-256 hashes, not bcrypt. Deliberate: bcrypt's slowness protects guessable human passwords, but a 256-bit random token is unguessable anyway — and bcrypt's per-hash salt would make lookup by hash impossible without scanning every row.

**Anti-enumeration** on password reset (generic response regardless of whether the account exists) and passkey login (HMAC-derived decoy credentials).

**Rate limiting** on eleven routes via Upstash sliding windows, with per-route thresholds and fail-open on Redis outage — a monitoring incident should not lock every user out.

**Content Security Policy** in enforcing mode, after a period in report-only to observe violations.

**Audit trail** on every file, recording the agent, the modules run, each verdict, and the resulting score.

---

## Testing and CI

Fourteen Playwright tests run on every push via GitHub Actions, in about 1m40s:

- Unauthenticated access to protected API routes is refused
- The deleted `fix-scores` endpoint is gone
- The cron endpoint rejects calls without the shared secret
- Password reset does not reveal whether an account exists
- Security headers are present
- Public pages render
- `/dashboard` redirects unauthenticated visitors

That last one settled a question open since the first audit: **NextAuth v4's `withAuth` does work on Next.js 16.**

The suite is deliberately security-focused. Unit tests on business logic are the clearest remaining gap — see below.

---

## Known limitations

Stated plainly, because a control whose limits are unknown is a control that is trusted wrongly.

**Liveness does not stop a pre-recorded video.** A printed photo or a phone screen is blocked — neither can open its mouth on request. A genuine video of the real person, played back full-screen, is not reliably distinguishable. This is not a weakness of the model but of the available information: **a 2D image does not contain depth.** Commercial vendors use infrared, structured light, or skin-texture analysis under controlled lighting. The random two-action challenge raises the attack cost substantially, but does not close it.

**Duplicate detection does not scale.** Cost is linear — one API call per compared file. It will catch an active fraud ring submitting several files in a short window. It will not catch an identity reused six months later. Production would need embeddings and a vector index.

**Gemini's free tier may use requests for model training.** Acceptable for demonstrations with fictitious documents; incompatible with real customer data. The paid tier excludes that use.

**OpenSanctions is free for non-commercial use only.** Compliance screening inside a for-profit business is commercial and requires a paid data licence.

**FATF lists are hardcoded and must be maintained.** They are revised roughly three times a year. A stale list is worse than none — it gives the appearance of a current control.

**Tunisian ID cards carry no expiry date**, so the `documentExpired` rule never fires on the primary market. It applies only to passports and driving licences.

**The name sent to sanctions screening contains transliteration artefacts.** *Dit* — the Latin rendering of شهرة, an administrative convention rather than part of the name — adds noise to the query. Harmless on a clean file, but it could push a genuine near-match below the matching threshold.

**The schema is managed with `prisma db push`, not migrations.** No migration history, no rollback, not reproducible on another database. An accepted trade-off on a solo project, but a real one.

**Test coverage is security-focused only.** No unit tests on the business logic — the rules engine, `lib/arabic.ts`, token verification, age computation. The clearest remaining gap.

**Passkeys behave differently across mobile browsers.** Registration and login work in Safari on iOS; they fail in Chrome for iOS and the Google app. The `NotAllowedError` message also reads "Registration cancelled by user" even when nothing was cancelled, which is misleading.

**Two header components are 80% duplicated.** `header.tsx` and `HeaderCustomers.tsx` share the notification bell and user menu but differ in their search bar. A single parameterised component would be better.

**Email deliverability depends on infrastructure this project does not own.** See decision 17.

---

## Roadmap

In priority order, from the gap analysis against commercial vendors:

1. **Ongoing sanctions re-screening.** Watchlists change daily; a customer cleared today may be sanctioned next month, and nothing currently revisits closed files. The weekly cron already exists as a host. Best value-to-effort ratio on the list.
2. **Document authenticity.** The reverse side is never captured, passport MRZ checksums are not verified, and no tampering or photo-of-screen detection runs on the ID image itself.
3. **CDD data collection.** No address, proof of address, occupation, source of funds or purpose of relationship — all required for the enhanced due diligence the engine itself demands on PEP files.
4. **Maker-checker.** A single agent can currently approve a high-risk file alone.
5. **Device handoff via QR code** for workstations without a camera — the proper answer, rather than a file-upload fallback.
6. **Asynchronous pipeline.** Verification currently runs inside the request/response cycle, within a 60-second budget. A job queue would remove that ceiling entirely.
7. **Unit tests on business logic.**
8. **Usernameless WebAuthn** (discoverable credentials) — eliminates enumeration by construction, but requires reworking the login UI.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript |
| Styling | Tailwind CSS |
| Database | PostgreSQL on Supabase, Prisma 7 |
| Auth | NextAuth v4 — password + TOTP, WebAuthn passkeys, Google OAuth |
| Storage | Supabase Storage, private bucket, signed URLs only |
| AI | Gemini Vision — OCR, facial comparison, liveness |
| Rules engine | json-rules-engine |
| Rate limiting | Upstash Redis, sliding window |
| Screening | OpenSanctions API |
| Payments | Stripe |
| Email | Nodemailer |
| Charts | Recharts |
| Tests | Playwright, GitHub Actions |
| Hosting | Vercel |

---

## Running locally

```bash
npm install
cp .env.example .env      # fill in the values
npx prisma generate
npx prisma db push
npm run dev
```

Requires accounts on Supabase, Upstash, Google AI Studio, OpenSanctions and Stripe — all usable on free tiers.

```bash
npm run build             # production build
npx playwright test       # security test suite
npx tsc --noEmit          # type check
```

---

## A note on the AI usage

Two distinct kinds of AI work run in this project, and keeping them separate is the point.

**Judgement** — Gemini reads documents, compares faces, and evaluates liveness poses. These are tasks with no closed-form answer, where a model's opinion is genuinely the best available tool. Its outputs are treated as verdicts, never as measurements, and every one of them fails closed.

**Measurement** — `lib/arabic.ts` computes edit distances and match ratios; the rules engine sums weighted facts deterministically. Same inputs, same outputs, every time.

The decisions I am most confident about in this codebase are the ones where I worked out which of the two a given problem needed — and, in the case of duplicate detection, why the tool I wanted for the second was not available at all.
