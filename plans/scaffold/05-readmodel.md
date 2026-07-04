# 05 — Read Model (build + atomic publish)

**Goal:** Materialize view-shaped rows from engine output and **publish atomically** — write a new `version`, then flip the `published_pointer` in a single SQLite transaction. Public pages read only from here.

**Spec refs:** §12.3 (recompute + atomic publish), §12.5. **Depends on:** 03, 04.

## Build — `src/server/readmodel/build.ts`

`import 'server-only'`. Given `seasonYear`:
1. Load inputs via repositories: holders (`listHolders`), (later: results — empty for skeleton).
2. Run the **pure engine** (`computeStandings`) — no I/O inside the engine call.
3. Produce view rows keyed by `viewKey`. Skeleton view: `championship/pool-a` (and cheaply also `championship/pool-b`) → payload `{ rows: StandingRow[], updatedAt: ISO }`.

Keep `viewKey` naming aligned to the deep-link URLs ([Spec 04 §4.5]): `championship/pool-a`, `sub-league/mid/pool-b`, etc. Only the championship pool views are built in the skeleton.

## Publish — `src/server/readmodel/publish.ts`

`publish(seasonYear, views)`:
1. Compute `nextVersion = getCurrentVersion(seasonYear) + 1` (start at 1).
2. In **one transaction** (`sqlite.transaction(...)`):
   - Insert all `read_model` rows for `nextVersion`.
   - Upsert `published_pointer` → `currentVersion = nextVersion`.
3. Readers using `getPublished` see the old version until commit; a failed build/insert never flips the pointer. **Idempotent:** re-running produces an equivalent published state (a new version with identical payload is acceptable).

Optional: prune old `read_model` versions beyond a small keep-count (not required for skeleton).

## Read — `getPublished(seasonYear, viewKey)`

Returns `{ version, payload, builtAt }` for the pointer's current version, or `null` if nothing published yet. The page ([09]) handles `null` gracefully, but the boot sequence [master step 5] guarantees ≥1 version exists.

## `buildAndPublish(seasonYear)`

Convenience that composes build → publish; this is what the pipeline ([06]) calls at the end of a refresh, and what the boot "ensure published" step calls if the pointer is unset.

## Done when

- `buildAndPublish(2026)` writes version 1 and points to it.
- `getPublished(2026, 'championship/pool-a')` returns the empty roster at 0 points with an `updatedAt`.
- A thrown error mid-publish leaves the previous pointer intact (unit test with a forced failure).
