# 08 — Auth & Admin

**Goal:** Auth.js Google sign-in checked against the `directors` table, bootstrap of the first director, middleware gating `/admin/*`, a stub dashboard, and a "Refresh now" route handler that calls `runRefresh`.

**Spec refs:** §12.8; [Spec 10 §10.1](../../specs/10-Admin-Console.md). **Depends on:** 02, 03, 06.

## Auth — `src/server/auth/`

- Auth.js (NextAuth) with the **Google** provider; `AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET` from `config` ([02]).
- **`signIn` callback**: look up the verified email in `directors` via `isDirector(email)` ([03]). Reject non-allowlisted accounts (return false → access denied). This is the allowlist gate.
- Session carries the director email/identity so writes can be attributed for the audit log (audit table exists; wiring full audit is deferred — attach identity now).
- Route handler at `src/app/api/auth/[...nextauth]/route.ts`.

## Bootstrap director — boot step

On boot ([master step 4]): idempotent upsert of `BOOTSTRAP_DIRECTOR_EMAIL` into `directors` (active). The first director can't self-add through the gated UI, so this seeds them; thereafter the table is authoritative. Log whether it inserted or was already present.

## Middleware — `src/middleware.ts`

- Matcher on `/admin/:path*` (and admin API routes). Unauthenticated or non-director → redirect to sign-in / 403.
- Public routes and `/api/health` are untouched.

## Admin UI — `src/app/admin/`

- `page.tsx` — **stub dashboard**: shows signed-in director email, current read-model version, last few `refresh_runs` (via repo), and the **"Refresh now"** button.
- Button posts to the refresh route (below); on success, revalidate / show the new run.

## Refresh route — `src/app/api/admin/refresh/route.ts` (or a server action)

- POST handler, **director-gated** (middleware + re-check in handler).
- Calls `runRefresh({ trigger: 'manual', seasonYear: 2026 })` ([06]) — the **same** pipeline the scheduler uses.
- Returns the run summary; single-flight means a concurrent scheduled run won't collide.

## Done when

- A director email in `BOOTSTRAP_DIRECTOR_EMAIL` can Google-sign-in and reach `/admin`; a non-listed Google account is rejected.
- `/admin/*` is unreachable when signed out.
- Clicking "Refresh now" records a `refresh_runs` row and republishes; the dashboard reflects the new version.
