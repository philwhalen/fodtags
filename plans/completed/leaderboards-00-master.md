# Feature 1 — Leaderboards — Master Plan

Spec: [`specs/04-Feature-Leaderboards.md`](../../specs/04-Feature-Leaderboards.md) (amended in the Specify stage of this feature).

## Context: what already exists (Common Work A/B)

The leaderboard **data path is built.** The read-model build (`src/server/readmodel/build.ts`)
produces Championship (both pools) + all three sub-leagues (both pools); the pages
(`app/(public)/[season]/championship/[pool]`, `.../sub-league/[league]/[pool]`) read the
published views; `StandingsTable` renders ranks with tie-break markers + profile links;
`FreshnessHeader` / `StaleBadge` / `PendingReviewBanner` / `EmptyStandingsState` exist and
work; the root route + "Leaderboards" nav land on `championship/pool-a`.

This feature adds the **interaction layer** spec 04 describes but nothing yet implements:
the scope/pool toggles + sub-league picker, the "current sub-league" resolution and the
`/sub-league` redirect alias, and the client-side name filter.

## Decisions locked (Plan stage)

- **Q (toggle state):** preserve pool across scope switches; Sub-league scope defaults to the
  current sub-league. Preservation is *URL-shaped* — controls emit the destination deep link
  keeping the unchanged axis fixed; **no hidden client state.** (Spec 04 §4.1/§4.6.)
- **Q (current-sub-league URL):** a stable **redirecting alias** `/sub-league` (+ `/sub-league/<pool>`);
  explicit `/sub-league/<league>/<pool>` never redirects. (Spec 04 §4.5.)
- **Q (name search):** **filter** the list to matching rows; never re-ranks; per-view; client-only.
  (Spec 04 §4.7.)
- **Q (boundary / current resolution):** publish sub-league windows as a small **`sub-leagues`
  meta read-model view**; public routes read only the read model and resolve "current" at
  **request time** against the ET clock (clock-fresh; follows the season between refreshes).
  Window edits take effect on the next refresh.

## Non-negotiables carried from CLAUDE.md / spec 12

- **Engine stays pure.** No new logic in `src/server/engine/`. The `resolveCurrentSubLeague`
  helper is a **pure date function in `src/lib/`** (client-safe, no server imports).
- **Public reads only the read model.** New alias routes read the `sub-leagues` meta view via
  `getPublished`, never `event_sources` directly.
- **Toggles/filter add no server round-trips beyond normal navigation.** The filter is
  client-only; toggles are `<Link>`/redirect navigation to existing SSR pages.
- **Deep links reproduce the exact view** — every control resolves to a §4.5 URL.

## Sub-plans (small, independently testable chunks)

| # | Sub-plan | What it delivers | Independently testable by |
|---|----------|------------------|---------------------------|
| 01 | [`01-current-sub-league.md`](./01-current-sub-league.md) | Pure `resolveCurrentSubLeague` + ET `todayEt` helper; `sub-leagues` meta view published by the build. | Pure unit tests (in-window / gap / pre-season / post-season / empty); build test asserts the meta view. |
| 02 | [`02-alias-routes.md`](./02-alias-routes.md) | `/sub-league` + `/sub-league/[league]` redirect routes reading the meta view; pool-preserving. | Pure `resolveAliasTarget` unit tests; route smoke test. |
| 03 | [`03-toggle-controls.md`](./03-toggle-controls.md) | `LeaderboardControls` (scope/pool/sub-league picker) client component + `buildLeaderboardLinks` pure helper; wired into both pages via `StandingsView`. | Pure href/preservation unit tests; a11y attribute assertions. |
| 04 | [`04-name-filter.md`](./04-name-filter.md) | `filterRowsByName` pure helper + `FilterableStandings` client wrapper + search input. | Pure filter unit tests; no-match message. |
| 05 | [`05-integration.md`](./05-integration.md) | Wire-up review, page/integration tests, full `typecheck → lint → test → build`. | Integration tests + green CI gate. |

**Recommended order:** 01 → 02 → 03 → 04 → 05. (02 needs 01's resolver + meta view; 03 needs
01's `currentSubLeague` for its default target/marker; 04 is independent of 02/03 but shares
`StandingsView` wiring with 03, so it lands after; 05 closes out.)

## Test strategy

