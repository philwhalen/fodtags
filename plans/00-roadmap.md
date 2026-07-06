# FOD Tags Aggregator — Implementation Roadmap (high-level sequence)

**Status:** first-pass sequencing only. This document defines the **order** in which
work happens, not the details. Each numbered item below becomes its own spec-driven
feature (`plans/<feature>/00-master.md` + sub-plans) in a later planning pass. No
per-step detail is committed here on purpose.

**Starting point:** the walking-skeleton scaffold is complete and accepted
([`plans/completed/scaffold-00-master.md`](./completed/scaffold-00-master.md)). Every
architectural layer is wired and runs against a **stub** PDGA source: skeleton schema,
pure-engine stubs, read-model publish/pointer-flip, auth/admin gate, scheduler, health,
CI. What remains is the domain: the real schema, the real computation, real data, and
the product views.

## Sequencing principles

1. **Foundations before views.** The full domain schema and the pure scoring/OLP engine
   underpin every feature, so they come first. The engine is the computation contract
   ([spec 02](../specs/02-Domain-Model-and-Scoring.md)) and is testable in isolation
   against hand-calculation fixtures (81.3 / 81.4) — the top testing priority.
2. **De-risk the biggest unknown early.** The PDGA 403-avoiding scraper is the single
   biggest technical risk; it is proven **before** any feature is built, so every view
   renders real data from the start (decision Q1).
3. **Views are read-only projections.** Each of the six views reads a precomputed
   read-model shape produced by the pure engine.
4. **Profiles last.** Player Profiles aggregates all five other views, so it lands after them.

## Decisions locked (this pass)

- **Q1 — Scraper timing:** de-risk **early**, before Feature 1 → real PDGA ingestion is
  its own block (Common Work B) ahead of the feature views.
- **Q2 — Admin console:** **thin slice early, grow per-feature.** Common A ships roster +
  event-source entry + audit-log infra; the matching queue, financial inputs, and overrides
  arrive with the blocks that need them.
- **Q3 — OLP ↔ money:** pull a **minimal OLP-pot-balance slice** (entry-count → pot math)
  into Common A so Feature 3 ships complete with payouts; the full financial engine still
  comes later (Common Work C).
- **Q4 — Feature order:** **Core-Spec order** — Leaderboards → Rounds & Ratings → OLP →
  Score Sheets, then Financials, then Profiles.

## Sequence

### Common Work A — Domain foundation & engine ✅ complete
_Accepted and archived: [`plans/completed/common-a-00-master.md`](./completed/common-a-00-master.md) (token/cost accounting intact). Committed as `b3fbe29`._

The full domain data model, the real computation, and the shared UI shell every view sits in.
- Full domain schema + normalized-store repositories (rounds, results, ratings history,
  player↔holder matches, adjustments/overrides, **audit log**).
- **Pure scoring + OLP engine** ([spec 02](../specs/02-Domain-Model-and-Scoring.md)):
  points tables, per-pool ranking, top-N caps, tie-breakers, cancellations, OLP, skins
  qualification — driven by hand-calculation fixtures.
- Read-model build/publish generalized beyond the skeleton's single view.
- Shared UI shell: top-level nav, mobile PDGA-style table components, the
  freshness / stale / pending-review banners, deep-link route structure, empty/pre-season states.
