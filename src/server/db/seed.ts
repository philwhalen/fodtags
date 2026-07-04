// Server-only boundary convention.
//
// Everything under `src/server/` runs only in the Node process and must
// never reach the client bundle (secrets, DB access, PDGA fetching). Every
// module added under `src/server/` (with the deliberate exception of
// `src/server/engine/`, which stays plain-inputs/plain-outputs pure — see
// `src/server/engine/index.ts`) should start with this same import so an
// accidental client-side import fails the build loudly instead of quietly
// leaking server internals to the browser.
//
// See CLAUDE.md and specs/12-Architecture.md §12.5 / §12.13.
import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@server/db/client";
import {
  entryCounts,
  eventResults,
  events,
  eventSources,
  ratingsHistory,
  seasons,
  tagHolders,
} from "@server/db/schema";

const SEASON_YEAR = 2026;

/**
 * A handful of tag holders spanning both pools, distinct tag numbers, and a
 * mix of PDGA-numbered / not — enough to render a non-empty roster at 0
 * points (the pre-season empty state, Spec 04 §4.4) without being real
 * data. `pdgaMembership` tracks the 3 PDGA-numbered holders as members and
 * the 3 without a number as not, giving the OLP eligibility rule (Spec 06
 * §6.2, requires membership) something to actually filter on once the
 * engine lands (sub-plan 02/03).
 */
const SEED_TAG_HOLDERS = [
  {
    name: "Alex Rivera",
    tagNumber: 1,
    pool: "A" as const,
    entryDate: "2026-01-15T00:00:00.000Z",
    pdgaNumber: 123456,
    ratingAtEntry: 1010,
    pdgaMembership: true,
  },
  {
    name: "Jordan Lee",
    tagNumber: 2,
    pool: "A" as const,
    entryDate: "2026-01-15T00:00:00.000Z",
    pdgaNumber: 234567,
    ratingAtEntry: 975,
    pdgaMembership: true,
  },
  {
    name: "Sam Patel",
    tagNumber: 3,
    pool: "A" as const,
    entryDate: "2026-01-20T00:00:00.000Z",
    pdgaNumber: null,
    ratingAtEntry: 940,
    pdgaMembership: false,
  },
  {
    name: "Casey Nguyen",
    tagNumber: 4,
    pool: "B" as const,
    entryDate: "2026-02-01T00:00:00.000Z",
    pdgaNumber: null,
    ratingAtEntry: 860,
    pdgaMembership: false,
  },
  {
    name: "Morgan Kim",
    tagNumber: 5,
    pool: "B" as const,
    entryDate: "2026-02-05T00:00:00.000Z",
    pdgaNumber: 345678,
    ratingAtEntry: 815,
    pdgaMembership: true,
  },
  {
    name: "Taylor Brooks",
    tagNumber: 6,
    pool: "B" as const,
    entryDate: "2026-02-10T00:00:00.000Z",
    pdgaNumber: null,
    ratingAtEntry: 890,
    pdgaMembership: false,
  },
] as const;

/**
 * The 3 sub-league event sources (Spec 03 §3.4), now carrying the
 * admin-configured window (`startDate`/`endDate`) and `complete` flag
 * (Spec 10 §10.3). EARLY is seeded `complete: true` so the fixture
 * exercises the computed-Podium path (Spec 02 §2.4.1) once the engine
 * lands; MID/LATE are still in progress / not started.
 */
const SEED_EVENT_SOURCES = [
  {
    type: "EARLY" as const,
    pdgaEventId: "104527",
    label: "2026 FOD Tags — Early (real PDGA event id)",
    startDate: "2026-04-01",
    endDate: "2026-05-13",
    complete: true,
    divisions: ["MPO", "MA1"],
  },
  {
    type: "MID" as const,
    pdgaEventId: "PLACEHOLDER-MID-2026",
    label: "2026 FOD Tags — Mid (placeholder, TBD)",
    startDate: "2026-05-20",
    endDate: "2026-07-01",
    complete: false,
    divisions: ["MPO", "MA1"],
  },
  {
    type: "LATE" as const,
    pdgaEventId: "PLACEHOLDER-LATE-2026",
    label: "2026 FOD Tags — Late (placeholder, TBD)",
    startDate: "2026-07-08",
    endDate: "2026-08-26",
    complete: false,
    divisions: ["MPO", "MA1"],
  },
] as const;

/**
 * League Nights + results (Spec 02 §2.1/§2.7), keyed by `sourceType` +
 * `roundOrdinal` so the seed can resolve the parent `event_sources.id`
 * after insert. Only the 3 PDGA-numbered holders (Alex/Jordan/Morgan) get
 * results, so every seeded result has a non-null `pdgaNumber` — keeping the
 * `(eventId, pdgaNumber)` natural key fully idempotent (SQLite treats NULLs
 * as distinct in a unique index, so a fixture with repeated null
 * `pdgaNumber`s would duplicate on re-seed).
 *
 * EARLY's 3rd night is seeded `canceled: true` with only 2 attendees (Spec
 * 02 §2.7: "≤2 players attend → no points") to exercise the cancellation
 * path once the engine lands (sub-plan 02).
 */
