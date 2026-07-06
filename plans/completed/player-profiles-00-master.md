# Feature 6 — Player Profiles — Master Plan

Spec: [`specs/08-Feature-Player-Profiles.md`](../../specs/08-Feature-Player-Profiles.md) (amended in this feature's Specify stage), with cross-reference updates in specs 04–07, 09, and 11.

## Context: what already exists (Common A/B/C + Features 1–5)

- **Every source view the profile aggregates already exists.** `buildViews` (`src/server/readmodel/build.ts`) publishes championship/sub-league standings, `rounds`, `olp/{early|mid|late}`, `score-sheet/pool-{a|b}`, `financials`, and `sub-leagues` meta. The pure engine already computes everything needed: `championship`, `subLeagues`, `scoreSheet`, `olp`, `olpPot`, `skins`, `financials`, `podium` (`src/lib/season-results.ts`, `src/server/engine/season.ts`). **No engine change is needed.**
- **Partial player routes exist.** `/{season}/players/[slug]` is a `ComingSoon` placeholder; `/{season}/players/[slug]/rounds` is real (loads `rounds` view, resolves holder by slug — collision handling deferred). Nav "Players" points at `/{season}/players/search` (also placeholder).
- **Slug today is naive.** `slugifyName(name)` in `src/lib/slugify-name.ts` with no collision suffix and no holder-ID backing; standings/OLP re-slugify at render time while score-sheet/rounds stamp slug at build time — inconsistent.
- **Skins is engine-only.** `results.skins` (`PoolSkins`: per-pool `SkinsRow[]` with `eligible`, `qualified`) is computed but explicitly **not** published in `buildViews` (comment at lines 125–127). The profile money section requires the first public `skins/pool-*` views (Spec 08 §8.4).
- **Public shell + patterns are built.** `FreshnessHeader`; `getPublished` + `dynamic = "force-dynamic"` + empty branches; client name filter (`FilterableRoster` / `filterRowsByName`); sub-league selector precedent (`LeaderboardControls`, OLP selector); sparkline helpers (`roundTrendSeries`, `sparklinePath`); native `<details>` disclosure; `standings-*` CSS.

## Key architectural decision (Plan stage)

**Player Profiles is a read-only projection/aggregation of existing engine + read-model output — not new computation.** Mirrors Features 2–5:

- **Three new read-model view families** wired into the existing single `computeSeason` pass in `buildViews`:
  1. **`skins/pool-a`, `skins/pool-b`** — first public exposure of `results.skins`, enriched with canonical slugs, pool purse from `results.financials.funds.skins`, `skinsPaidOut`, and per-qualifier projected payout (equal split, largest-remainder in cents).
  2. **`players` (index)** — one row per active tag holder: identity, canonical slug, header fields, roster-index columns. Used for slug resolution, redirect logic, the `/players` landing, and as the single source of truth for link generation.
  3. **`players/{canonical-slug}` (one per holder)** — pre-aggregated profile payload (header flags + five compact sections). Built at publish by joining engine output + holder slices; keeps the profile request path to **one `getPublished` read** (Spec 08 §8.4).
- **Canonical slugs computed once** in a shared pure helper (`buildCanonicalSlugs` in `src/lib/holder-slug.ts`): name-only base; `-{tagNumber}` suffix on collision; stamped on **every** holder-scoped row at build time (rounds, score-sheet, standings, OLP, skins, players). All table links use this slug — no ad-hoc `slugifyName(name)` at render.
- **Display shaping is a pure `src/lib/profile-view.ts` helper** (`projectProfile`): sub-league selector state, "View full …" deep-link targets, projected/final labels, compact section models. Client-safe, unit-tested for reconciliation with source views.
- **Profile page** reads `players/{slug}` (+ `players` index only for redirect resolution), projects, renders five compact sections + header + client sub-league selector (Early · Mid · Late, "(now)" default). `/players/search` → redirect to `/players`.

## Decisions locked (Specify stage — all recommended defaults)

- **Slug:** name-only; `-{tagNumber}` on collision; holder-ID-backed; computed at build; unambiguous non-canonical → redirect; unknown → 404.
- **`/players` landing:** full roster index with name filter; retires `search` placeholder (redirect).
- **Section depth:** compact summaries + "View full …" deep links; rounds shows sparkline + recent 5; points shows per-type subtotals + counted/dropped counts.
- **Sub-league selector:** client-side on profile (URL stays `/players/{slug}`); drives Rounds + OLP detail; Championship always shows overall + current-sub-league standing.
- **Money scope:** OLP projected/final payout per sub-league + skins qualification + projected share; ace/tag-sale/expense out of scope.
- **Header flags:** Pool B accrual active/inactive, OLP eligible (+ reason), skins qualified (+ rating gate reason for Pool B).
- **Skins projected payout:** equal split among qualified holders; largest-remainder in cents; whole purse divided (season-end match pays entire pool).

## Non-negotiables carried from CLAUDE.md / spec 12

- **Engine untouched & pure.** No change to `src/server/engine/` or `loadSeasonSnapshot`.
- **Public reads only the read model.** Pages call `getPublished`; never recompute or touch PDGA on the request path.
- **Server-only stays server-only.** `*-build.ts` under `src/server/readmodel/` import `server-only`; pure types + projection live in `src/lib/` with no server imports.
- **Reconciliation is mandatory.** Profile figures must match the source feature pages for the same refresh — tested explicitly.
- **Accessibility** (Spec 11): eligibility/projected/final as text; sparkline text alternative; semantic section headings; sub-league selector keyboard-operable.

## Sub-plans (small, independently testable chunks)

| # | Sub-plan | What it delivers | Independently testable by |
|---|----------|------------------|---------------------------|
| 01 | [`01-pure-helpers.md`](./01-pure-helpers.md) | `src/lib/holder-slug.ts` (`buildCanonicalSlugs`, `resolveHolderSlug`), `src/lib/profile-view.ts` (payload + view types, `projectProfile`, `buildProfileLinks`, header-flag helpers). Extend `src/lib/index.ts`. | Vitest: slug collision suffix; redirect resolution (`resolveHolderSlug`); `projectProfile` reconciliation (Championship rank/points, score-sheet subtotals, OLP score/payout, skins qualified/payout) against fixture inputs; deep-link hrefs. |
| 02 | [`02-skins-readmodel.md`](./02-skins-readmodel.md) | `src/server/readmodel/skins-build.ts` → `skins/pool-a|b` views from `results.skins` + financials purse + canonical slugs; wire into `buildViews`; extend `ViewRow` union. | `skins-build.test.ts`: qualified top-4 per pool; Pool B >920 ineligible skipped; projected payout shares sum to purse; `skinsPaidOut` flips projected/final; empty pre-season. |
| 03 | [`03-players-readmodel.md`](./03-players-readmodel.md) | `src/server/readmodel/players-build.ts` → `players` index + one `players/{slug}` view per holder; refactor `rounds-build`, `score-sheet-build`, and `build.ts` standings/OLP rows to stamp canonical slugs via shared helper; wire into `buildViews`. | `players-build.test.ts`: index row count/order; per-slug payload sections reconcile with source engine output; slug stamped consistently on rounds/score-sheet/standings/OLP; collision holders get distinct slugs. |
| 04 | [`04-components.md`](./04-components.md) | Presentational profile sections (`ProfileHeader`, five section components, `ProfileSubLeagueSelector` client), `PlayersRosterTable` + `FilterablePlayersRoster` client; CSS in `public-shell.css`. | Components thin over tested `projectProfile`; section anchors/headings; selector updates displayed sub-league; sparkline `aria-label`. |
| 05 | [`05-pages.md`](./05-pages.md) | `players/page.tsx` (roster index), `players/[slug]/page.tsx` (real profile + redirect/404), `players/search` redirect, update `players/[slug]/rounds/page.tsx` slug resolution via `players` index. | Integration: seed+publish → roster lists all holders; profile at canonical slug renders; non-canonical redirects; unknown 404; rounds page resolves canonical slug. |
| 06 | [`06-link-unification-and-integration.md`](./06-link-unification-and-integration.md) | Unify `StandingsTable`/`OlpTable` links to canonical slug (from row data); update `public-routes.ts` (nav → `/players`, drop search from placeholders); `public-shell.test.ts`; boundary guard; full gate. | Smoke: every table link href uses canonical slug; nav `/players` resolves; `getPublished(season, "players")` + sample `players/{slug}` non-null; green CI. |

**Recommended order:** 01 → 02 → 03 → 04 → 05 → 06. (02 needs 01's slug helper; 03 needs 01's types + 02's skins payload; 04 needs 01's `projectProfile`; 05 needs 03's views + 04's components; 06 closes link unification + nav.)

## Test strategy

- **Pure helpers first** (`holder-slug.ts`, `profile-view.ts`): table-driven Vitest — slug collision, redirect resolution, section reconciliation against hand-built fixture slices mirroring engine output shapes.
- **Build tests** (`skins-build.test.ts`, `players-build.test.ts`): isolated season years (2098+ pattern from financials chunk 02); seed holders incl. name collision + Pool B >920 + incomplete sub-league → publish → assert payloads; flip `complete`/`skinsPaidOut` + republish → projected/final flags flip.
- **Integration test** (`players-integration.test.ts`): seed → publish → assert published `players` index + one profile view reconcile with `projectProfile`; redirect path; rounds sub-page resolves same slug.
- **Full gate** each chunk: `npm run typecheck && npm run lint && npm run test`, and `npm run build` on chunks that add routes/components.

## Token / cost accounting (fill in as implementation proceeds)

Per CLAUDE.md, this feature tracks the cost of building it. Update after each chunk.

**Pricing basis — Composer 2.5 (Cursor):** $0.50 / MTok input, $0.20 / MTok cache read, $2.50 / MTok output ([CLAUDE.md pricing table](../../CLAUDE.md)). Orchestration on the planning model; sub-plan implementation inline per CLAUDE.md Stage 3 (Composer 2.5 preferred for sub-plans).

| Chunk | Input tok | Output tok | Cost (USD) | Notes |
|-------|-----------|------------|------------|-------|
| Specify stage | — | — | — | spec 08 + cross-refs 04–07, 09, 11 |
| Plan stage | — | — | — | this file + sub-plans |
| 01 pure-helpers | ~45k | ~8k | ~$0.04 | `holder-slug.ts`, `profile-view.ts`, tests (14) |
| 02 skins-readmodel | ~35k | ~6k | ~$0.03 | `skins-build.ts`, wired into `buildViews`, tests (2) |
| 03 players-readmodel | ~55k | ~10k | ~$0.05 | `players-build.ts`, slug unification across builds |
| 04 components | ~40k | ~8k | ~$0.04 | Profile sections, roster table, CSS |
| 05 pages | ~35k | ~6k | ~$0.03 | `/players`, `/players/[slug]`, rounds slug fix |
| 06 link-unification | ~25k | ~4k | ~$0.02 | Table links, nav, `public-shell.test.ts` |
| **Total** | ~235k | ~42k | ~$0.21 | Feature 6 (Player Profiles), Composer 2.5 basis (est.) |

## Progress log (append notes / deviations here during Implement stage)

- **Feature 6 implementation complete — full gate green (355 passed / 1 pre-existing skip; typecheck + lint + `next build` all clean).** Delivered all six chunks inline: canonical slug helper + profile projection; `skins/pool-*` and `players`/`players/{slug}` read-model views; profile + roster UI; real pages replacing `ComingSoon`; unified profile links across standings/OLP/score-sheet/rounds; nav now points at `/players`.
- **Accepted** — archived to `plans/completed/player-profiles-00-master.md`; sub-plans deleted.
