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
    /** PDGA membership on file — required for OLP eligibility (Spec 06
     * §6.2); independent of having a `pdgaNumber` recorded. */
    pdgaMembership: integer("pdga_membership", { mode: "boolean" }).notNull().default(false),
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
    /** Set when a refresh fails to fetch/parse this source (Spec 03 §3.8);
     * cleared on the next successful persist or by admin action. */
    stale: integer("stale", { mode: "boolean" }).notNull().default(false),
    /** UTC ISO-8601 timestamp of the last successful persist for this source. */
    lastGoodAt: text("last_good_at"),
    label: text("label").notNull(),
    /** Sub-league only (Early/Mid/Late): admin-configured window start (ET,
     * `YYYY-MM-DD`) — drives current-sub-league selection (Spec 03 §3.4).
     * Null for Tournament/FOD_OPEN sources. */
    startDate: text("start_date"),
    /** Sub-league only: window end (ET, `YYYY-MM-DD`) — also fixes the OLP
     * "last day" rating (Spec 02 §2.8). Null for Tournament/FOD_OPEN. */
    endDate: text("end_date"),
    /** Sub-league only: admin flag that finalizes the sub-league — folds in
     * the computed Podium bonus and flips OLP payouts to final (Spec 02
     * §2.4.1, Spec 10 §10.3). */
    complete: integer("complete", { mode: "boolean" }).notNull().default(false),
    /** JSON array of PDGA division codes to ingest for this source (e.g.
     * `["MPO", "MA1"]`). Kept as a JSON text column, matching the skeleton's
     * convention for JSON columns (see `refreshRuns`/`readModel` below). */
    divisions: text("divisions", { mode: "json" }).notNull().default(sql`'[]'`),
  },
  (table) => [
    // One row per sub-league/type per season (Spec 03 §3.4: each sub-league
    // is its own PDGA event id) — also gives the idempotent seed a natural
    // upsert target.
    uniqueIndex("event_sources_season_type_idx").on(table.seasonYear, table.type),
    index("event_sources_season_year_idx").on(table.seasonYear),
  ],
);

/** Scored-event type. Excludes "Podium" — the League Podium bonus is
 * synthesized by the engine from sub-league standings, never ingested or
 * stored as its own event row (Spec 02 §2.4.1). */
export const eventTypeEnum = ["LeagueNight", "Tournament", "FODOpen"] as const;
export type EventType = (typeof eventTypeEnum)[number];

/**
 * Scored instances (Spec 02 §2.1): one PDGA round within a sub-league's
 * event = one League Night (`roundOrdinal` carries the PDGA round number).
 * Tournaments/FOD Open have a single event row each (`roundOrdinal` null).
 */
export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    seasonYear: integer("season_year")
      .notNull()
      .references(() => seasons.year),
    eventSourceId: integer("event_source_id")
      .notNull()
      .references(() => eventSources.id),
    type: text("type", { enum: eventTypeEnum }).notNull(),
    label: text("label").notNull(),
    /** ET calendar date, `YYYY-MM-DD`. */
    eventDate: text("event_date").notNull(),
    /** The PDGA round number for a League Night; null for Tournament/FOD
     * Open (single-event sources). */
    roundOrdinal: integer("round_ordinal"),
    /** Admin-set cancellation flag (Spec 02 §2.7, Spec 10 §10.5) — zero
     * points everywhere, including OLP round counts, when true. */
    canceled: integer("canceled", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    // Natural key for the idempotent seed and for admin upserts: one
    // League Night per (source, round). Tournament/FOD_OPEN rows have a
    // null `roundOrdinal`; SQLite treats NULLs as distinct in a unique
    // index, so this only actually constrains League Nights.
    uniqueIndex("events_source_round_idx").on(table.eventSourceId, table.roundOrdinal),
    index("events_season_year_idx").on(table.seasonYear),
  ],
);

/**
 * One row per PDGA entrant per event (Spec 03 §3.5/§3.7). Non-holders
 * (`holderId` null) stay in the data so finish order/round context can
 * still be computed, but are excluded from points.
 */
export const eventResults = sqliteTable(
  "event_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    seasonYear: integer("season_year")
      .notNull()
      .references(() => seasons.year),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id),
    pdgaNumber: integer("pdga_number"),
    displayName: text("display_name").notNull(),
    /** Set by player matching (Spec 03 §3.5); null = non-holder or
     * not-yet-matched (excluded from points either way). */
    holderId: integer("holder_id").references(() => tagHolders.id),
    rawScoreToPar: integer("raw_score_to_par").notNull(),
    roundRating: integer("round_rating"),
    playerRatingReported: integer("player_rating_reported"),
    /** Whether the holder's tag was physically present (able to be
     * won/lost) — defaults true; admin-confirmable override (Spec 02 §2.3,
     * Spec 10 §10.5) when it deviates. */
    tagPresent: integer("tag_present", { mode: "boolean" }).notNull().default(true),
    /** Whether this round's score is PDGA-final (vs. still in progress). */
    roundFinal: integer("round_final", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [
    // Natural key: one row per PDGA entrant per event. SQLite unique
    // indexes treat NULLs as distinct, so multiple no-pdga-number entrants
    // (guests without a PDGA number on file) coexist fine.
    uniqueIndex("event_results_event_pdga_number_idx").on(table.eventId, table.pdgaNumber),
    index("event_results_season_year_idx").on(table.seasonYear),
    index("event_results_holder_id_idx").on(table.holderId),
  ],
);

