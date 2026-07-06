/**
 * Boot-entry point for the whole app.
 *
 * Decision (owned by plans/scaffold/01-project-bootstrap.md, referenced by
 * sub-plans 03/06/07/08): boot-time work runs in Next.js's `register()`
 * instrumentation hook rather than a custom server entry. It runs once per
 * server process, before the app starts serving requests, which is exactly
 * where the master boot sequence (specs/12-Architecture.md, "Boot
 * sequence" in plans/scaffold/00-master.md) belongs:
 *
 *   1. Load & validate config (fail fast)               — sub-plan 02
 *   2. Open SQLite (WAL), apply migrations               — sub-plan 03
 *   3. Seed idempotently (season, holders, event sources) — sub-plan 03
 *   4. Bootstrap director from BOOTSTRAP_DIRECTOR_EMAIL   — sub-plan 08
 *   5. Ensure >=1 published read-model version exists     — sub-plan 05/06
 *   6. Register scheduler jobs; log next fire times       — sub-plan 07
 *
 * Each TODO below is a placeholder slot for its owning sub-plan; nothing
 * here should touch product behavior yet.
 */
export async function register(): Promise<void> {
  // Only run boot-time work in the Node.js server runtime (not the Edge
  // runtime, which also loads this file in some Next.js configurations).
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  console.log("[boot] fodtags server starting");

  // Load & validate Zod config; fail fast if invalid. `config` is parsed
  // once at module load, so simply importing it here triggers validation —
  // an invalid/missing required env logs the flattened Zod error and calls
  // process.exit(1) from within src/server/config/index.ts.
  const { config } = await import("@server/config");
  const { logger } = await import("@server/logging");

  logger.info(
    {
      event: "boot.summary",
      nodeEnv: config.NODE_ENV,
      appTimezone: config.APP_TIMEZONE,
      port: config.PORT,
      dataDir: config.DATA_DIR,
      dbPath: config.dbPath,
      rawDir: config.rawDir,
    },
    "config validated",
  );

  // Open SQLite (WAL mode) via Drizzle; apply pending migrations from
  // drizzle/. Importing `@server/db/client` opens the DB (mkdir -p DATA_DIR
  // + raw/, then the better-sqlite3 handle with WAL/foreign_keys/busy_timeout
  // pragmas) as a side effect of module load; `applyMigrations()` then runs
  // any migrations not yet recorded in Drizzle's own migrations table.
  const { applyMigrations } = await import("@server/db/migrate");
  applyMigrations();
  logger.info({ event: "db.migrate" }, "migrations applied");

  // Idempotent seed — 2026 season, sample tag holders, 3 sub-league event
  // sources. `seed()` uses INSERT ... ON CONFLICT DO NOTHING against each
  // table's natural key, so a re-run (e.g. every boot) changes nothing;
  // `counts` reports how many rows each insert actually affected (0 after
  // the first run) as the idempotency signal in the logs.
  //
  // `SEED_SYNTHETIC=false` opts out of the synthetic fixture (used for the
  // real-data validation run — see scripts/seed-real-roster.ts). In that
  // mode we still ensure the 2026 season row exists so the admin console
  // has a season to attach event sources to; the real roster is loaded
  // separately via `npm run db:seed:real-roster`. Read from process.env
  // directly (not the Zod config) to avoid a `coerce.boolean` truthiness
  // trap on the string "false".
  if (process.env.SEED_SYNTHETIC === "false") {
    const { ensureSeason } = await import("@server/db/repositories/seasons");
    ensureSeason(2026);
    logger.info({ event: "db.seed", counts: { skipped: "synthetic" } }, "synthetic seed skipped (SEED_SYNTHETIC=false)");
  } else {
    const { seed } = await import("@server/db/seed");
    const counts = seed();
    logger.info({ event: "db.seed", counts }, "seed complete");
  }

  // Bootstrap the first director (CLAUDE.md "Auth via Auth.js Google OAuth
  // against a `directors` email allowlist"; specs/12-Architecture.md §12.8):
  // the very first director can't add themselves through the gated admin
  // UI (nothing is allowlisted yet to let them in), so boot idempotently
  // upserts `BOOTSTRAP_DIRECTOR_EMAIL` as an active director. Thereafter the
  // `directors` table is authoritative — this only ever (re)confirms the
  // one row. `isDirector` is checked *before* the upsert purely to report
  // whether this run actually inserted/reactivated the row (`created`) or
  // found it already active — `upsertDirector` itself is unconditional and
  // safe to run on every boot.
  const { isDirector, upsertDirector } = await import("@server/db/repositories/directors");
  const alreadyDirector = isDirector(config.BOOTSTRAP_DIRECTOR_EMAIL);
  upsertDirector({ email: config.BOOTSTRAP_DIRECTOR_EMAIL, active: true });
  logger.info(
    { event: "auth.bootstrapDirector", email: config.BOOTSTRAP_DIRECTOR_EMAIL, created: !alreadyDirector },
    alreadyDirector ? "bootstrap director already present" : "bootstrap director created",
  );

  // Ensure at least one published read-model version exists so the public
  // page always has something to read post-boot (specs/12-Architecture.md
  // §12.3; CLAUDE.md "Public reads never recompute or touch PDGA"). Sub-plan
  // 06 will later route a real refresh through the full ingestion pipeline;
  // for now, if nothing has ever been published for this season, build and
  // publish directly from the (currently empty) normalized store.
  const { getCurrentVersion } = await import("@server/db/repositories/readModel");
  const { buildAndPublish } = await import("@server/readmodel");
  const seasonYear = 2026;
  const existingVersion = getCurrentVersion(seasonYear);
  const publishedVersion = existingVersion ?? buildAndPublish(seasonYear);
  logger.info(
    { event: "readmodel.ensurePublished", seasonYear, version: publishedVersion, alreadyPublished: existingVersion !== undefined },
    "read model publish ensured",
  );

  // Register the croner scheduler: Thu 21:00 ET full refresh + monthly
  // 2nd-Tue official ratings pull (both call the same `runRefresh`
  // pipeline as "Refresh now" — no parallel code path). `registerJobs()`
  // guards its own double-invocation (dev/HMR can call `register()` more
  // than once per process), logging each job's next-fire time on the
  // first call and a no-op line on any subsequent call.
  const { registerJobs } = await import("@server/jobs");
  registerJobs();

  console.log("[boot] fodtags server ready");
}
