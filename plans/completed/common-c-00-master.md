# Common Work C — Financial engine & admin depth — Master Plan

Specs (amended in this feature's Specify stage):
[`specs/09-Financials.md`](../../specs/09-Financials.md) (money model, funds, rounding, ledger) +
[`specs/10-Admin-Console.md` §10.1/§10.6](../../specs/10-Admin-Console.md#106-financial-inputs) (financial inputs, audit-log view).
Money rules cross-ref [`specs/02` §2.8/§2.9](../../specs/02-Domain-Model-and-Scoring.md#28-overall-league-performance-olp) (OLP pot, skins qualification).

Roadmap block: [`plans/00-roadmap.md`](../00-roadmap.md) → "Common Work C — Financial engine & admin depth". This block **unblocks Feature 5 (public Financials views)** but does **not** itself ship public pages or read-model views.

## Context: what already exists (Common A/B + Features 1–4)

- **The pure engine is `computeSeason`** (`src/server/engine/season.ts`), Stages A–G, returning `SeasonResults` (`src/lib/season-results.ts`). Stage F already does the **OLP-pot slice**: sums `snapshot.entryCounts` per sub-league → `entriesToOlpPot(paidEntries)` (= `$1 × entries`, whole dollars) → `largestRemainderPayout` 50/30/20 among top-3 eligible. `olp.ts` holds those helpers; **we leave them untouched (whole dollars)** and the new financial engine works in cents (`$1 pot × 100`), cross-checked in tests.
- **Snapshot contract** `SeasonSnapshot` (`src/lib/season-snapshot.ts`) is the authoritative pure-engine input; `loadSeasonSnapshot` (`src/server/db/repositories/seasonSnapshot.ts`) assembles it from repos and is the pipeline's only I/O. `entryCounts` there is aggregated to `{subLeagueType, paidEntries}` (drops eventId/date) — fine for OLP, **too coarse for the ledger**, so financials get their own richer per-night snapshot slice.
- **Schema** (`src/server/db/schema.ts`): only financial table today is `entry_counts` (`eventId`, `paidEntries`, unique per event). `audit_log` (append-only who/what/when/before/after) and `refresh_runs` exist. `directors` gate admin.
- **Admin** (`src/app/admin/*`): dashboard, roster, matches, events, `entry-counts`, adjustments. Every write goes through `src/server/admin/mutations.ts` → `commitAndPublish` (`recordAudit` + `recompute`) → server actions in `src/app/admin/actions.ts`. `recompute` → `buildViews` → `publish` (atomic version + pointer flip).
- **Read-model** (`src/server/readmodel/build.ts`) runs `computeSeason` once and shapes per-feature views. It will simply **ignore** the new `results.financials` until Feature 5 consumes it — so adding financials to the engine output is safe and publishes nothing new.

`/{season}/financials` is a `ComingSoon` stub; nav link exists; both stay untouched here (Feature 5 owns them).

## Key architectural decisions (Plan stage — from the Plan-stage Q&A)

1. **Fold financials into `computeSeason`.** Extend `SeasonSnapshot` with an **optional** `financial` block and `SeasonResults` with a required `financials` block; add **Stage H** to `computeSeason` that calls a new pure `src/server/engine/financial.ts`. One snapshot → one results, one recompute. (`financial` is optional on the snapshot so the ~dozen existing engine test fixtures that omit it keep compiling; missing ⇒ all-zeros/empty.)
2. **The engine emits the full ledger.** `financial.ts` produces final **fund balances**, an ordered **ledger** (typed dated entries, per-fund `deltas`, running total-cash), and reconciliation facts — maximizing hand-calc testability here. Feature 5 only shapes/renders; no financial computation leaks into the read-model or pages.
3. **Cents everywhere in the engine.** All financial arithmetic is integer cents. The **only** rounding is the per-night Pool A/B skins split (largest-remainder on the night's 280¢×entries so A+B is exact, no drift). Reserves/OLP/ace/tag components are exact integer cents per unit.
4. **Separate purpose-built tables.** `financial_openings`, `tag_sales`, `payouts`, `expenses`, `financial_adjustments`; plus an `ace_entries` column added to `entry_counts` (ace is a per-League-Night count alongside paid entries). Each has a thin repo; each admin write audits + recomputes.
5. **Admin: hub + entry-count reuse.** Add ace entries to the existing `/admin/entry-counts` page; add a new `/admin/financials` hub (openings, tag sales, payouts, expenses, adjustments); add a read-only `/admin/audit` log viewer.
6. **OLP stays in whole dollars.** No churn to Feature 3's engine helpers, read-model, or tests. Financials express the OLP fund in cents and a test asserts `olp-fund inflow == olpPot × 100`.

## Decisions locked (Specify answers + plan follow-ons)

- **Skins** accumulate all season (280¢/entry, 2/3 A · 1/3 B, no weekly payout/carry); the **season-end skins match** pays out the **entire per-pool purse** (a recorded `SKINS` payout) and it **zeroes** — so skins have **no opening balance** and don't carry (Specify).
- **Ace pot** is a **separate $1 buy-in per night**, counted independently (new `ace_entries`); balance = opening + 100¢×ace entries − ace wins; carries year to year via a 2026 **opening balance** (Specify).
- **Tag sales** are **manually entered dated batches** (count + date), $20 each → reserves; roster size is only an informal cross-check (Specify).
- **Opening balances**: ace + reserves only (OLP starts $0/sub-league; skins start $0) (Specify).
- **Expenses**: free-form line items (amount, date, category ∈ {pdga_fees, trophies, ctp, contingency, other}, description) → reserves (Specify).
- **Overrides** modeled as **signed `financial_adjustments`** (fund + signed cents + date + required reason) surfaced as ledger `adjustment` entries — attributable/reversible, satisfies spec §10.6 "override any derived balance" without a destructive absolute set (plan).
- **CTP** is sponsor-funded → **excluded** from funds/ledger (spec §9.1; flagged to user in Specify).
- **Projected/final**: engine exposes raw facts (`subLeagueComplete` per sub-league, `skinsPaidOut` per pool, top-level `projected = !all complete`); Feature 5 turns them into labels (plan).

## Fund & ledger model (the contract Stage H must satisfy)

- **Funds** (cents): `reserves`, `ace`, `olp:{EARLY|MID|LATE}`, `skins:{A|B}`. **Total club cash = sum of all funds** at every ledger point.
- **Constants** (cents): entry 600 = skins 280 + olp 100 + reserves 220; ace 100; tag 2000.
- **Per-night split**: skins 280¢×entries → A = round(2/3), B = total − A (largest-remainder, exact); olp 100¢×entries; reserves 220¢×entries; ace 100¢×ace entries.
- **Ledger entry**: `{ kind, date, sourceRef, deltas: {fund, cents}[], netCents, runningTotalCents, paidEntries?, aceEntries?, note?, category? }`. Kinds: `opening`, `league-night`, `tag-sale`, `olp-payout`, `skins-payout`, `ace-win`, `expense`, `adjustment`. Ordered by `date` asc then a stable kind/id tiebreak; `opening` rows dated `${seasonYear}-01-01` sort first. `runningTotalCents` accumulates `netCents`.
- **Reconciliation invariants** (tested): per league-night `paidEntries×600 == skinsA+skinsB+olp+reserves`; `skinsA+skinsB == 280×entries` (no drift over the season); final `sum(funds) == totalCashCents == last runningTotalCents`; `olp fund inflow == olpPot[type]×100`.

## Non-negotiables carried from CLAUDE.md / spec 12

- **Engine stays pure.** `financial.ts` is plain-in/plain-out (no I/O, clock, DB, fetch, Next). `computeFinancials` derives everything from `snapshot.financial` — no `Date.now()`, no ambient state.
- **Server-only stays server-only.** New repos/mutations start with `import "server-only"`; the pure engine + `@/lib` contracts have no server imports (so tests import them freely).
- **No public output in this block.** No new read-model `viewKey`s, no changes under `src/app/(public)`, no `financials`/`skins` view payloads. `git diff` under `src/app/(public)` stays empty; the only `readmodel/` touch is verifying `buildViews` still runs green with the extended `results`.
- **Every financial write audited + recomputed**, via the existing `commitAndPublish` pattern.
- **Money integrity**: cents integers end-to-end; the sole rounding point documented and tested.

## Sub-plans (small, independently testable chunks)

| # | Sub-plan | What it delivers | Independently testable by |
|---|----------|------------------|---------------------------|
| 01 | [`01-schema-and-repos.md`](./01-schema-and-repos.md) | `financial_openings`, `tag_sales`, `payouts`, `expenses`, `financial_adjustments` tables + `ace_entries` column on `entry_counts` in `schema.ts`; migration; thin repos for each; `entryCounts` repo extended for ace. | Extend `domainSchema.test.ts`: insert/list/upsert each table; `entry_counts` ace column upsert preserving paid; enum/notNull/default checks; FK to season/holder. |
| 02 | [`02-engine-financials.md`](./02-engine-financials.md) | **(priority)** financial types on `season-snapshot.ts` (optional `financial`) + `season-results.ts` (`SeasonFinancials`); pure `src/server/engine/financial.ts` (`computeFinancials`); Stage H wired into `computeSeason`; exports. | New `financial.test.ts` (pure, table-driven): per-night splits, no-drift A/B skins across a season, ace/tag/expense/payout/adjustment deltas, ordering + running totals, `sum(funds)==total`, reconciliation invariants, `olp inflow==olpPot×100`, empty/missing-`financial` ⇒ zero funds. Plus a `season.test.ts` case asserting `computeSeason` returns coherent `financials`. |
| 03 | [`03-snapshot-assembly.md`](./03-snapshot-assembly.md) | Extend `loadSeasonSnapshot` to populate `snapshot.financial` (openings, per-night paid+ace w/ dates+sub-league, tag sales, payouts, expenses, adjustments) from the new repos; keep the existing OLP `entryCounts` aggregation. | Extend `domainSchema.test.ts`/snapshot test: seed the new tables → assert the assembled `financial` slice shape/values, then `computeSeason(loadSeasonSnapshot(...))` produces expected fund balances + ledger end-to-end. |
| 04 | [`04-admin-mutations.md`](./04-admin-mutations.md) | `mutations.ts` financial writes: `setAceCount`, `upsertOpenings`, `addTagSale`/`deleteTagSale`, `recordPayout`(+ ace-win validations)/`deletePayout`, `addExpense`/`deleteExpense`, `addAdjustment`/`deleteAdjustment` — each audit + recompute; `actions.ts` server actions. | Extend `admin.test.ts`: each mutation → `recordAudit` row + republished version + resulting `results.financials` change; ace-win rejects (non-holder >$50; win before recipient's tag entryDate); negative/zero validations. |
| 05 | [`05-admin-ui.md`](./05-admin-ui.md) | Ace-entries field on `/admin/entry-counts`; `/admin/financials` hub (openings, tag sales, payouts, expenses, adjustments sections + forms); read-only `/admin/audit` log viewer; admin nav links. Full `typecheck → lint → test → build`. | Component wiring over tested actions (Server Components + form actions like existing admin pages); a smoke assertion that pages render/build; boundary guard (no engine/public-app churn); green CI gate. |

**Recommended order:** 01 → 02 → 03 → 04 → 05. (02 needs 01 only for the eventual DB shape but is otherwise pure and can proceed in parallel with 01; 03 needs 01's repos + 02's types; 04 needs 02's engine output + 03's assembly + 01's repos; 05 needs 04's actions.)

## Test strategy

- **Pure financial engine first** (chunk 02) carries the correctness weight: table-driven Vitest, no DB/clock. Reproduce a small worked example by hand (e.g. one night of 10 paid + 6 ace entries: skins 2800¢ → A 1867¢ / B 933¢, olp 1000¢, reserves 2200¢, ace 600¢; total cash +6600¢) and assert every invariant, plus the multi-night no-drift skins property.
- **Schema tests** (chunk 01, 03) extend `domainSchema.test.ts` — insert/list/upsert + FK/enum/default + the assembled snapshot slice and the end-to-end `computeSeason` fund balances.
- **Mutation tests** (chunk 04) extend `admin.test.ts` — the Feature-1..4 precedent: write → audit + republish → assert `results.financials` moved; validation rejections.
- **Admin UI** (chunk 05) follows the existing admin page/form precedent (Server Components + server-action forms); rely on the tested actions; keep a build/boundary smoke check.
- **Full gate** each chunk: `npm run typecheck && npm run lint && npm run test`, and `npm run build` on chunks touching routes/components (05).

## Token / cost accounting (fill in as implementation proceeds)

Per CLAUDE.md, this feature tracks the cost of building it. Update after each chunk. **Implementation chunks 01–05 are executed by Composer sub-agents** (one per sub-plan), at the user's explicit request (overriding CLAUDE.md's default "implement inline"). The **Specify + Plan** stages were done inline by the orchestrating agent (Claude Opus 4.8 in Cursor).

**Pricing basis:**
- **Specify + Plan stages — Claude Opus 4.8:** $15 / MTok input, $75 / MTok output.
- **Implementation chunks 01–05 — Composer 2.5 Fast:** **$3 / MTok input, $15 / MTok output** (public list price; see [CLAUDE.md → Model pricing reference](../../CLAUDE.md#model-pricing-reference-public-api-list-prices-per-1m-tokens)).

Figures are best-effort estimates from the orchestrating/sub-agent context (the harness does not surface exact per-turn billing); treat as ±30%.

| Chunk | Input tok | Output tok | Cost (USD) | Notes |
|-------|-----------|------------|------------|-------|
| Specify stage | ~55k | ~6k | ~$1.3 | spec 09/10 amendments + Q&A (this session) |
| Plan stage | ~85k | ~10k | ~$2.0 | codebase map + this file + sub-plans (this session) |
| 01 schema-and-repos | ~50k | ~10k | ~$0.30 | tables + migration `0004` + repos + schema tests (Composer 2.5 Fast) |
| 02 engine-financials | ~45k | ~12k | ~$0.32 | contracts + `financial.ts` + Stage H + pure tests (Composer 2.5 Fast) |
| 03 snapshot-assembly | ~35k | ~8k | ~$0.23 | `loadSeasonSnapshot` financial slice + e2e test (Composer 2.5 Fast) |
| 04 admin-mutations | ~45k | ~12k | ~$0.32 | financial mutations/actions + admin tests (Composer 2.5 Fast) |
| 05 admin-ui | ~55k | ~18k | ~$0.44 | entry-count ace field + financials hub + audit view + money.ts (Composer 2.5 Fast, this session) |
| **Total** | ~370k | ~76k | ~$4.9 | Common Work C: Specify+Plan (Opus 4.8, ~$3.3) + chunks 01–05 (Composer 2.5 Fast, ~$1.6) |

## Progress log (append notes / deviations here during Implement stage)

- **Chunk 01 (schema & repos) done** — Composer 2.5 Fast sub-agent. Added `financial_openings`, `tag_sales`, `payouts`, `expenses`, `financial_adjustments` tables + `ace_entries` column on `entry_counts` (schema.ts); migration `drizzle/0004_needy_blacklash.sql` (generated via `npm run db:generate`, applied by `applyMigrations()` in dev/CI/boot/tests). New repos: `financialOpenings`, `tagSales`, `payouts`, `expenses`, `financialAdjustments`; `entryCounts` extended with `upsertAceCount` + `aceEntries` reads. 6 new domainSchema tests. Gate green (276 passed / 1 skipped), verified by orchestrator.
  - Deviations: (1) exported a named `subLeagueTypeEnum`/`SubLeagueType` in schema.ts for `payouts.subLeague` (sub-plan didn't name it) — matches `poolEnum` pattern; (2) ace/paid coexistence test reuses the seeded LATE source (roundOrdinal 99) rather than a new event_source, to avoid the unique `(season_year, type)` constraint. No engine/lib/admin/app changes.
- **Chunk 02 (pure financial engine) done** — Composer 2.5 Fast sub-agent. Added financial input types + optional `financial?` to `src/lib/season-snapshot.ts`, `SeasonFinancials` output + required `financials` to `src/lib/season-results.ts`, re-exports in `src/lib/index.ts`; pure `src/server/engine/financial.ts` (`computeFinancials`, `splitSkinsCents`, cents constants); Stage H wired into `computeSeason` (A–G untouched); exports in engine `index.ts`; `financial.test.ts` + one `season.test.ts` case. Gate green (285 passed / 1 skipped). Orchestrator verified purity (no server-only/DB/Next/Date imports) and worked-night + no-drift assertions.
  - Deviation: exported `splitSkinsCents` + named cents constants (sub-plan had them inline) — matches `olp.ts` helper pattern; single fund-fold path (all funds start 0, openings folded as a ledger delta).
- **Chunk 03 (snapshot assembly) done** — Composer 2.5 Fast sub-agent. Extended `loadSeasonSnapshot` to assemble `snapshot.financial` (openings, per-night paid+ace nights, tag sales, payouts, expenses, adjustments) from the chunk-01 repos; kept the existing OLP `entryCounts` aggregation; doc comment updated. New tests use isolated seasons 2098/2099 asserting snapshot shape, end-to-end `computeSeason` fund balances (reserves 14300¢, total 22900¢), OLP inflow == olpPot×100, empty-season zeros. Gate green (288 passed / 1 skipped).
  - Deviations: isolated test seasons to avoid shared-DB pollution; OLP cross-check sums league-night OLP ledger deltas (inflow) rather than final balance (fixture has an OLP payout); `financial` always populated (zeros when empty). No engine/schema/other-repo/admin/app changes.
- **Chunk 04 (admin mutations & actions) done** — Composer 2.5 Fast sub-agent. Added the `Financial inputs` section to `mutations.ts` (`setAceCount`, `upsertOpenings`, `addTagSale`/`deleteTagSale`, `recordPayout`/`deletePayout` with ace-win validations, `addExpense`/`deleteExpense`, `addAdjustment`/`deleteAdjustment`), 11 `"use server"` wrappers in `actions.ts` (revalidate `/admin/financials` + `/admin/entry-counts`), and 9 `admin.test.ts` cases (financials-moved assertions + ace-win/validation rejections). Gate green (297 passed / 1 skipped), verified by orchestrator.
  - Deviations: repo import aliases to avoid clashing with mutation names; local FormData parse helpers in `actions.ts` (context.ts untouched, only in-scope files changed); delete mutations implemented+audited but not separately unit-tested (matches existing admin-test coverage pattern).
- **Chunk 05 (admin UI) done** — Composer 2.5 Fast sub-agent (this session). Ace-entries column+form on `/admin/entry-counts`; new `/admin/financials` hub (computed fund summary, openings/tag-sales/payouts/expenses/adjustments sections with dollar→cent conversion at form boundary); read-only `/admin/audit` with `listAuditLog` + entityType filter; nav links; server-free `src/lib/money.ts`. Gate green (297 passed / 1 skipped); build route table includes `/admin/financials` + `/admin/audit`.
  - Deviations: fund summary uses `computeSeason(loadSeasonSnapshot(...))` on the admin page (not read-model); `listAudit` now delegates to `listAuditLog`; exported `TAG_SALE_CENTS` alongside money helpers for Feature 5. Chunk-05 diff limited to `src/app/admin/**`, `auditLog.ts`, `src/lib/money.ts` + index export — no engine/public/readmodel changes in this chunk.
