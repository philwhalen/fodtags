# Feature 2 — Rounds & Ratings — Master Plan

Spec: [`specs/05-Feature-Rounds-and-Ratings.md`](../../specs/05-Feature-Rounds-and-Ratings.md) (amended in the Specify stage of this feature).

## Context: what already exists (Common A/B + Feature 1)

- **Data is all present.** `event_results` carries `rawScoreToPar`, `roundRating`, `playerRatingReported`, `roundFinal`, `holderId`, `displayName`; `events` carries `label`, `eventDate`, `roundOrdinal`, `type` (`LeagueNight`/`Tournament`/`FODOpen`), `canceled`, `eventSourceId`; `event_sources` gives the category (`EARLY`/`MID`/`LATE`/`TOURNAMENT`/`FOD_OPEN`); `ratings_history` carries official/unofficial rows; `tag_holders` carries `name`/`tagNumber`/`active`. Real PDGA ingestion (Common B) populates all of this.
- **Read-model publish pipeline is built.** `buildViews(seasonYear)` (`src/server/readmodel/build.ts`) produces the view rows; `recompute` → `publish` writes a new version and flips `published_pointer` atomically; public pages read via `getPublished(seasonYear, viewKey)`.
- **Public shell is built.** `FreshnessHeader` / `StaleBadge` / `PendingReviewBanner` / `EmptyStandingsState`, `PublicNav` (the **Rounds & Ratings** nav item already points to `/{season}/rounds`), `public-shell.css` with `--shell-*` tokens, and the leaderboard controls/name-filter pattern (`LeaderboardControls`, `FilterableStandings`, pure `buildLeaderboardLinks` / `filterRowsByName`).
- **`slugifyName`** exists (local to `StandingsTable.tsx`) and is the profile-link slug convention; `/{season}/players/[slug]/page.tsx` is still a `ComingSoon` (Profiles = Feature 6, built last).

`rounds/page.tsx` and `players/[slug]/page.tsx` are `ComingSoon` placeholders today.

## Key architectural decision (Plan stage)

**Rounds is a read-only projection, not a scoring computation.** The pure engine (`computeSeason`) produces standings/score-sheet/OLP/skins but **no per-round output**, and `loadSeasonSnapshot` deliberately drops `roundFinal`/`playerRatingReported`/event `label`. Therefore:

- The **`rounds` read-model view is built directly from repositories** in the read-model layer (allowed I/O at that edge — same layer that already resolves holder names in `build.ts`). **We do NOT touch `computeSeason` or `loadSeasonSnapshot`.** The engine stays pure and untouched.
- All **filter / projection / ordering / trend-series logic lives in pure `src/lib/` helpers** (client-safe, no server imports) — the tested correctness core, matching the project's "pure unit tests are the priority" and the Feature-1 structure.
- **Public pages read only the published `rounds` view.** Filters (`?league`, `?types`) are parsed server-side into the projection; the name search (`?q`) is client-side over already-projected roster rows.

## Decisions locked (from the Specify stage's four answers + plan-stage follow-ons)

