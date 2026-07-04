// Server-only: see src/server/db/index.ts for the convention this follows.
import "server-only";

import { Cron } from "croner";

import { config } from "@server/config";
import { child } from "@server/logging";
import { runRefresh } from "@server/ingestion";

/**
 * In-process, timezone-aware scheduler (CLAUDE.md "In-process
 * timezone-aware scheduler (croner)"; specs/12-Architecture.md §12.6).
 *
 * Both launch jobs below call the exact same `runRefresh()` pipeline that
 * the admin "Refresh now" button will call (sub-plan 08) — there is no
 * parallel scheduler-only code path, and no second lock here: `runRefresh`
 * already single-flights itself (sub-plan 06), so two near-simultaneous
 * fires (e.g. a manual refresh landing right as a scheduled one fires)
 * coalesce onto one run instead of racing.
 *
 * Season year is hardcoded to match the rest of the skeleton
 * (src/instrumentation.ts, src/server/db/seed.ts) — deriving a "current
 * season" from the clock is out of scope until multi-season support lands.
 */
const SEASON_YEAR = 2026;

/**
 * Module-level singleton guard. Next.js can invoke the boot `register()`
 * hook more than once in the same process (dev-mode HMR reloading
 * instrumentation.ts, or platforms that call it defensively more than
 * once), so `registerJobs()` must be safe to call repeatedly — the second
 * (and later) call is a logged no-op rather than a second set of `Cron`
 * jobs firing every refresh twice.
 */
let registered = false;

export function registerJobs(): void {
  const log = child({ job: "scheduler" });

  if (registered) {
    log.info({ event: "scheduler.already_registered" }, "registerJobs() called again — no-op");
    return;
  }
  registered = true;

  // --- Job 1: Thursday 21:00 ET full refresh --------------------------
  // Standard 5-field cron: minute hour day-of-month month day-of-week.
  // `4` = Thursday. Spec 03 §3.6 / specs/12-Architecture.md §12.6.
  //
  // DST: passing `timezone: config.APP_TIMEZONE` ("America/New_York")
  // rather than relying on the server's local/UTC clock is what makes
  // this fire at 21:00 **wall-clock ET** year-round — croner computes
  // each occurrence's UTC instant from the IANA tz database, so the job
  // still reads "9:00 PM America/New_York" whether that's UTC-5 (EST,
  // most of the year) or UTC-4 (EDT, after the spring-forward /before
  // the fall-back transition). No separate DST handling is needed here;
  // no automated DST test for the skeleton (per the sub-plan).
  const thursdayJob = new Cron(
    "0 21 * * 4",
    { timezone: config.APP_TIMEZONE, name: "thursday-full-refresh" },
    () => {
      void runRefresh({ trigger: "scheduled", seasonYear: SEASON_YEAR });
    },
  );

  // --- Job 2: monthly, 2nd-Tuesday ~09:00 ET ratings pull --------------
  //
  // "2nd Tuesday of the month" is not a plain cron field — cron has no
  // concept of "nth occurrence" on its own. We express it as day-of-month
  // range `8-14` (every month's 2nd occurrence of any weekday falls in
  // this 7-day window) ANDed with day-of-week `2` (Tuesday), so it only
  // fires on whichever day in 8-14 is a Tuesday — exactly one day per
  // month.
  //
  // IMPORTANT — verified croner behavior, NOT the naive assumption:
  // croner's default when BOTH day-of-month and day-of-week are
  // restricted is to **OR** them (`domAndDow` option defaults to
  // `false` = OR; see node_modules/croner README "domAndDow"). With the
  // default OR semantics, `0 9 8-14 * 2` fires on EVERY day 8-14 of the
  // month AND on every Tuesday outside that range too — not what we
  // want. We confirmed this by running both variants through
  // `job.nextRuns()`: the OR-default produced 5 consecutive daily fires
  // (7/7-7/11/2026), while explicitly ANDing produced exactly one fire
  // per month, each one a real 2nd Tuesday (7/14, 8/11, 9/8, 10/13,
  // 11/10/2026). We therefore pass `domAndDow: true` explicitly to force
  // AND semantics (equivalently, the cron string could prefix the
  // day-of-week field with `+`, e.g. `"0 9 8-14 * +2"` — same effect).
  //
  // Ratings-specific ingestion is deferred (CLAUDE.md, spec 03 §3.1); the
  // skeleton reuses the same `runRefresh` pipeline here too.
  const monthlyRatingsJob = new Cron(
    "0 9 8-14 * 2",
    { timezone: config.APP_TIMEZONE, domAndDow: true, name: "monthly-2nd-tuesday-ratings" },
    () => {
      void runRefresh({ trigger: "scheduled", seasonYear: SEASON_YEAR });
    },
  );

  for (const job of [thursdayJob, monthlyRatingsJob]) {
    const nextRun = job.nextRun();
    log.info(
      {
        event: "scheduler.registered",
        job: job.name,
        nextRunIso: nextRun?.toISOString() ?? null,
        nextRunEt: nextRun?.toLocaleString("en-US", { timeZone: config.APP_TIMEZONE }) ?? null,
      },
      `job "${job.name}" registered — next fire ${nextRun?.toISOString() ?? "unknown"}`,
    );
  }
}

/** Test-only escape hatch (sub-plan 10): reset the singleton guard between cases. */
export function __resetSchedulerForTests(): void {
  registered = false;
}
