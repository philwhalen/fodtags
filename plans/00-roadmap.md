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

### Feature 2 — Rounds & Ratings  ([spec 05](../specs/05-Feature-Rounds-and-Ratings.md))
All-players and per-player round tables, sub-league/event-type filters, rating trend.

### Feature 3 — OLP Pot  ([spec 06](../specs/06-Feature-OLP-Pot.md))
Per-sub-league OLP standings with the four explainable components and projected payouts
(payouts backed by the Common A pot-balance slice).

### Feature 4 — Pool Score Sheets  ([spec 07](../specs/07-Feature-Pool-Score-Sheets.md))
Per-pool "show your work" breakdown; counted vs. dropped line items; stated top-N caps.

### Common Work C — Financial engine & admin depth
The full money model, plus the admin surface that feeds it.
- **Financial model/engine** ([spec 09](../specs/09-Financials.md)): entry-count → full
  split math, all pots, running balances, chronological ledger.
- Admin financial inputs (tag sales, opening balances, actual payouts, ace/skins),
  manual adjustments/overrides, and the deeper audit trail.

### Feature 5 — Financials  ([spec 09](../specs/09-Financials.md))
Public transparency: season summary, pot detail, full chronological ledger.

### Feature 6 — Player Profiles  ([spec 08](../specs/08-Feature-Player-Profiles.md))
Per-holder page unifying standings, rounds/ratings, points breakdown, OLP, and money.
Aggregates all five prior views → built last.

### Common Work D — Hardening & launch
- Accessibility (WCAG AA) and performance passes across all views.
- Refresh-failure alerting; finalize ops/backup/deploy contract.

## Next planning pass

Take **Feature 2 — Rounds & Ratings** into the full spec-driven workflow: confirm/expand
[spec 05](../specs/05-Feature-Rounds-and-Ratings.md) (all-players and per-player round tables,
sub-league/event-type filters, rating trend), then produce `plans/rounds-and-ratings/00-master.md`
+ sub-plans at implementation granularity.

_Common Work A/B and Feature 1 completed — see the ✅ markers above._
