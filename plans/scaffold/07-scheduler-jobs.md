# 07 — Scheduler & Jobs

**Goal:** An in-process, timezone-aware `croner` scheduler started once on boot, registering the two launch jobs, each calling the **same** `runRefresh()` pipeline, with next-fire times logged.

**Spec refs:** §12.6; [Spec 03 §3.6](../../specs/03-Data-Ingestion-and-PDGA.md). **Depends on:** 06.

## `src/server/jobs/`

- `scheduler.ts` — `registerJobs()` called once from the boot entry [01]. Uses `croner` with `{ timezone: config.APP_TIMEZONE }` (`America/New_York`).
- Two jobs:
  | Job | Cron (ET) | Action |
  |---|---|---|
  | Thursday full refresh | `0 21 * * 4` | `runRefresh({ trigger: 'scheduled', seasonYear: currentSeason })` |
  | Monthly 2nd-Tuesday ratings pull | 2nd Tuesday 09:00-ish | `runRefresh(...)` (ratings-specific ingestion is deferred; skeleton reuses the same pipeline) |

  - "2nd Tuesday" isn't a plain cron field: use `croner`'s day-of-week + a guard that the date is 8–14 (the 2nd occurrence), or compute the next 2nd-Tuesday explicitly. Document the approach.
- On registration, **log each job's `.nextRun()`** ([Spec §12.6], §12.13 boot requirement).
- **Guard double-registration** (Next dev/HMR and the `instrumentation` hook can run twice) — module-level singleton flag so jobs register exactly once.
- Jobs are protected by the pipeline's own single-flight ([06]); the scheduler doesn't need its own lock.

## Timezone correctness

DST matters — `croner` handles the tz, but verify Thursday 21:00 fires at 21:00 **ET** across a DST boundary conceptually (note in the plan; not an automated test for the skeleton).

## Done when

- On boot, logs show both jobs registered with concrete next-fire timestamps in ET.
- Jobs are wired to `runRefresh` (not a separate code path).
- Registration is idempotent across HMR / double-invoke.