- **All-players view = roster list, drill in** (§5.1/§5.2): one row per active holder (name, tag #, present rating, round count, mini trend); row → `/{season}/players/{slug}/rounds`.
- **Shareable query-param filters** (§5.4/§5.7): `?league=early|mid|late` (absent = All) and `?types=ln,tournament,fodopen` (absent = `ln`); `types` ignored when `league` is set. `?q=` mirrors the client-side name search.
- **Round-rating sparkline** for trend (§5.5), derived from the filtered rounds' round ratings; degrades to nothing at <2 rated rounds; carries a text alternative.
- **"—" (Unrated)** present rating when no official rating on file (§5.5).
- **Ordering** (plan): present rating desc, unrated last, tag-number tie-break; the leading index is a row number, not a rank.
- **One `rounds` view** carries every active holder + their full rounds array + present rating + per-league stale flags; both the roster page and each per-player page read it and slice (no N per-player views — a small league keeps one JSON payload cheap).
- **Single `rounds` payload staleness** is per-sub-league (`staleLeagues`) plus an overall flag, so a league-scoped view shows only that source's staleness without the page reading `event_sources`.
- **`slugifyName` promoted to `src/lib/`** (pure, shared) and reused for the roster row link and server-side slug→holder resolution. Slug collisions (two holders → same slug) are a known limitation deferred to Profiles (Feature 6); resolve to the first match and note it.

## Non-negotiables carried from CLAUDE.md / spec 12

- **Engine untouched & pure.** No new logic in `src/server/engine/`; no change to `loadSeasonSnapshot`.
- **Public reads only the read model.** Pages call `getPublished(season, "rounds")`; never read `event_results`/`event_sources` directly.
- **Server-only stays server-only.** The build helper imports repositories under `src/server/`; the pure helpers + payload types live in `src/lib/` with no server imports (so client components can import them).
- **Deep links reproduce the exact view.** Controls resolve to §5.7 URLs; `?league`/`?types`/`?q` restore state on load.
- **Accessibility** (§5.5, Spec 11): the sparkline is never the sole carrier — `aria-label` + visually-hidden numeric list; degrades cleanly.

## Sub-plans (small, independently testable chunks)

| # | Sub-plan | What it delivers | Independently testable by |
|---|----------|------------------|---------------------------|
| 01 | [`01-pure-helpers.md`](./01-pure-helpers.md) | Payload types + pure `src/lib/` helpers: `parseRoundsFilter`, `buildRoundsLinks`, `filterHolderRounds`, `summarizeRoster`, `roundTrendSeries`, `sparklinePath`, roster name filter, `slugifyName` promotion. | Table-driven Vitest (filter interactions, league-forces-ln, ordering/unrated-last, newest-first, trend series, path math). |
| 02 | [`02-readmodel-build.md`](./02-readmodel-build.md) | `buildRoundsView` (repository join → `PublicRoundsPayload`) wired into `buildViews`; present rating (latest official), pending, canceled-omit, sub-league attribution, `staleLeagues`. | Extend `build.test.ts`: seed holders/events/results/ratings/sources → assert payload shape/edge cases. |
| 03 | [`03-sparkline-and-controls.md`](./03-sparkline-and-controls.md) | `Sparkline` (accessible inline-SVG component over `sparklinePath`) + `RoundsControls` (client sub-league segmented control + event-type toggles, navigating via `buildRoundsLinks`). CSS in `public-shell.css`. | `sparklinePath` unit tests (01); component render is thin over tested helpers; a11y attributes asserted where feasible. |
| 04 | [`04-roster-page.md`](./04-roster-page.md) | `rounds/page.tsx` (replaces `ComingSoon`): read `rounds` view, parse filter, `summarizeRoster`, render controls + `FilterableRoster` (client name search + `?q=` sync) with per-row sparkline + drill-in links; freshness/stale/pending/empty states. | Page reads published view (integration seed+publish); pure summarize covered in 01; empty/pre-season path. |
| 05 | [`05-per-player-page.md`](./05-per-player-page.md) | `players/[slug]/rounds/page.tsx` (new): slug→holder resolve, present-rating header + sparkline, newest-first rounds table (Date / Sub-league / Event·Round / Score / Round rating with "pending"); inherits `?league`/`?types`; `notFound` on bad slug; friendly no-rounds note. | Integration seed+publish → slug resolves, rows correct/newest-first, pending rendered, filter inheritance. |
| 06 | [`06-integration.md`](./06-integration.md) | Wire-up review (nav, roster→per-player links, no server imports leaking to client/lib), integration tests, full `typecheck → lint → test → build`. | New integration tests + green CI gate. |

**Recommended order:** 01 → 02 → 03 → 04 → 05 → 06. (02 needs 01's payload types; 03 needs 01's `sparklinePath` + `buildRoundsLinks`; 04 needs 02's view + 03's components; 05 needs 02's view + 03's `Sparkline`; 06 closes out.)

## Test strategy

- **Pure helpers first** (`src/lib/rounds-*.ts`): table-driven Vitest, no DB/DOM/clock. These carry the correctness weight — filter interactions (league × types), ordering (rating desc / unrated last / tag# tie-break), newest-first rounds, trend-series derivation (rated-only, chronological, <2 → empty), sparkline path math, and the `league`-forces-`ln` rule.
- **Build test** extends `src/server/readmodel/build.test.ts`: seed a small fixture and assert the `rounds` payload — present rating from the latest **official** row (unofficial ignored), `null`/Unrated when none, `pending` when `roundRating` null, canceled events omitted, sub-league attribution (LeagueNight→league; Tournament/FODOpen→null), and `staleLeagues`.
- **Page/integration tests** follow the Feature-1 precedent (no jsdom/route harness in repo): seed → `recompute`/`publish` → assert the published `rounds` view and the pure projection the pages perform (roster summary at a filter; per-player slice + newest-first). Client components (`FilterableRoster`, `RoundsControls`, `Sparkline`) stay thin over tested pure helpers.
- **Full gate** each chunk: `npm run typecheck && npm run lint && npm run test`, and `npm run build` on chunks that add routes/components.

## Token / cost accounting (fill in as implementation proceeds)

Per CLAUDE.md, this feature tracks the cost of building it. Update after each chunk. This feature was implemented via **Composer 2.5 sub-agents** (one per sub-plan), at the user's request.

**Pricing basis — Composer 2.5 Fast (public, per Cursor changelog May 18 2026):** $3.00 / 1M input tokens, $15.00 / 1M output tokens. (Standard tier is $0.50 / $2.50; Fast is the IDE default and the tier used here.)

| Chunk | Input tok | Output tok | Cost (USD) | Notes |
|-------|-----------|------------|------------|-------|
| Specify stage | — | — | — | spec 05 rewrite (pre-plan) |
| Plan stage | — | — | — | this file + sub-plans |
| 01 pure-helpers | ~45k | ~10k | ~$0.29 | done — 5 lib modules + 41 tests; suite 188 pass (est. tokens) |
| 02 readmodel-build | ~45k | ~13k | ~$0.33 | done — buildRoundsView + 9 tests; suite 197 pass; engine untouched (est. tokens) |
| 03 sparkline-and-controls | ~35k | ~4k | ~$0.17 | done — Sparkline + RoundsControls + CSS; build green (est. tokens) |
| 04 roster-page | ~55k | ~10k | ~$0.32 | done — roster page + FilterableRoster + 5 integration tests; suite 202 pass; build green (est. tokens) |
| 05 per-player-page | ~35k | ~6k | ~$0.20 | done — per-player page + PlayerRoundsView + 4 tests; suite 206 pass; build green (est. tokens) |
| 06 integration | ~40k | ~8k | ~$0.24 | done — wire-up + 5 integration tests; full gate green (est. tokens) |
| **Total** | ~255k | ~51k | ~$1.55 | 6 Composer 2.5 sub-agent runs |

**Accounting notes.** Figures are each sub-agent's own best-effort token estimates (the harness does not surface exact per-run billing here), so treat them as ±30%. Cost = input×$3/1M + output×$15/1M (Composer 2.5 Fast). These count only the sub-agents that wrote the code; the orchestrating agent's context-gathering and between-chunk verification (typecheck/lint/test/build runs) are additional and not included. At Composer 2.5 **Standard** rates ($0.50/$2.50) the same token volume would be ≈$0.26 total.

## Progress log (append notes / deviations here during Implement stage)

- **06 integration:** Removed `/{season}/rounds` from `placeholderRouteHrefs` (real page now). Extended `rounds-integration.test.ts` with chunk-06 closeout cases (league=late, types=ln,fodopen, scoped staleness, present-rating E2E). Seeded one Late League Night in integration fixture for late-filter coverage. Full gate green.
