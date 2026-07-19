# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**TrustVerify** — a B2B multi-tenant KYC (Know Your Customer) SaaS. Companies onboard, and their agents/admins process identity-verification "dossiers" (`VerificationRequest`) through an OCR + AML/PEP screening + biometric + rules-engine pipeline that produces a 0–100 risk score.

Comments and commit messages are mixed French/English; several core files (`prisma/schema.prisma`, `lib/rbac.ts`, `lib/prisma.ts`, `lib/logger.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/api/customers/route.ts`, security-settings routes) carry deliberately detailed French comments explaining *why*, not just *what* — read them before modifying those files, and match the existing tone/thoroughness for comments in security-sensitive code.

A standing audit lives at `roadmap_trustverify_v2.md` — a prioritized list of known security gaps and roadmap phases (A: pre-deploy blockers, B: hardening, C: liveness/biometrics, D: public API ecosystem, E: tests/CI, F: observability, G: i18n/a11y, H: differentiators). Check it before assuming something is "done"; some Phase A items (e.g. `/api/fix-scores`, cron auth) have already been fixed post-audit — verify current code rather than trusting the doc blindly.

## Commands

```
npm run dev      # starts Next.js dev server via scripts/dev-safe.js (Windows-safe: kills stale next.exe, clears .next lock files, then runs `next dev`)
npm run build    # next build
npm run start    # next start
npm run lint     # eslint
```

There is no test suite or CI configured yet (tracked as Phase E in the roadmap). Don't assume `npm test` exists.

Database: Prisma 7 against Postgres (Supabase). Standard Prisma CLI commands apply (`npx prisma migrate dev`, `npx prisma studio`, `npx prisma generate`) — config is in `prisma.config.ts` / `prisma/schema.prisma`, not `package.json`.

## Architecture

**Multi-tenancy is the central invariant.** `Company` is the tenant root; almost every model (`User`, `VerificationRequest`, `AuditLog`, `ApiKey`, `Notification`) carries a `companyId`. There are no Postgres RLS policies — isolation is enforced entirely at the application layer. Every Prisma query touching tenant data **must** filter by `companyId`, and that `companyId` must come from the server-side session, never from the request body/query string (a malicious client could otherwise read/write another company's data).

**RBAC gate (`lib/rbac.ts`):** every protected API route starts with
```ts
const guard = enforceRole(session, ["COMPANY_ADMIN"]); // or ["COMPANY_ADMIN", "COMPANY_AGENT"]
if (!guard.isValid) return guard.response!;
const { companyId, userId } = guard;
```
Two roles only: `COMPANY_ADMIN` (team/billing/API keys) and `COMPANY_AGENT` (day-to-day KYC processing). Use `guard.companyId`/`guard.userId` for all writes and lookups — never trust IDs from the client.

**Auth (`app/api/auth/[...nextauth]/route.ts`):** single NextAuth `CredentialsProvider` handles two distinct flows by inspecting which fields are present in `credentials` — passkey (WebAuthn) login and password (+ optional TOTP 2FA) login — plus a separate `GoogleProvider` for OAuth. Session strategy is `jwt` (no DB session table); the `jwt`/`session` callbacks are the only place `companyId`/`role`/`companyPlan`/`totpEnabled` get copied from the DB into the token, so any new field agent code needs client-side has to be threaded through there too. First-time Google sign-in auto-creates a `Company` + `COMPANY_ADMIN` user in a transaction.

**Route protection:** `proxy.ts` at the repo root is Next.js's new middleware convention (Next 16 renamed `middleware.ts` → `proxy.ts`); it wraps `withAuth` and gates `/dashboard/:path*`. Note this only guards page routes — API routes under `app/api/**` are *not* covered by this matcher and rely on `enforceRole` individually.

**MFA lockout:** `app/dashboard/layout.tsx` force-redirects any authenticated user without `totpEnabled` to `/dashboard/settings` and hides all other nav until they enable 2FA — this is enforced client-side in the layout, not via middleware.

**KYC pipeline (`app/api/customers/route.ts` POST)** is the core business logic, run synchronously per submission:
1. Zod validation + RBAC guard
2. Duplicate check (email/CIN already active for this company)
3. Age derivation from `dateOfBirth`
4. OCR of the ID document via `tesseract.js` (`eng+fra+ara`), cross-checked against submitted name/CIN
5. AML/PEP screening via OpenSanctions API, with a hardcoded-keyword local fallback if the API call fails (`performGlobalSanctionsLookup`)
6. Biometric face-match score — **currently trusted from the client** (`face-api.js` runs in-browser in `new-verification/page.tsx` and the score is just Zod-validated as a number). This is a known, intentionally-unfixed gap per the roadmap (Phase C); don't "fix" it incidentally unless asked.
7. `json-rules-engine` evaluates `lib/kyc-rules.json` (declarative hard-kill/risk-penalty/trust-bonus rules) against a `facts` object assembled from the above, producing a 0–100 score and human-readable `aiRationale`
8. Writes `VerificationRequest` + a first `AuditLog` row in the same call; fires a `Notification` if risk is High

When touching this pipeline, preserve the fact-table → rules-engine → rationale-string pattern rather than hardcoding score logic inline.

**Audit trail (`lib/logger.ts`):** `logSecurityEvent({ action, details, companyId, agentId?, requestId? })` writes to `AuditLog`. It deliberately swallows its own errors (audit-logging failure must never fail the underlying business action). Despite the filename, this only covers the compliance audit log — general app logging is still ad hoc `console.log`/`console.error` throughout (structured logging is a roadmap item, Phase F).

**Prisma client (`lib/prisma.ts`):** singleton using the `PrismaPg` driver adapter over a `pg.Pool`, memoized on `globalThis` in dev only (to survive Next.js hot-reload without exhausting Postgres connections). Always `import prisma from "@/lib/prisma"` — never instantiate `PrismaClient` directly in a route.

**Sensitive-at-rest fields, currently unencrypted (known/tracked, not accidental):** `User.totpSecret` and `ApiKey.key` are stored in plaintext. Don't "helpfully" change the storage format without checking the roadmap (Phase B/D covers encrypting `totpSecret` and hashing API keys) — these are recognized gaps with a planned fix, not oversights to silently patch.

**File uploads** go through Uploadthing (`app/api/uploadthing/`, `utils/uploadthing.ts`); API routes receive only the resulting URLs (`idCardUrl`, `selfieUrl`), never raw files.

**Path alias:** `@/*` maps to the repo root (see `tsconfig.json`).

## Frontend structure

- `app/dashboard/**` — authenticated app (customers list/detail, new-verification wizard, reports, settings, chat, support), gated by `proxy.ts` + the MFA lockout in `app/dashboard/layout.tsx`.
- `app/login`, `app/register`, `app/setup-account` — unauthenticated flows (register goes through email OTP verification before account activation).
- `components/*Setting.tsx` — one component per Settings tab (Profile, Security, Team, Billing, Notifications, Audit, API/Webhooks), all client components fetching their own data.
- `context/NotificationContext.tsx` — polling-based in-app notification provider, wraps the dashboard layout.
- Styling is Tailwind v4 utility classes inline (no CSS modules/styled-components); icons from `lucide-react` and `@remixicon/react` / `remixicon`.