/**
 * Sticky PDGA#→holder confirmation (Spec 03 §3.5) — persists across
 * refreshes once confirmed. Table exists now; the auto-match logic that
 * populates it (and leaves ambiguous matches for the admin review queue) is
 * Common B.
 */
export const playerMatches = sqliteTable(
  "player_matches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    seasonYear: integer("season_year")
      .notNull()
      .references(() => seasons.year),
    pdgaNumber: integer("pdga_number").notNull(),
    /** Null = confirmed non-holder (excluded from points, never re-queued). */
    holderId: integer("holder_id").references(() => tagHolders.id),
    /** How this decision was made — admin always wins over auto on upsert. */
    source: text("source", { enum: ["auto", "admin"] }).notNull(),
    /** Director email for admin decisions; `"auto"` for auto-links. */
    decidedBy: text("decided_by").notNull(),
    decidedAt: text("decided_at").notNull(),
  },
  (table) => [
    uniqueIndex("player_matches_season_pdga_number_idx").on(table.seasonYear, table.pdgaNumber),
  ],
);

/**
 * Rating-as-of-date history per holder (Spec 02 §2.2) — the engine reads
 * the latest `official` row with `effectiveDate <= target` for eligibility.
 * Live per-round ratings may be recorded here as `official: false` for
 * display only; they never gate eligibility.
 */
export const ratingsHistory = sqliteTable(
  "ratings_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    seasonYear: integer("season_year")
      .notNull()
      .references(() => seasons.year),
    holderId: integer("holder_id")
      .notNull()
      .references(() => tagHolders.id),
    /** ET calendar date, `YYYY-MM-DD`. */
    effectiveDate: text("effective_date").notNull(),
    rating: integer("rating").notNull(),
    official: integer("official", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [
    uniqueIndex("ratings_history_holder_date_official_idx").on(
      table.holderId,
      table.effectiveDate,
      table.official,
    ),
    index("ratings_history_season_year_idx").on(table.seasonYear),
  ],
);

/**
 * Director-approved pool switch (Spec 02 §2.2, Spec 10 §10.2) — forfeits
 * all points earned before `effectiveDate` (the engine honors this; not
 * enforced here).
 */
export const poolSwitches = sqliteTable(
  "pool_switches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    seasonYear: integer("season_year")
      .notNull()
      .references(() => seasons.year),
    holderId: integer("holder_id")
      .notNull()
      .references(() => tagHolders.id),
    /** ET calendar date, `YYYY-MM-DD`. */
    effectiveDate: text("effective_date").notNull(),
    fromPool: text("from_pool", { enum: poolEnum }).notNull(),
    toPool: text("to_pool", { enum: poolEnum }).notNull(),
    approvedBy: text("approved_by").notNull(),
  },
  (table) => [
    uniqueIndex("pool_switches_holder_effective_date_idx").on(table.holderId, table.effectiveDate),
    index("pool_switches_season_year_idx").on(table.seasonYear),
  ],
);

/**
 * Paid entries per League Night (Spec 09 §9.2) — the cash source of truth,
 * recorded by a director each night, not derived from PDGA presence. Feeds
 * the OLP-pot slice (Spec 06).
 */
export const entryCounts = sqliteTable(
  "entry_counts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    seasonYear: integer("season_year")
      .notNull()
      .references(() => seasons.year),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id),
    paidEntries: integer("paid_entries").notNull(),
  },
  (table) => [
    uniqueIndex("entry_counts_event_id_idx").on(table.eventId),
    index("entry_counts_season_year_idx").on(table.seasonYear),
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

/**
 * Who/what/when/before/after for every admin change (Spec 10 §10.1) —
 * append-only, so overrides stay attributable and reversible. Every admin
 * write is expected to insert exactly one row here alongside its own
 * table's write, then trigger recompute (sub-plan 06).
 */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    seasonYear: integer("season_year")
      .notNull()
      .references(() => seasons.year),
    actorEmail: text("actor_email").notNull(),
    /** Free-form verb, e.g. `create`, `update`, `cancel-event`. */
    action: text("action").notNull(),
    /** e.g. `tagHolder`, `event`, `poolSwitch`. */
    entityType: text("entity_type").notNull(),
    /** Text, not integer, so a single column covers every entity's id
     * shape (including composite/natural keys down the line). */
    entityId: text("entity_id").notNull(),
    /** JSON snapshot of the row before the change; null for a create. */
    before: text("before", { mode: "json" }),
    /** JSON snapshot of the row after the change; null for a delete. */
    after: text("after", { mode: "json" }),
    at: text("at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index("audit_log_season_year_idx").on(table.seasonYear),
    index("audit_log_entity_idx").on(table.entityType, table.entityId),
  ],
);

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
