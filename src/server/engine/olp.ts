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

/**
 * OLP pot for a sub-league: $1 per paid League-Night entry (Spec 09 §9.1;
 * Spec 02 §2.8). A trivial pure helper so the `$1 ×` conversion has one
 * named place, matching the pattern in Spec 06 §6.3.
 */
export function entriesToOlpPot(paidEntries: number): number {
  return paidEntries;
}

/**
 * Splits `pot` whole dollars into 1st/2nd/3rd shares at 50% / 30% / 20%
 * using the **largest-remainder method**, so the three shares always sum
 * to exactly `pot` (Spec 02 §2.8: "rounded as best as possible"). Floor
 * each share, then hand out the leftover dollars one at a time to the
 * shares with the largest fractional remainder (ties broken by rank, so
 * 1st place wins any remainder tie).
 */
export function largestRemainderPayout(pot: number): [number, number, number] {
  const raw = [0.5 * pot, 0.3 * pot, 0.2 * pot];
  const floors = raw.map((r) => Math.floor(r));
  const distributed = floors.reduce((acc, f) => acc + f, 0);
  const remainder = Math.round(pot - distributed);

  const byRemainder = raw
    .map((r, index) => ({ index, fraction: r - Math.floor(r) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  const shares = floors.slice();
  for (let k = 0; k < remainder; k++) {
    const slot = byRemainder[k];
    if (!slot) break;
    shares[slot.index] = (shares[slot.index] ?? 0) + 1;
  }

  return [shares[0] ?? 0, shares[1] ?? 0, shares[2] ?? 0];
}
