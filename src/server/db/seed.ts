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

import { db } from "@server/db/client";
import { eventSources, seasons, tagHolders } from "@server/db/schema";

const SEASON_YEAR = 2026;

/**
 * A handful of tag holders spanning both pools, distinct tag numbers, and a
 * mix of PDGA-numbered / not — enough to render a non-empty roster at 0
 * points (the pre-season empty state, Spec 04 §4.4) without being real data.
 */
const SEED_TAG_HOLDERS = [
  {
    name: "Alex Rivera",
    tagNumber: 1,
    pool: "A" as const,
    entryDate: "2026-01-15T00:00:00.000Z",
    pdgaNumber: 123456,
    ratingAtEntry: 1010,
  },
  {
    name: "Jordan Lee",
    tagNumber: 2,
    pool: "A" as const,
    entryDate: "2026-01-15T00:00:00.000Z",
    pdgaNumber: 234567,
    ratingAtEntry: 975,
  },
  {
    name: "Sam Patel",
    tagNumber: 3,
    pool: "A" as const,
    entryDate: "2026-01-20T00:00:00.000Z",
    pdgaNumber: null,
    ratingAtEntry: 940,
  },
  {
    name: "Casey Nguyen",
    tagNumber: 4,
    pool: "B" as const,
    entryDate: "2026-02-01T00:00:00.000Z",
    pdgaNumber: null,
    ratingAtEntry: 860,
  },
  {
    name: "Morgan Kim",
    tagNumber: 5,
    pool: "B" as const,
    entryDate: "2026-02-05T00:00:00.000Z",
    pdgaNumber: 345678,
    ratingAtEntry: 815,
  },
  {
    name: "Taylor Brooks",
    tagNumber: 6,
    pool: "B" as const,
    entryDate: "2026-02-10T00:00:00.000Z",
    pdgaNumber: null,
    ratingAtEntry: 890,
  },
] as const;

/**
 * The 3 sub-league event sources (Spec 03 §3.4). `104527` is the real 2026
 * PDGA event id on hand; MID/LATE are placeholders (clearly labeled) until
 * the real ids are registered.
 */
const SEED_EVENT_SOURCES = [
  {
    type: "EARLY" as const,
    pdgaEventId: "104527",
    label: "2026 FOD Tags — Early (real PDGA event id)",
  },
  {
    type: "MID" as const,
    pdgaEventId: "PLACEHOLDER-MID-2026",
    label: "2026 FOD Tags — Mid (placeholder, TBD)",
  },
  {
    type: "LATE" as const,
    pdgaEventId: "PLACEHOLDER-LATE-2026",
    label: "2026 FOD Tags — Late (placeholder, TBD)",
  },
] as const;

export interface SeedCounts {
  seasons: number;
  tagHolders: number;
  eventSources: number;
}

/**
 * Idempotent seed: safe to run on every boot and via `npm run db:seed`.
 * Uses `INSERT ... ON CONFLICT DO NOTHING` against each table's natural key
 * so re-running never duplicates rows or errors.
 *
 * Returns how many rows each insert actually affected (0 on a re-run),
 * which boot logs (`db.seed`) as the idempotency proof.
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
      })),
    )
    .onConflictDoNothing({
      target: [eventSources.seasonYear, eventSources.type],
    })
    .run();

  return {
    seasons: seasonResult.changes,
    tagHolders: tagHolderResult.changes,
    eventSources: eventSourceResult.changes,
  };
}
