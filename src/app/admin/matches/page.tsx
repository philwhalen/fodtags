import { SEASON_YEAR } from "@server/admin/context";
import { listPendingForQueue } from "@server/db/repositories/playerMatches";
import { listHolders } from "@server/db/repositories/tagHolders";

import { PendingEntrantRow } from "./match-forms";

export const dynamic = "force-dynamic";

export default async function AdminMatchesPage() {
  const pending = listPendingForQueue(SEASON_YEAR);
  const holders = listHolders(SEASON_YEAR).filter((h) => h.active);

  return (
    <>
      <h1 className="admin-page-title">Player matching review queue</h1>

      {pending.length === 0 ? (
        <p className="admin-empty">No entrants awaiting review.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>PDGA #</th>
                <th>Name</th>
                <th>Appearances</th>
                <th>Suggestions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((entry) => (
                <PendingEntrantRow
                  key={entry.pdgaNumber}
                  entry={entry}
                  holders={holders}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
