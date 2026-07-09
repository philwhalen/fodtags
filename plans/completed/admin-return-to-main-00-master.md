# Admin "Return to main view" — Master Plan

Implements the context-aware auth-control navigation affordance specified in
Spec 10 §10.1.1 ("One unified auth control" + acceptance walkthrough).

## Goal

Inside the admin area, the header auth control's navigation button — currently
**"Admin panel"** (a no-op link to `/admin`, the page you are already on) — is
replaced by **"Return to main view"**, which navigates the director back to the
public default view (`/`). On the **public** site the button is unchanged
("Admin panel" → `/admin`). "Logout" is unchanged in both contexts.

## Architecture decisions (resolved during planning)

1. **Decision stays in the pure model.** `src/lib/auth-control.ts`
   (`authControlModel`) already owns the state decision so it is unit-testable
   without a renderer. The surface (public vs admin) is threaded in as an
   argument, not decided inside the React component — keeping the one testable
   seam intact.
2. **`authControlModel(session, surface)`** gains a second param
   `surface: "public" | "admin"` (default `"public"` so existing call sites and
   intent are preserved). The director branch varies only the nav
   **label + href**:
   - `surface: "public"` → `panelLabel: "Admin panel"`, `panelHref: "/admin"`.
   - `surface: "admin"` → `panelLabel: "Return to main view"`, `panelHref: "/"`.
   Field names (`panelLabel`/`panelHref`) are kept — lowest blast radius; only
   the literal string-union types widen to the two options.
3. **`<AuthControl surface />` prop.** The server component takes an optional
   `surface` prop (default `"public"`) and passes it through to the model. The
   admin layout renders `<AuthControl surface="admin" />`; the public layout is
   left as `<AuthControl />`.
4. **Target is `/`, not a season path.** `/` root-redirects to the current
   season default (`/2026/championship/pool-a` today), so pointing at `/` stays
   correct as default-season logic evolves. Matches the user's "root/default
   dashboard all users see" intent. `/` is a typed route, so `next/link`'s
   typed href accepts it.

## Sub-plans & checklist

Execute in order; test and verify between each chunk. Each chunk is
independently testable.

- [x] **01 — Context-aware auth control** (`01-context-aware-auth-control.md`) — ✅ done, green. `authControlModel(session, surface)` + `RETURN_TO_MAIN_HREF`/`AuthControlSurface` exports; `<AuthControl surface>` prop; admin layout passes `surface="admin"`; doc-comments updated. Tests: added admin-surface cases + admin-layout mount assertion. Verify: typecheck ✓, lint ✓, vitest 458 passed/1 skipped ✓, `next build` ✓.
  - Add `surface` param to `authControlModel` + widen director label/href
    types; add `surface` prop to `<AuthControl>`; render
    `surface="admin"` in `src/app/admin/layout.tsx`; update the admin-shell
    doc-comment. Update `auth-control.test.ts` and `public-shell.test.ts`
    assertions and add admin-surface cases. Verify: `tsc`, lint, vitest,
    `next build`.

## Token/cost accounting

Orchestrating model: Opus 4.8 (planning + inline implementation — single small
chunk, no sub-agents per CLAUDE.md default).

| Chunk | Model | Input | Cache read | Output | Notes |
|-------|-------|-------|-----------|--------|-------|
| Planning | Opus 4.8 | — | — | — | (fill in on completion) |
| 01 | Opus 4.8 | — | — | — | (fill in on completion) |
| **Total** | | | | | |