const SEED_EVENTS = [
  {
    sourceType: "EARLY" as const,
    roundOrdinal: 1,
    label: "Early League Night 1",
    eventDate: "2026-04-02",
    canceled: false,
    paidEntries: 8,
    results: [
      { tagNumber: 1, pdgaNumber: 123456, rawScoreToPar: -4, roundRating: 1015, playerRatingReported: 1010 },
      { tagNumber: 2, pdgaNumber: 234567, rawScoreToPar: -2, roundRating: 980, playerRatingReported: 975 },
      { tagNumber: 5, pdgaNumber: 345678, rawScoreToPar: 3, roundRating: 820, playerRatingReported: 815 },
    ],
  },
  {
    sourceType: "EARLY" as const,
    roundOrdinal: 2,
    label: "Early League Night 2",
    eventDate: "2026-04-09",
    canceled: false,
    paidEntries: 7,
    results: [
      { tagNumber: 1, pdgaNumber: 123456, rawScoreToPar: -2, roundRating: 995, playerRatingReported: 1010 },
      { tagNumber: 2, pdgaNumber: 234567, rawScoreToPar: 1, roundRating: 955, playerRatingReported: 975 },
      { tagNumber: 5, pdgaNumber: 345678, rawScoreToPar: 5, roundRating: 800, playerRatingReported: 815 },
    ],
  },
  {
    sourceType: "EARLY" as const,
    roundOrdinal: 3,
    label: "Early League Night 3",
    eventDate: "2026-04-16",
    canceled: true,
    paidEntries: 2,
    results: [
      { tagNumber: 1, pdgaNumber: 123456, rawScoreToPar: -1, roundRating: 1000, playerRatingReported: 1010 },
      { tagNumber: 2, pdgaNumber: 234567, rawScoreToPar: 0, roundRating: 970, playerRatingReported: 975 },
    ],
  },
  {
    sourceType: "MID" as const,
    roundOrdinal: 1,
    label: "Mid League Night 1",
    eventDate: "2026-05-21",
    canceled: false,
    paidEntries: 5,
    results: [
      { tagNumber: 1, pdgaNumber: 123456, rawScoreToPar: -3, roundRating: 1005, playerRatingReported: 1010 },
      { tagNumber: 5, pdgaNumber: 345678, rawScoreToPar: 2, roundRating: 830, playerRatingReported: 815 },
    ],
  },
] as const;

/** A couple of official rating-history rows (Spec 02 §2.2) — enough for
 * the as-of-date eligibility lookup to have more than one row per holder to
 * choose between once the engine lands. */
const SEED_RATINGS_HISTORY = [
  { tagNumber: 1, effectiveDate: "2026-03-10", rating: 1005 },
  { tagNumber: 1, effectiveDate: "2026-04-14", rating: 1010 },
  { tagNumber: 5, effectiveDate: "2026-04-14", rating: 815 },
] as const;

export interface SeedCounts {
  seasons: number;
  tagHolders: number;
  eventSources: number;
  events: number;
  eventResults: number;
  ratingsHistory: number;
  entryCounts: number;
}

/**
 * Idempotent seed: safe to run on every boot and via `npm run db:seed`.
 * Uses `INSERT ... ON CONFLICT DO NOTHING` (or, for the couple of tables
 * that are meant to be correctable, `DO UPDATE`) against each table's
 * natural key so re-running never duplicates rows or errors.
 *
 * Returns how many rows each insert step actually affected (0 on a re-run
 * for the DO-NOTHING tables), which boot logs (`db.seed`) as the
 * idempotency proof.
 */
