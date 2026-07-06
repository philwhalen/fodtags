# Admin Panel Access — Master Plan

Surfacing admin sign-in state in the app header: an **"Admin login"** button for
signed-out visitors, replaced by **"Admin panel"** + **"Logout"** once a director
is signed in. The admin console itself already exists — this feature is the
public-facing entry point and a unified auth control.

**Spec basis:** [Spec 10 §10.1.1](../../specs/10-Admin-Console.md#1011-public-entry-point--session-controls),
[Spec 11 §11.1](../../specs/11-UX-and-Nonfunctional.md#111-ux-requirements).

## Decisions (from spec stage + architecture)

- **Login screen:** built-in Auth.js sign-in page (`/api/auth/signin`). No custom `/login`.
- **Post-login landing:** straight into `/admin` (`callbackUrl=/admin`).
- **Rejection:** standard Auth.js `AccessDenied` (unchanged allowlist gate in the `signIn` callback).
- **Unified control:** admin area uses the same header widget; the admin dashboard's
  inline "Signed in as … / Sign out" is removed in favor of it.
- **No client component needed.** The control is a **server component** that awaits
  `auth()`. "Admin login" is a plain `<Link>` to `/api/auth/signin?callbackUrl=/admin`;
  "Logout" is an inline `"use server"` action calling `signOut({ redirectTo: "/" })`
  (same pattern the current admin page uses).
- **Testability (repo constraint):** no React renderer under the `react-server` vitest
  condition. So the state decision lives in a **pure helper** (`authControlModel`) that
  is unit-tested; the component is a thin render of that model. This mirrors
  `public-shell.test.ts`.
- **Dynamic rendering tradeoff (accepted):** placing `auth()` in the `[season]` layout
  makes public pages read the session cookie and render dynamically. Acceptable for this
  app (single low-traffic VM, SSR from local SQLite readmodel already). Not worth a
  client-island workaround.

## Checklist

- [x] **01 — Auth control component + pure model** ([01-auth-control.md](./01-auth-control.md))
  - Pure `authControlModel(session)` helper + unit tests (both states, correct hrefs/labels).
  - `AuthControl` server component (login link / admin-panel link + logout server action).
  - CSS for the control.
- [x] **02 — Public header integration** ([02-public-header.md](./02-public-header.md))
  - Mount `AuthControl` top-right in `app/(public)/[season]/layout.tsx`.
  - Extend `public-shell.test.ts` with model + file-existence assertions.
- [x] **03 — Admin header unification** ([03-admin-unify.md](./03-admin-unify.md))
  - New `app/admin/layout.tsx` with the shared header + `AuthControl`.
  - Strip inline "Signed in as … / Sign out" from `app/admin/page.tsx`.
- [x] **Verify:** `typecheck` + `lint` + `363 tests` + `next build` all green. Runtime drive
  (production `next start`): signed-out public page renders the "Admin login" control →
  `/api/auth/signin?callbackUrl=/admin`, and `/admin` 307-redirects unauthenticated users
  to that sign-in URL. Signed-in (director) rendering could not be driven at runtime — a
  `next dev` global lock blocked a dev-bypass instance while the user's own dev server was
  running; it is covered by the model unit tests (director branch) + the production build
  compiling the director JSX and inline logout server action.

## Interaction / regression watch

- Middleware (`src/middleware.ts`) is **unchanged** — still the real gate. The button is
  affordance only.
- Dev bypass provider unaffected — the login link hits the same sign-in page (dev-bypass
  button still shows in local dev).
- `app/(public)/[season]/layout.tsx` is a server component and can host the server action.
- Existing admin `signOut({ redirectTo: "/" })` behavior is preserved by the shared control.

## Token / cost accounting

Cost basis: **Opus 4.8 orchestrator, implemented inline** (no sub-agents authorized).
Fill in as chunks complete.

| Chunk | Model | Input tok | Cache read | Output tok | Notes |
|-------|-------|-----------|-----------|------------|-------|
| 01 — auth control | Opus 4.8 | n/i | n/i | n/i | new lib helper + test + component + CSS |
| 02 — public header | Opus 4.8 | n/i | n/i | n/i | layout mount + test extension |
| 03 — admin unify | Opus 4.8 | n/i | n/i | n/i | admin layout + page trim |
| Verify + fixes | Opus 4.8 | n/i | n/i | n/i | full gate + runtime drive |
| **Total** | Opus 4.8 | n/i | n/i | n/i | single Opus session, implemented inline |

`n/i` = not separately instrumented. Per-chunk token telemetry was not exposed to the
run; the whole feature was built inline in one Opus 4.8 session (no sub-agents authorized,
so no cheaper-model cost basis to record). Update these cells if/when session token
figures are available.

## Progress notes

- Placement: the control was mounted **inside `.public-shell-brand`** (with
  `.auth-control { margin-left: auto }`) rather than as a separate header row — that is the
  true top-right of the header, matching the spec intent. Same for the new admin layout.
- Login is a plain `<a>` (not `next/link`): the Auth.js sign-in page is an API route,
  outside the typed-route graph, so a typed `Link` href would be rejected.
- No client component introduced — the control is a server component; logout is an inline
  `"use server"` action (mirrors the pattern removed from `app/admin/page.tsx`).
- `app/admin/page.tsx` outer `<main>` became a fragment since the new `app/admin/layout.tsx`
  now supplies `<main class="public-shell-main">` (avoids nested `<main>`).
