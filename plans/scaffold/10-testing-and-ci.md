# 10 — Testing & CI

**Goal:** Vitest configured; the priority **engine test** (OLP 81.3/81.4) and a **pipeline integration test** (stub → run → published read model → empty page renders); CI runs typecheck → lint → test → build.

**Spec refs:** §12.11, §12.13; [Spec 02 acceptance](../../specs/02-Domain-Model-and-Scoring.md). **Depends on:** 04, 06 (and touches most layers).

## Vitest setup

- `vitest.config.ts` with path aliases matching tsconfig; node environment for server/engine tests.
- Separate fast **unit** (engine, pure — no DB) from **integration** (spins up SQLite in a temp `DATA_DIR`). Integration test sets `DATA_DIR` to a `mkdtemp` dir, runs migrations + seed against it, and cleans up.

## Priority test — engine OLP (`src/server/engine/olp.test.ts`)

The nucleus per §12.11. Assert `olpScore` reproduces the worked examples **exactly**:
- `{ ratingOnLastDay: 853, avgScoreToPar: 5, roundsPlayed: 7, leagueNightPoolWins: 2 }` → **81.3**
- `{ ratingOnLastDay: 937, avgScoreToPar: -3.3, roundsPlayed: 6, leagueNightPoolWins: 3 }` → **81.4**
- Round to one decimal (or assert within a tight tolerance) to dodge float error; this mirrors the spec's display precision.

## Integration test — pipeline (`src/server/ingestion/pipeline.test.ts`)

Per §12.13: **stub source → run → published read model → page renders empty roster.**
1. Temp `DATA_DIR`; migrate + seed 2026 + holders.
2. `runRefresh({ trigger:'manual', seasonYear:2026 })` with the stub source.
3. Assert: a `refresh_runs` row exists (status success); a new `read_model` version is published; `getPublished(2026,'championship/pool-a')` returns the roster at 0 points.
4. (Optional) render the page component / call its data loader and assert the empty roster shape — a full RSC render is optional; asserting the read-model payload the page consumes is sufficient for the skeleton.

Add a **single-flight** assertion: two overlapping `runRefresh` calls yield one active run.

## CI — `.github/workflows/ci.yml`

Steps, in order (§12.11): `install → typecheck → lint → test → next build`. Pin Node to `.nvmrc`. Cache deps. The build step proves `output: 'standalone'` works. Migrations must apply cleanly in the test/build environment.

## Done when

- `npm test` passes with both tests green.
- CI workflow runs all four gates and is green.