- **Pure helpers first** (`resolveCurrentSubLeague`, `resolveAliasTarget`, `buildLeaderboardLinks`,
  `filterRowsByName`, `todayEt`) — all in `src/lib/`, table-driven Vitest, no DB/clock/DOM.
  These carry the correctness weight and match the project's "pure unit tests are the priority."
- **Build test** extends `src/server/readmodel/build.test.ts` to assert the `sub-leagues` meta view.
- **Route/page tests** for the alias redirect target and that the default/empty/pre-season states
  still render (existing patterns in `*.test.ts`).
- Client components (`LeaderboardControls`, `FilterableStandings`) are kept thin — logic lives in
  the pure helpers they call, so the components need only light rendering/interaction checks.

## Token / cost accounting (fill in as implementation proceeds)

Per CLAUDE.md, this feature tracks the cost of building it. Update after each chunk.

| Chunk | Input tok | Output tok | Cost (USD) | Notes |
|-------|-----------|------------|------------|-------|
| Specify stage | — | — | — | spec 04 amendments (pre-plan) |
| Plan stage | — | — | — | this file + sub-plans |
| 01 current-sub-league | 74212 (subagent) | — | — | ✅ done; 18/18 chunk tests pass, full suite 124 pass/1 skip. No deviations. |
| 02 alias-routes | 65692 (subagent) | — | — | ✅ done; 8/8 chunk tests, full suite 132 pass/1 skip. No route-test harness in repo → thoroughly unit-tested `getCurrentSubLeagueSlug` (seed+publish+fake timers) instead. |
| 03 toggle-controls | 66144 (subagent) | — | — | ✅ done; 7/7 chunk tests, full suite 139 pass/1 skip, `next build` green. No deviations. |
| 04 name-filter | 53691 (subagent) | — | — | ✅ done; 6/6 chunk tests, full suite 145 pass/1 skip, `next build` green. No deviations. |
| 05 integration | 92670 (subagent) | — | — | ✅ done; wire-up review clean (no drift, no leaks); 3 new integration tests added; full suite 148 pass/1 skip, typecheck/lint/build all green. No deviations. |
| **Total** | ~352k subagent tok (+ orchestration) | — | — | 5 chunks, all Sonnet 5 subagents; each independently re-verified by orchestrator. |

## Progress log (append notes / deviations here during Implement stage)

- **Stage-4 iteration (unified view control):** per user request, replaced the two-level "Championship | Sub-league" scope toggle + separate Early/Mid/Late picker with a **single segmented control** — `Overall Championship · Early · Mid · Late` — the current sub-league marked "(now)". Spec §4.1/§4.6/acceptance updated in place. `buildLeaderboardLinks` dropped the now-unused `subLeagueHref` and its `currentSubLeague` param (each sub-league is a direct option; the current slug is used only by the component for the "(now)" marker). `LeaderboardControls` collapsed to one view group + the unchanged pool group. Tests updated (`leaderboard-links.test.ts`, `leaderboard-integration.test.ts`). No CSS change needed (`.lb-segment` already wraps). Full gate green: typecheck/lint clean, 147 pass/1 skip, `next build` OK.

