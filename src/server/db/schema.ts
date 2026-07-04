// Deliberate exception to the `import "server-only"` convention (see
// CLAUDE.md and specs/12-Architecture.md §12.1 / §12.4): this module is pure
// table/column declarations with no I/O, secrets, or DB handle of its own —
// and it must be `require`-able by the plain-Node `drizzle-kit` CLI (`npm
// run db:generate`), which does not go through Next.js's bundler and would
// hard-crash on the `server-only` guard. `src/server/db/client.ts` (which
// does hold the real DB connection) keeps the guard; nothing under
// `src/server/` re-exports this schema to a client component.
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Skeleton schema (specs/12-Architecture.md §12.5) — the minimum tables to
 * exercise every architectural layer. The full domain schema (rounds,
 * ratings, OLP, financials, audit log, …) arrives with the feature specs.
 *
 * Timestamp convention (applies to every timestamp column in this file):
 * stored as **UTC ISO-8601 text** (e.g. `new Date().toISOString()`), never a
 * unix integer. ISO text sorts lexicographically the same as chronologically,
 * is human-readable in ad-hoc `sqlite3`/DB-browser inspection, and matches
 * what `refresh_runs`/`read_model` need to log for debugging. Formatting to
 * America/New_York happens at the display edge (§12.5 "Time").
 */

/** The top scope every domain table hangs off of. Seeded with 2026. */
export const seasons = sqliteTable("seasons", {
  year: integer("year").primaryKey(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

/** Pool assignment: Pool B is for players <900 rated at first entry. */
export const poolEnum = ["A", "B"] as const;
export type Pool = (typeof poolEnum)[number];

/** Roster subset: name, tag number, pool, entry date, PDGA #, active. */
export const tagHolders = sqliteTable(
  "tag_holders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    seasonYear: integer("season_year")
      .notNull()
      .references(() => seasons.year),
    name: text("name").notNull(),
    tagNumber: integer("tag_number").notNull(),
    /** 'A' | 'B' — see `poolEnum`. */
    pool: text("pool", { enum: poolEnum }).notNull(),
    /** UTC ISO-8601 date/time the tag was entered into the league. */
    entryDate: text("entry_date").notNull(),
    pdgaNumber: integer("pdga_number"),
    /** Official PDGA rating at first entry — drives Pool A/B eligibility. */
    ratingAtEntry: integer("rating_at_entry"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [
    uniqueIndex("tag_holders_season_tag_number_idx").on(table.seasonYear, table.tagNumber),
    index("tag_holders_season_year_idx").on(table.seasonYear),
  ],
);

/** Sub-league / event type an `event_sources` row is registered as. */
export const eventSourceTypeEnum = ["EARLY", "MID", "LATE", "TOURNAMENT", "FOD_OPEN"] as const;
export type EventSourceType = (typeof eventSourceTypeEnum)[number];

/** Registered PDGA events (Spec 03 §3.4): pdgaEventId, type, active, label. */
export const eventSources = sqliteTable(
  "event_sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    seasonYear: integer("season_year")
      .notNull()
      .references(() => seasons.year),
    pdgaEventId: text("pdga_event_id").notNull(),
    type: text("type", { enum: eventSourceTypeEnum }).notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    label: text("label").notNull(),
  },
  (table) => [
    // One row per sub-league/type per season (Spec 03 §3.4: each sub-league
    // is its own PDGA event id) — also gives the idempotent seed a natural
    // upsert target.
    uniqueIndex("event_sources_season_type_idx").on(table.seasonYear, table.type),
    index("event_sources_season_year_idx").on(table.seasonYear),
  ],
);

/** Admin allowlist: email, added-by, added-at, active. */
export const directors = sqliteTable("directors", {
  email: text("email").primaryKey(),
  addedBy: text("added_by"),
  addedAt: text("added_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

/** How a `refresh_runs` row was triggered. */
export const refreshTriggerEnum = ["manual", "scheduled"] as const;
export type RefreshTrigger = (typeof refreshTriggerEnum)[number];

/** Lifecycle status of a refresh run. */
export const refreshStatusEnum = ["running", "succeeded", "failed"] as const;
export type RefreshStatus = (typeof refreshStatusEnum)[number];

/** Per-run record (Spec 03 §3.6): trigger, start/end, per-source status, counts, errors. */
export const refreshRuns = sqliteTable(
  "refresh_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    seasonYear: integer("season_year")
      .notNull()
      .references(() => seasons.year),
    trigger: text("trigger", { enum: refreshTriggerEnum }).notNull(),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    status: text("status", { enum: refreshStatusEnum }).notNull().default("running"),
    /** JSON: per-source fetch/normalize/match outcome. Kept as a JSON text
     * column for the skeleton; full normalization arrives with the feature
     * specs (see §12.5 "Notes"). */
    perSource: text("per_source", { mode: "json" }).notNull().default(sql`'{}'`),
    /** JSON: summary counts (rounds ingested, holders matched, etc.). */
    counts: text("counts", { mode: "json" }).notNull().default(sql`'{}'`),
    error: text("error"),
  },
  (table) => [index("refresh_runs_season_year_idx").on(table.seasonYear)],
);

/**
 * Versioned published view rows (view-shaped, keyed by
 * `(seasonYear, version, viewKey)`). Publishing writes a new `version`; the
 * pointer flip in `publishedPointer` is a single transaction (see sub-plan
 * 05 — the write/publish side is NOT built here, only the read side).
 */
export const readModel = sqliteTable(
  "read_model",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    seasonYear: integer("season_year")
      .notNull()
      .references(() => seasons.year),
    version: integer("version").notNull(),
    /** e.g. `championship/pool-a`. */
    viewKey: text("view_key").notNull(),
    /** JSON: the view-shaped payload. Kept as a JSON text column for the
     * skeleton (see §12.5 "Notes"). */
    payload: text("payload", { mode: "json" }).notNull(),
    builtAt: text("built_at").notNull(),
  },
  (table) => [
    uniqueIndex("read_model_season_version_view_idx").on(
      table.seasonYear,
      table.version,
      table.viewKey,
    ),
    index("read_model_season_year_idx").on(table.seasonYear),
  ],
);

/** Names the live `read_model` version for a season. One row per season. */
export const publishedPointer = sqliteTable("published_pointer", {
  seasonYear: integer("season_year")
    .primaryKey()
    .references(() => seasons.year),
  currentVersion: integer("current_version").notNull(),
});
