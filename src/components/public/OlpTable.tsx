import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { slugifyName } from "@/lib";
import type { PublicOlpRow } from "@/lib";

/**
 * OLP standings for one sub-league (Spec 06 §6.2): the eligible ranked
 * table (ranks 1..N line up with the payout columns) plus, only when
 * present, a "Not yet eligible" section below it — unranked, no payout,
 * carrying a reason instead. Purely presentational: `ranked`/`notEligible`
 * arrive already projected (and possibly name-filtered) by the caller;
 * this component never re-sorts, re-ranks, or re-rounds. `seasonYear` is
 * optional so the component can render without player-profile links
 * (mirrors `StandingsTable`'s convention).
 */
export function OlpTable({
  ranked,
  notEligible,
  projected,
  seasonYear,
}: {
  ranked: PublicOlpRow[];
  notEligible: PublicOlpRow[];
  projected: boolean;
  seasonYear?: number;
}) {
  if (ranked.length === 0 && notEligible.length === 0) {
    return null;
  }

  const playerCell = (row: PublicOlpRow): ReactNode =>
    seasonYear === undefined ? (
      row.name
    ) : (
      <Link
        href={`/${seasonYear}/players/${slugifyName(row.name)}` as Route}
        className="standings-player-link"
      >
        {row.name}
      </Link>
    );

  return (
    <div className="olp-table-group">
      {ranked.length > 0 ? (
        <div className="standings-table-wrap">
          <table className="standings-table">
            <caption className="standings-table-caption">OLP standings</caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Player</th>
                <th scope="col">OLP score</th>
                <th scope="col">Rating (10%)</th>
                <th scope="col">Avg to par</th>
                <th scope="col">Rounds (−)</th>
                <th scope="col">Pool wins (−)</th>
                <th scope="col">Payout {projected ? "(projected)" : "(final)"}</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((row) => (
                <tr key={row.holderId} className="standings-row">
                  <td data-label="Rank">
                    {row.displayRank}
                    {row.tieBrokenByTag ? (
                      <span
                        className="tie-break-marker"
                        title="Tie broken by tag number"
                        aria-label="Tie broken by tag number"
                      >
                        *
                      </span>
                    ) : null}
                  </td>
                  <td data-label="Player">{playerCell(row)}</td>
                  <td data-label="OLP score">{row.score}</td>
                  <td data-label="Rating (10%)">{row.ratingComponent}</td>
                  <td data-label="Avg to par">{row.avgToPar}</td>
                  <td data-label="Rounds (−)">{row.rounds}</td>
                  <td data-label="Pool wins (−)">{row.poolWins}</td>
                  <td data-label="Payout">{row.payout !== null ? `$${row.payout}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {notEligible.length > 0 ? (
        <div className="olp-not-eligible">
          <h2 className="olp-not-eligible-heading">Not yet eligible</h2>
          <div className="standings-table-wrap">
            <table className="standings-table">
              <caption className="standings-table-caption">
                Not yet eligible for the OLP pot
              </caption>
              <thead>
                <tr>
                  <th scope="col">Player</th>
                  <th scope="col">OLP score</th>
                  <th scope="col">Rating (10%)</th>
                  <th scope="col">Avg to par</th>
                  <th scope="col">Rounds (−)</th>
                  <th scope="col">Pool wins (−)</th>
                  <th scope="col">Reason</th>
                </tr>
              </thead>
              <tbody>
                {notEligible.map((row) => (
                  <tr key={row.holderId} className="standings-row">
                    <td data-label="Player">{playerCell(row)}</td>
                    <td data-label="OLP score">{row.score}</td>
                    <td data-label="Rating (10%)">{row.ratingComponent}</td>
                    <td data-label="Avg to par">{row.avgToPar}</td>
                    <td data-label="Rounds (−)">{row.rounds}</td>
                    <td data-label="Pool wins (−)">{row.poolWins}</td>
                    <td data-label="Reason">{row.ineligibleReason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