- **05 done** (Sonnet 5 subagent): Wire-up review — root redirect + `publicNavItems` still land on `/2026/championship/pool-a` with no separate top-level "Sub-league" nav item (unchanged, no drift); `StandingsView`'s "Podium bonus not yet finalized" note is driven by `payload.finalized === false`, which `build.ts` still derives from `results.podium[type].complete` (confirmed via `build.test.ts`'s existing finalized assertions — copy matches §4.3, no change needed); confirmed no `server-only`/`@server/*` import in any client component (`LeaderboardControls.tsx`, `FilterableStandings.tsx`) or in `src/lib/*.ts` (grep-verified; only a code comment mentions "server-only" in `src/lib/index.ts`, not an import). No fixes needed — chunks 01-04 wired everything correctly.
  Added `src/server/readmodel/leaderboard-integration.test.ts` (3 new tests) to close the two gaps the sub-plan called out that 01-04's tests didn't cover: (1) a sub-league standings payload's rank/shape (contiguous rank, correct pool, boolean tie-break flag, weakly-descending points) at a **resolved** current sub-league (`sub-league/mid/pool-b` for the seeded gap date 2026-07-04), rather than only at the hardcoded pools `build.test.ts` already checks for Championship; (2) end-to-end composition of `getCurrentSubLeagueSlug` output directly into `buildLeaderboardLinks` (not a hardcoded `"mid"`) for both the gap date (→ mid) and the pre-season date 2026-01-01 (→ early), asserting the Sub-league control href from a Championship·Pool-B/Pool-A view. Pre-season and gap-date resolution were already independently covered in `current-sub-league.test.ts` and `currentSubLeague.test.ts`; the new tests specifically verify the *composition* the pages perform, not the resolver in isolation. All table-driven, deterministic (fake timers on a fixed `today`), node-env, no jsdom.
  Full gate: `npm run typecheck` clean, `npm run lint` clean, `npm run test` → **148 passed / 1 skipped** (up from 145/1; +3 new), `npm run build` → succeeded (Next.js 16.2.10, Turbopack, all routes compiled, including `/[season]/sub-league`, `/[season]/sub-league/[league]`, `/[season]/sub-league/[league]/[pool]`, `/[season]/championship/[pool]`). No deviations from the sub-plan; no chunk 01-04 code changed.
- **04 done** (Sonnet 5 subagent): `filterRowsByName` (pure, `src/lib/filter-rows.ts`, exported from `src/lib/index.ts`) — empty/whitespace query is identity, else substring match via existing `normalizeName` on both row name and query; returns a filtered subset of the same row objects (rank/points untouched, no re-ranking). `FilterableStandings` (`"use client"`, `src/components/public/FilterableStandings.tsx`) holds `query` state, memoizes the filtered rows, renders a labeled `<input type="search">` + explicit "Clear" button (disabled when query is empty), and shows `StandingsTable` when `filtered.length > 0` or a `No players match "<query>"` message (role="status") otherwise. `StandingsView`'s populated branch now renders `<FilterableStandings>` instead of `<StandingsTable>` directly; the empty/all-zero branch and the chunk-03 `controls` slot were left untouched. Added `.standings-filter*` styles to `public-shell.css`, mobile-first, reusing existing `--shell-*` tokens. 6/6 new pure filter tests green; full suite 145 pass/1 skip; typecheck/lint/build all green. No deviations from the sub-plan.
- **03 done** (Sonnet 5 subagent): `buildLeaderboardLinks` (pure, `src/lib/leaderboard-links.ts`) + `LeaderboardControls` (`"use client"`) implementing the scope/pool segmented controls and the sub-league picker (current one marked with "· now", `aria-current="page"` on the active option in each `role="group"`). `StandingsView` gained an optional `controls?: ReactNode` slot rendered in the header (covers both populated and empty/pre-season paths automatically, since both render through the same header). Both pages (`championship/[pool]`, `sub-league/[league]/[pool]`) now resolve `getCurrentSubLeagueSlug(seasonYear) ?? "early"` and pass a rendered `<LeaderboardControls>`. Added `.lb-controls`/`.lb-segment`/`.lb-segment-option`/`.lb-picker` styles to `public-shell.css`, mobile-first, reusing existing `--shell-*` tokens. 7/7 new pure link tests green; full suite 139 pass/1 skip; typecheck/lint/build all green. No deviations from the sub-plan.
- **02 done** (Sonnet 5 subagent): `resolveAliasTarget` (pure), `getCurrentSubLeagueSlug` (server-only, reads meta view), and the two redirect routes (`/sub-league`, `/sub-league/[league]`) with pool preservation + `notFound` on garbage. **Repo has no page/route test harness** (vitest collects `src/**/*.test.ts`, no jsdom) → tested via pure `resolveAliasTarget` + `getCurrentSubLeagueSlug` seed/publish/fake-timer tests (covers all route branch logic; routes are thin wrappers). Full suite 132 pass / 1 skip. Deviation: one `as Route` cast on the runtime-computed redirect target (matches existing codebase pattern).
- **01 done** (Sonnet 5 subagent): `todayEt`, `resolveCurrentSubLeague`, `sub-leagues` meta view + `PublicSubLeagueMetaPayload`. `ViewRow.payload` widened to a union; `publish.ts` unchanged (payload-agnostic). Independently re-verified: 18/18 chunk tests, full suite 124 pass / 1 pre-existing skip. No deviations.
