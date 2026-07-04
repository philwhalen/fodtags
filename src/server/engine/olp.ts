// PURE MODULE — see src/server/engine/index.ts for the purity contract.
// No DB, no clock, no fetch, no Next.js, no `server-only`.

import type { OlpInput } from "@/lib";

/**
 * Overall League Performance score (Spec 02 §2.8). Lower is better.
 *
 *   0.10 × ratingOnLastDay + avgScoreToPar − roundsPlayed − leagueNightPoolWins
 *
 * Returns the RAW number at full internal precision (e.g.
 * `85.3 + 5 - 7 - 2` may come back as `81.30000000000001` due to
 * floating-point error). Rounding to one decimal for display happens at
 * the read-model/UI edge (see `roundToOneDecimal` in `src/lib/`) — NOT
 * here — so that any further computation downstream (rankings, tie
 * comparisons, etc.) works off full precision rather than a
 * once-rounded value.
 */
export function olpScore(i: OlpInput): number {
  return 0.1 * i.ratingOnLastDay + i.avgScoreToPar - i.roundsPlayed - i.leagueNightPoolWins;
}