- Thin admin data-entry: roster (tags/pools/PDGA#/entry dates), event-source registration,
  and **per-night entry counts → OLP pot balance** (the minimal money slice for Feature 3 payouts).

### Common Work B — Real PDGA ingestion ✅ complete
_Accepted and archived: [`plans/completed/common-b-00-master.md`](./completed/common-b-00-master.md) (token/cost accounting intact)._

The biggest technical risk, proven before the feature views so they render real data.
- **Real PDGA scraper** ([spec 03](../specs/03-Data-Ingestion-and-PDGA.md)): the
  403-avoiding fetch (HTTP-with-headers → Playwright fallback), normalize, monthly
  official-ratings pull, resilience / stale flags.
- Auto-match PDGA entrants → holders, plus the **player matching review queue** (admin).
- Replaces the scaffold's stub source in the existing single-flight pipeline.

### Feature 1 — Leaderboards  ([spec 04](../specs/04-Feature-Leaderboards.md)) ✅ complete
_Accepted and archived: [`plans/completed/leaderboards-00-master.md`](./completed/leaderboards-00-master.md) (token/cost accounting intact)._

Championship (overall) + current sub-league toggle, per pool, with tie-break display.
Delivered the interaction layer on the Common-A data path: unified view control
(Overall Championship · Early · Mid · Late with "(now)"), pool toggle, `/sub-league`
redirect alias to the current sub-league, and a client-side name filter.

### Feature 2 — Rounds & Ratings  ([spec 05](../specs/05-Feature-Rounds-and-Ratings.md)) ✅ complete
_Accepted and archived: [`plans/completed/rounds-and-ratings-00-master.md`](./completed/rounds-and-ratings-00-master.md) (token/cost accounting intact). Committed as `57c32bd`._

All-players roster list and per-player round tables, shareable sub-league/event-type
filters, client-side name search, present-rating display, and accessible round-rating
sparklines. Built as a read-only projection: a new `rounds` read-model view assembled
directly from repositories (engine untouched), with pure `src/lib` helpers carrying the
filter/projection/trend logic.

### Feature 3 — OLP Pot  ([spec 06](../specs/06-Feature-OLP-Pot.md)) ✅ complete
_Accepted and archived: [`plans/completed/olp-pot-00-master.md`](./completed/olp-pot-00-master.md) (token/cost accounting intact)._

Per-sub-league OLP standings with the four explainable components and projected payouts
(payouts backed by the Common A pot-balance slice). Built as a read-only projection of the
engine's existing `olp`/`olpPot` output: a per-sub-league `olp/<league>` read-model view, a
pure `src/lib/olp-view.ts` projection (eligible-only 1..N ranking + a separate "Not yet
eligible" section), an Early · Mid · Late selector with "(now)", the total-pot display with
projected/final labels, a `/2026/olp` → current-sub-league redirect alias, and a client-side
name filter — engine untouched.

### Feature 4 — Pool Score Sheets  ([spec 07](../specs/07-Feature-Pool-Score-Sheets.md)) ✅ complete
_Accepted and archived: [`plans/completed/score-sheets-00-master.md`](./completed/score-sheets-00-master.md) (token/cost accounting intact)._

Per-pool "show your work" breakdown; counted vs. dropped line items; stated top-N caps.
Built as a read-only projection of the engine's existing `scoreSheet`/`championship`/`podium`
output: per-pool `score-sheet/pool-a|b` read-model views, a pure `src/lib/score-sheet-view.ts`
projection (counted grouped by event type with per-type subtotals, dropped-with-reason line
items, a flagged projected-Podium line excluded from the total, and the caps statement), native
`<details>`/`<summary>` two-level disclosure, a Pool A/B toggle, and a client-side name filter —
engine untouched.

### Common Work C — Financial engine & admin depth ✅ complete
_Accepted and archived: [`plans/completed/common-c-00-master.md`](./completed/common-c-00-master.md) (token/cost accounting intact)._

The full money model, plus the admin surface that feeds it. Delivered as an engine +
admin + normalized-store extension (not a read-only projection): five financial tables
(`financial_openings`, `tag_sales`, `payouts`, `expenses`, `financial_adjustments`) plus an
`ace_entries` column; a pure `computeFinancials` (cents throughout, per-night $6 splits,
no-drift Pool A/B skins split, funds + typed ledger with running total-cash) folded into
`computeSeason` as Stage H; the `loadSeasonSnapshot` financial slice; financial admin
mutations/actions (opening balances, tag sales, payouts with ace-win validation, expenses,
signed overrides, ace-entry counts); and the `/admin/financials` hub + read-only
`/admin/audit` viewer. Public financial views were deliberately left to Feature 5.

### Feature 5 — Financials  ([spec 09](../specs/09-Financials.md)) ✅ complete
_Accepted and archived: [`plans/completed/financials-00-master.md`](./completed/financials-00-master.md) (token/cost accounting intact)._

Public transparency: season summary, pot detail, full chronological ledger. Built as a
read-only projection of the engine's existing `computeSeason().financials` output: a single
`financials` read-model view, a pure `src/lib/financials-view.ts` projection (per-fund
projected/final labels, OLP 50-30-20 largest-remainder, ledger rows with expandable per-night
splits and purely-`deltas`-derived source links), a one-page `/{season}/financials` (summary ·
pots · ledger with in-page anchors), two-way cross-links with the OLP/score-sheet pages, and a
real-data reconciliation fixture (`real-2026.ts` + `db:seed:real`) that reproduces the league
sheet's own totals to the cent ($1,246.92 total club cash) — engine untouched. Implemented via
Sonnet 5 sub-agents per sub-plan (CLAUDE.md Stage 3 model-selection guidance), Opus orchestrating.

### Dev Spike — Local admin bypass for event-source configuration
_Not a product feature: dev-only tooling, so implemented directly (no four-stage spec-driven workflow — CLAUDE.md "Work that does not change product behavior is done directly"). Small, time-boxed._

**Motivation.** The admin console is gated behind Auth.js **Google OAuth** against the `directors` allowlist, enforced at two points: the Edge `src/middleware.ts` (`token.isDirector` on the signed JWT) and the Auth.js callbacks in `src/server/auth/index.ts`. Local dev only has **dummy Google OAuth credentials** (`.env`), so real sign-in can't complete and `/admin/*` is unreachable — which blocks configuring the three sub-league `event_sources`. Those need attention: source #1 (`104527`) is a **real, live** event but is mislabeled `EARLY` with the wrong dates/divisions (it's actually the May 21 – Jul 23 event exposing only `MA1`), and sources #2/#3 are **placeholder** IDs (`PLACEHOLDER-MID-2026` / `PLACEHOLDER-LATE-2026`) that fail every live refresh.

**Scope.**
- A **development-only** director session that bypasses Google OAuth — e.g. a credentials/dev provider or a middleware escape hatch that stamps `isDirector` — so `/admin/*` and `/api/admin/*` are reachable locally without a real Google login. Covers **both** enforcement points (middleware token check + auth callbacks).
- **Hard guardrail:** the bypass must be **impossible outside `NODE_ENV=development`** (fail-closed; ideally also behind an explicit opt-in env flag), and adds **no public product surface** — production auth behavior is unchanged.
- Outcome: reach `/admin/events` to register/correct the Early/Mid/Late sources with real PDGA event IDs (types, dates, divisions), then run a live "Refresh now" and verify the pipeline populates real rounds (already proven end-to-end against `104527`).

### Feature 6 — Player Profiles  ([spec 08](../specs/08-Feature-Player-Profiles.md))
Per-holder page unifying standings, rounds/ratings, points breakdown, OLP, and money.
Aggregates all five prior views → built last.

### Common Work D — Hardening & launch
- Accessibility (WCAG AA) and performance passes across all views.
- Refresh-failure alerting; finalize ops/backup/deploy contract.

## Next planning pass

First, the **Dev Spike — Local admin bypass** above is a quick, self-contained unblock (dev tooling, no spec-driven workflow) that can be knocked out independently — it lets the director reach `/admin/events` to fix the Early/Mid/Late event-source configuration and drive a real live refresh.

Then take **Feature 6 — Player Profiles** ([spec 08](../specs/08-Feature-Player-Profiles.md)) into the
full spec-driven workflow. It is the **last product feature** and aggregates all five prior views —
standings/Championship rank (Feature 1), rounds & ratings (Feature 2), OLP (Feature 3), the points
breakdown / score sheet (Feature 4), and the per-holder money picture (Feature 5) — into one
per-holder page, so it is built on top of read-model views that now all exist. Expect it to be
largely a **read-only projection/aggregation** (like Features 1–5): a per-holder `players/<slug>`
read-model view (or a page that composes the existing per-feature views by holder), pure
`src/lib` projection helpers, and the profile page replacing today's `players/search` placeholder —
with the standard freshness/projected-final treatment and deep-linkable holder slugs. Confirm
during Specify whether any holder-scoped slice of the money/OLP views needs adding to `buildViews`.
After Feature 6, only **Common Work D — Hardening & launch** remains.

_Common Work A/B/C and Features 1–5 completed — see the ✅ markers above._
