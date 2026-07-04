# 09 — Public Page & Health

**Goal:** The one public page — `/2026/championship/pool-a` — renders the roster at 0 points from the **published read model** with an "Updated {time} ET" stamp; and `GET /api/health` reports DB + read-model version.

**Spec refs:** §12.10, §12.13; [Spec 04 §4.4 (states)](../../specs/04-Feature-Leaderboards.md), [Spec 11 §11.3](../../specs/11-UX-and-Nonfunctional.md). **Depends on:** 05 (health also touches 03).

## Public page — `src/app/(public)/[season]/championship/[pool]/page.tsx`

- **SSR**, reads **only** `readmodel.getPublished(season, 'championship/pool-a')` ([05]) — never the engine, DB domain logic, or PDGA. (Reading the published payload via the readmodel repo is fine; the rule is "no recompute / no PDGA on the request path.")
- Renders the PDGA-style table columns ([Spec 04 §4.2]): **Rank | Player | Tag # | Points** — all points 0 in the skeleton.
- **Freshness:** show `Updated {payload.updatedAt}` formatted to **ET** ([Spec 03 §3.6] — store UTC, format ET at the edge). A shared formatter in `src/lib/`.
- **Empty state:** roster at 0, not an error ([Spec 04 §4.4]). If nothing is published yet (shouldn't happen post-boot), render a graceful "no data yet".
- Keep styling minimal but mobile-first-legible; full UX is later feature work. Route params drive future pool/sub-league variants; skeleton only needs `championship/pool-a` real (pool-b can share the component if built cheaply).
- Root `src/app/page.tsx` redirects to `/2026/championship/pool-a`.

## Health — `src/app/api/health/route.ts`

- `GET` → JSON `{ status: 'ok', db: 'ok', readModelVersion: <n>, time: ISO }`.
- DB connectivity check: a trivial query (e.g. `SELECT 1` or `getSeason(2026)`).
- Read-model version from `getCurrentVersion(2026)`.
- Non-200 with `status:'error'` if the DB check throws — suitable for the deploy repo's health probe (§12.10).
- No auth.

## Done when

- Visiting `/2026/championship/pool-a` shows the seeded roster, all 0 points, ranked by tag number, with an "Updated … ET" stamp.
- `/api/health` returns 200 with a numeric `readModelVersion` after boot.
