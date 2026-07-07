# 02 — Null-tag tie-breaks, slug fallback, payload plumbing

**Goal:** make a null tag number behave as "sorts last, ties by holder ID" everywhere tag number drives ordering, fix slug collisions for tagless holders, and carry `tagNumber: number | null` + a `provisional` flag through the read-model payloads. Behavior-preserving for numbered holders.

Depends on: 01. Blocks: 06.

## Pure helper (`src/lib`)

- Add `tagSortKey(tagNumber: number | null): number` → `tagNumber ?? Number.MAX_SAFE_INTEGER`. Export from `src/lib/index.ts`.
- Convention for **every** tag-number tie-break: `tagSortKey(a.tagNumber) - tagSortKey(b.tagNumber) || a.holderId - b.holderId` (holder ID is the deterministic secondary for tagless ties — Spec 02 §2.6). Where the row exposes `id`/`playerId` instead of `holderId`, use that.

## Engine (pure — comparator change only, no new computation)

- `src/server/engine/standings.ts` line ~42: route the `.sort((a,b) => a.tagNumber - b.tagNumber)` through `tagSortKey` + id secondary.
- `src/server/engine/season.ts`: the tag-number sorts at ~130 (raw-score tie-break), ~148 (points tie-break), ~541 (OLP tie-break), and any other `a.tagNumber - b.tagNumber`. Each becomes `tagSortKey(...)` + id secondary. The engine input holder type (`season.ts` ~68, snapshot loader `seasonSnapshot.ts` ~121) carries `tagNumber: number | null`.
- Engine output rows that expose `tagNumber` (standings, skins, OLP candidate) become `number | null` — passed through, not defaulted.
- **Reconciliation guard:** after this change, `engine` acceptance tests + `real-2026-reconciliation.test.ts` must stay green (all fixtures use real tag numbers, so ordering is unchanged). Add one fixture case with a null-tag holder to prove null-last ordering.

## Read-model builds

- `build.ts` `StandingsRow.tagNumber: number | null`; `toStandingsRows` passes through.
- `players-build.ts` (~82/93 sort, ~118/163 payload), `skins-build.ts` (~41), `score-sheet-build.ts` (~147), `rounds-build.ts` (~100): route sorts through `tagSortKey`; payload `tagNumber: number | null`.
- Add `provisional: boolean` to the `players` **index** row and the **profile** payload (`= !holder.confirmed`). Also expose it wherever the roster row is built so 06 can render the badge without another engine pass.

## Slug (`buildCanonicalSlugs`, `src/lib/holder-slug.ts`)

- On base-slug collision, current logic appends `-{tagNumber}`. When a colliding holder's `tagNumber` is null, append `-{holderId}` instead (still unique + stable — Spec 08 §8.2). Ensure the non-null branch is unchanged so existing slugs don't churn.

## Public display

- Roster index + profile header + any standings/score-sheet/rounds cell that prints tag number renders **"—"** when `tagNumber == null` (Spec 08 §8.1/§8.3). Centralize as a tiny `formatTagNumber(n)` in `src/lib` if more than ~2 sites need it.

## Tests

- `tagSortKey` unit table: number < number; null > any number; equal keys fall to id.
- Engine: fixture with a tagless holder tied on points with a numbered holder → numbered ranks first; two tagless holders → lower id first. Existing acceptance/reconciliation suites unchanged.
- `buildCanonicalSlugs`: two colliding holders, one tagless → distinct slugs (`-{tag}` vs `-{id}`).
- Read-model build: payload row carries `tagNumber: null` + `provisional: true` for a `confirmed=false` holder.

## Gate

`npm run typecheck && npm run lint && npm run test` (engine reconciliation is the key signal).
