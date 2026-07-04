# 06 — Ingestion Pipeline

**Goal:** The one pipeline function that both "Refresh now" and the scheduler call — `runRefresh()` — behind a `PdgaSource` **interface** with a **stub** implementation, single-flighted, recording a `refresh_runs` row, ending in `buildAndPublish`.

**Spec refs:** §12.3, §12.6, §12.7; [Spec 03 §3.5, §3.7](../../specs/03-Data-Ingestion-and-PDGA.md). **Depends on:** 03, 04, 05.

## Source interface — `src/server/ingestion/pdga/source.ts`

```ts
interface RawEventPayload { pdgaEventId: string; entrants: []; /* stub: empty */ }
interface PdgaSource { fetchEvent(eventId: string, opts?: unknown): Promise<RawEventPayload>; }
```

- `stub-source.ts` — returns an **empty** payload (no network). This is what the skeleton wires in; the real HTTP+Playwright fetcher (§12.7) is **deferred** (§12.14).
- Selection: a factory (`getPdgaSource()`) returns the stub for now; a later env flag can swap in the real one. All server-only.

## Normalize / match stubs

- `normalize.ts` — maps `RawEventPayload` → normalized results. Skeleton: empty in → empty out.
- `match.ts` — PDGA entrant → tag holder by PDGA#, then name ([Spec 03 §3.5]). Skeleton: no entrants → nothing to match; leave the confident-match/queue structure as a documented TODO.

## Pipeline — `src/server/ingestion/pipeline.ts`

`runRefresh({ trigger: 'manual' | 'scheduled', seasonYear })`:
1. **Single-flight guard** — an in-process boolean/promise; if a run is active, return early (or await it) rather than starting a second. Log the skip.
2. `startRun` → new `refresh_runs` row (`startedAt`, `trigger`, status `running`).
3. For each **active** event source ([03] `listActiveSources`): `source.fetchEvent` → `normalize` → cache raw to `data/raw/` (write the JSON, even if empty, so the path is exercised) → `match` → persist snapshot. Record per-source status/counts. A single source failing is caught, marked, and does not abort the others ([Spec 03 §3.8]).
4. `buildAndPublish(seasonYear)` ([05]) — recompute + atomic publish.
5. `finishRun` → `endedAt`, final status, counts, any errors.
6. Return a summary. Log start/finish ([02]).

Guarantees to preserve: **idempotent**, **same function for manual & scheduled**, **atomic publish**, run always recorded even on failure.

## Done when

- `runRefresh({trigger:'manual', seasonYear:2026})` completes, writes a `refresh_runs` row (status success), a raw file under `data/raw/`, and a new published read-model version.
- A second concurrent call is single-flighted (covered by a test in [10]).
