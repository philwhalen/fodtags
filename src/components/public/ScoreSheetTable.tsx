import type { Route } from "next";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { capLabel, formatTagNumber } from "@/lib";
import type { DisplayLine, ScoreSheetHolderView, ScoreSheetProjection } from "@/lib";

/** Renders one line item's title/finish/points/tie-break/reason as plain
 * text (Spec 11 §11.x — reasons are text, never color-only). */
function ScoreSheetLine({ line }: { line: DisplayLine }) {
  return (
    <div
      className={
        line.projected ? "score-sheet-line score-sheet-line-projected" : "score-sheet-line"
      }
    >
      <span className="score-sheet-line-title">{line.title}</span>
      <span className="score-sheet-line-finish">{line.finish}</span>
      {line.tieBrokenByTag ? (
        <span
          className="tie-break-marker"
          title="Tie broken by tag number"
          aria-label="Tie broken by tag number"
        >
          *
        </span>
      ) : null}
      <span className="score-sheet-line-points">{line.points}</span>
      {line.reason ? <span className="score-sheet-line-reason"> — {line.reason}</span> : null}
    </div>
  );
}

/** Level-2 per-holder detail: grouped counted lines (+ inline projected
 * Podium), plus a nested "show dropped" disclosure (Spec 07 §7.2/§7.3).
 * Groups with no counted, dropped, or projected lines are skipped —
 * `projectScoreSheet` always emits all four groups, even empty ones. */
function ScoreSheetHolderDetail({ holderView }: { holderView: ScoreSheetHolderView }) {
  const visibleGroups = holderView.groups.filter(
    (group) => group.counted.length > 0 || group.dropped.length > 0,
  );

  return (
    <details className="score-sheet-detail">
      <summary>Show breakdown</summary>
      {visibleGroups.map((group) => {
        const projectedLines =
          group.type === "Podium" ? group.dropped.filter((line) => line.projected) : [];
        return (
          <div key={group.type} className="score-sheet-group">
            <h4 className="score-sheet-group-heading">{group.label}</h4>
            {group.counted.map((line) => (
              <ScoreSheetLine key={line.key} line={line} />
            ))}
            {projectedLines.map((line) => (
              <ScoreSheetLine key={line.key} line={line} />
            ))}
          </div>
        );
      })}

      {holderView.hasDropped ? (
        <details className="score-sheet-dropped">
          <summary>Show dropped ({holderView.holder.dropped.length})</summary>
          {holderView.groups
            .flatMap((group) => group.dropped.filter((line) => !line.projected))
            .map((line) => (
              <ScoreSheetLine key={line.key} line={line} />
            ))}
        </details>
      ) : null}
    </details>
  );
}

/**
 * Pool score sheet (Spec 07 §7.2/§7.3): a caps note, the Level-1 Championship
 * summary table (reusing `standings-table*` so the mobile-card media query
 * applies), and a Level-2 `<details>` per holder for the counted/dropped
 * line-item breakdown. Purely presentational — `view` arrives already
 * projected (and possibly name-filtered) by the caller; this component
 * never re-sorts, re-ranks, or recomputes totals.
 */
export function ScoreSheetTable({
  view,
  seasonYear,
}: {
  view: ScoreSheetProjection;
  seasonYear: number;
}) {
  const capsNote = [
    capLabel("LeagueNight", view.caps),
    capLabel("Tournament", view.caps),
    capLabel("FODOpen", view.caps),
  ].join(" · ");

  const playerCell = (holderView: ScoreSheetHolderView): ReactNode => (
    <Link
      href={`/${seasonYear}/players/${holderView.holder.slug}` as Route}
      className="standings-player-link"
    >
      {holderView.holder.name}
    </Link>
  );

  return (
    <div>
      <p className="score-sheet-caps">
        {capsNote} ·{" "}
        <Link
          href={`/${seasonYear}/financials#pots-skins` as Route}
          className="score-sheet-skins-link"
        >
          skins purse detail →
        </Link>
      </p>

      <div className="standings-table-wrap">
        <table className="standings-table">
          <caption className="standings-table-caption">Score sheet — Pool {view.pool}</caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Player</th>
              <th scope="col">Tag #</th>
              <th scope="col">League Night</th>
              <th scope="col">Podium</th>
              <th scope="col">Tournament</th>
              <th scope="col">FOD Open</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {view.holders.map((holderView) => {
              const { holder } = holderView;
              return (
                <Fragment key={holder.holderId}>
                  <tr className="standings-row">
                    <td data-label="Rank">
                      {holder.rank}
                      {holder.tieBrokenByTag ? (
                        <span
                          className="tie-break-marker"
                          title="Tie broken by tag number"
                          aria-label="Tie broken by tag number"
                        >
                          *
                        </span>
                      ) : null}
                    </td>
                    <td data-label="Player" id={holder.slug}>
                      {playerCell(holderView)}
                    </td>
                    <td data-label="Tag #">{formatTagNumber(holder.tagNumber)}</td>
                    <td data-label="League Night">{holder.byType.LeagueNight}</td>
                    <td data-label="Podium">{holder.byType.Podium}</td>
                    <td data-label="Tournament">{holder.byType.Tournament}</td>
                    <td data-label="FOD Open">{holder.byType.FODOpen}</td>
                    <td data-label="Total">{holder.total}</td>
                  </tr>
                  <tr className="score-sheet-detail-row">
                    <td colSpan={8}>
                      <ScoreSheetHolderDetail holderView={holderView} />
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
