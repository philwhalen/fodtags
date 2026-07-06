// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { db } from "@server/db/client";
import { seasons, tagHolders } from "@server/db/schema";
import type { Pool } from "@server/db/schema";

/**
 * Opt-in, real-data validation seed: the league's actual 2026 roster. Names
 * + pool came from the hand-maintained Google Sheet; tag numbers and PDGA
 * numbers were captured from a real end-to-end refresh (PDGA numbers were
 * read out of the live round-scrape entrant data). `pdgaMembership` is
 * inferred from the presence of a PDGA number (a holder who entered PDGA
 * events under their number is a member); `ratingAtEntry` is left null —
 * official ratings are populated separately by a ratings refresh.
 *
 * Nick Pixley (tag 16) has no PDGA number: he plays as a guest with no
 * number on file, and is name-matched to his scored rounds (regression
 * coverage for the null-pdga match path — see persist.ts).
 *
 * Meant to run against a fresh `DATA_DIR` with `SEED_SYNTHETIC=false` (so
 * the synthetic boot fixture doesn't layer fake holders alongside). NOT
 * invoked by boot or by the default `npm run db:seed`; run explicitly via
 * `npm run db:seed:real-roster`.
 *
 * Idempotent: season upserts on `year`; holders upsert-do-nothing on
 * (seasonYear, tagNumber), so a re-run changes nothing.
 */

const SEASON_YEAR = 2026;
const ENTRY_DATE = "2026-01-01T00:00:00.000Z";

/** Real 2026 roster: name, pool, tag number, PDGA number (null = plays as a
 * guest with no PDGA number on file). */
const REAL_ROSTER: ReadonlyArray<{
  name: string;
  pool: Pool;
  tagNumber: number;
  pdgaNumber: number | null;
}> = [
  { name: "Jonathan Svendsen", pool: "A", tagNumber: 1, pdgaNumber: 168110 },
  { name: "Josh Goheen", pool: "A", tagNumber: 2, pdgaNumber: 125890 },
  { name: "Anthony D'Aiuto", pool: "A", tagNumber: 3, pdgaNumber: 211843 },
  { name: "Troy Upright", pool: "A", tagNumber: 4, pdgaNumber: 201801 },
  { name: "Mike Diefes", pool: "A", tagNumber: 5, pdgaNumber: 216896 },
  { name: "Brian Colotti", pool: "A", tagNumber: 6, pdgaNumber: 242744 },
  { name: "CJ Schneider", pool: "A", tagNumber: 7, pdgaNumber: 251170 },
  { name: "Michael Berry", pool: "B", tagNumber: 8, pdgaNumber: 289769 },
  { name: "Chris Kaasmann", pool: "B", tagNumber: 9, pdgaNumber: 297087 },
  { name: "Scott Styles", pool: "B", tagNumber: 10, pdgaNumber: 117240 },
  { name: "Jonathan Rivera", pool: "B", tagNumber: 11, pdgaNumber: 265179 },
  { name: "Phil Whalen", pool: "B", tagNumber: 12, pdgaNumber: 245498 },
  { name: "Mike Noops", pool: "B", tagNumber: 13, pdgaNumber: 53675 },
  { name: "Joe Schneider", pool: "B", tagNumber: 14, pdgaNumber: 246869 },
  { name: "Dylan Mango", pool: "B", tagNumber: 15, pdgaNumber: 187854 },
  { name: "Nick Pixley", pool: "B", tagNumber: 16, pdgaNumber: null },
  { name: "Vedad Mulaibrahimovic", pool: "B", tagNumber: 17, pdgaNumber: 314292 },
  { name: "Adam Dore", pool: "A", tagNumber: 20, pdgaNumber: 213570 },
  { name: "Edward Slominski", pool: "B", tagNumber: 21, pdgaNumber: 201580 },
  { name: "Richard Mango", pool: "B", tagNumber: 22, pdgaNumber: 43558 },
  { name: "Sean Donnelly", pool: "A", tagNumber: 24, pdgaNumber: 245297 },
  { name: "Roger Del Russo", pool: "A", tagNumber: 26, pdgaNumber: 242341 },
  { name: "Michael Pepper", pool: "A", tagNumber: 27, pdgaNumber: 235276 },
  { name: "John MacDuff", pool: "B", tagNumber: 28, pdgaNumber: 77784 },
  { name: "Adam Parsells", pool: "A", tagNumber: 29, pdgaNumber: 173127 },
];

export interface SeedRealRosterCounts {
  seasons: number;
  tagHolders: number;
}

export function seedRealRoster(): SeedRealRosterCounts {
  const seasonResult = db
    .insert(seasons)
    .values({ year: SEASON_YEAR })
    .onConflictDoNothing({ target: seasons.year })
    .run();

  const holderResult = db
    .insert(tagHolders)
    .values(
      REAL_ROSTER.map((holder) => ({
        seasonYear: SEASON_YEAR,
        name: holder.name,
        tagNumber: holder.tagNumber,
        pool: holder.pool,
        entryDate: ENTRY_DATE,
        pdgaNumber: holder.pdgaNumber,
        ratingAtEntry: null,
        active: true,
        // A holder who entered PDGA events under a number is a member.
        pdgaMembership: holder.pdgaNumber !== null,
      })),
    )
    .onConflictDoNothing({ target: [tagHolders.seasonYear, tagHolders.tagNumber] })
    .run();

  return { seasons: seasonResult.changes, tagHolders: holderResult.changes };
}