export function seed(): SeedCounts {
  const seasonResult = db
    .insert(seasons)
    .values({ year: SEASON_YEAR })
    .onConflictDoNothing({ target: seasons.year })
    .run();

  const tagHolderResult = db
    .insert(tagHolders)
    .values(
      SEED_TAG_HOLDERS.map((holder) => ({
        seasonYear: SEASON_YEAR,
        name: holder.name,
        tagNumber: holder.tagNumber,
        pool: holder.pool,
        entryDate: holder.entryDate,
        pdgaNumber: holder.pdgaNumber,
        ratingAtEntry: holder.ratingAtEntry,
        pdgaMembership: holder.pdgaMembership,
        active: true,
      })),
    )
    .onConflictDoNothing({
      target: [tagHolders.seasonYear, tagHolders.tagNumber],
    })
    .run();

  const eventSourceResult = db
    .insert(eventSources)
    .values(
      SEED_EVENT_SOURCES.map((source) => ({
        seasonYear: SEASON_YEAR,
        pdgaEventId: source.pdgaEventId,
        type: source.type,
        active: true,
        label: source.label,
        startDate: source.startDate,
        endDate: source.endDate,
        complete: source.complete,
        divisions: [...source.divisions],
      })),
    )
    .onConflictDoNothing({
      target: [eventSources.seasonYear, eventSources.type],
    })
    .run();

  // Resolve the ids the rest of the fixture hangs off of — SQLite
  // autoincrement ids aren't known ahead of the (idempotent) inserts above,
  // and re-running the seed must resolve the SAME ids it created the first
  // time.
  const holderIdByTagNumber = new Map(
    db
      .select({ tagNumber: tagHolders.tagNumber, id: tagHolders.id })
      .from(tagHolders)
      .where(eq(tagHolders.seasonYear, SEASON_YEAR))
      .all()
      .map((h) => [h.tagNumber, h.id]),
  );
  const sourceIdByType = new Map(
    db
      .select({ type: eventSources.type, id: eventSources.id })
      .from(eventSources)
      .where(eq(eventSources.seasonYear, SEASON_YEAR))
      .all()
      .map((s) => [s.type, s.id]),
  );

  let eventCount = 0;
  let eventResultCount = 0;
  let entryCountCount = 0;

  for (const seedEvent of SEED_EVENTS) {
    const eventSourceId = sourceIdByType.get(seedEvent.sourceType);
    if (eventSourceId === undefined) {
      throw new Error(`seed: unknown event source type "${seedEvent.sourceType}"`);
    }

    const eventInsert = db
      .insert(events)
      .values({
        seasonYear: SEASON_YEAR,
        eventSourceId,
        type: "LeagueNight",
        label: seedEvent.label,
        eventDate: seedEvent.eventDate,
        roundOrdinal: seedEvent.roundOrdinal,
        canceled: seedEvent.canceled,
      })
      .onConflictDoNothing({ target: [events.eventSourceId, events.roundOrdinal] })
      .run();
    eventCount += eventInsert.changes;

    const eventRow = db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.eventSourceId, eventSourceId), eq(events.roundOrdinal, seedEvent.roundOrdinal)))
      .get();
    if (eventRow === undefined) {
      throw new Error(`seed: event row missing after insert for "${seedEvent.label}"`);
    }

    const resultInsert = db
      .insert(eventResults)
      .values(
        seedEvent.results.map((r) => {
          const holderId = holderIdByTagNumber.get(r.tagNumber);
          const holder = SEED_TAG_HOLDERS.find((h) => h.tagNumber === r.tagNumber);
          if (holderId === undefined || holder === undefined) {
            throw new Error(`seed: unknown tag number ${r.tagNumber}`);
          }
          return {
            seasonYear: SEASON_YEAR,
            eventId: eventRow.id,
            pdgaNumber: r.pdgaNumber,
            displayName: holder.name,
            holderId,
            rawScoreToPar: r.rawScoreToPar,
            roundRating: r.roundRating,
            playerRatingReported: r.playerRatingReported,
            tagPresent: true,
            roundFinal: true,
          };
        }),
      )
      .onConflictDoNothing({ target: [eventResults.eventId, eventResults.pdgaNumber] })
      .run();
    eventResultCount += resultInsert.changes;

    // Entry counts are director-correctable (Spec 09 §9.2), so this is an
    // upsert rather than DO-NOTHING — re-seeding "affects" the row every
    // time, which is the intended semantics (idempotent in the sense that
    // the row count stays stable; see the idempotency test).
    const entryCountInsert = db
      .insert(entryCounts)
      .values({ seasonYear: SEASON_YEAR, eventId: eventRow.id, paidEntries: seedEvent.paidEntries })
      .onConflictDoUpdate({
        target: entryCounts.eventId,
        set: { paidEntries: seedEvent.paidEntries },
      })
      .run();
    entryCountCount += entryCountInsert.changes;
  }

  const ratingsHistoryResult = db
    .insert(ratingsHistory)
    .values(
      SEED_RATINGS_HISTORY.map((r) => {
        const holderId = holderIdByTagNumber.get(r.tagNumber);
        if (holderId === undefined) {
          throw new Error(`seed: unknown tag number ${r.tagNumber}`);
        }
        return {
          seasonYear: SEASON_YEAR,
          holderId,
          effectiveDate: r.effectiveDate,
          rating: r.rating,
          official: true,
        };
      }),
    )
    .onConflictDoNothing({
      target: [ratingsHistory.holderId, ratingsHistory.effectiveDate, ratingsHistory.official],
    })
    .run();

  return {
    seasons: seasonResult.changes,
    tagHolders: tagHolderResult.changes,
    eventSources: eventSourceResult.changes,
    events: eventCount,
    eventResults: eventResultCount,
    ratingsHistory: ratingsHistoryResult.changes,
    entryCounts: entryCountCount,
  };
}
