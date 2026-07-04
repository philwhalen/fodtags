import type { PublicStandingsRow } from "@/lib/standings-view";

import { StandingsTable } from "./StandingsTable";

/**
 * Pre-season / zero-points roster (Spec 04 §4.4 "show roster at 0 points,
 * not an error"). When rows exist they render in the table; otherwise a
 * short holding message inside the shell.
 */
export function EmptyStandingsState({
  rows,
  message = "No tag holders on the roster yet.",
}: {
  rows: PublicStandingsRow[];
  message?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="standings-empty" role="status">
        <p>{message}</p>
      </div>
    );
  }

  return <StandingsTable rows={rows} />;
}
