import { SEASON_YEAR } from "@server/admin/context";
import { countResultsForHolder } from "@server/db/repositories/eventResults";
import { listPendingForQueue } from "@server/db/repositories/playerMatches";
import { listHolders, listProvisionalHolders } from "@server/db/repositories/tagHolders";

import { PendingEntrantRow, ProvisionalHolderRow } from "./match-forms";

export const dynamic = "force-dynamic";

export default async function AdminMatchesPage() {
  // Section A: auto-added provisional holders awaiting confirm/merge/exclude
  // (Spec 10 §10.4 "A"). Section B: ambiguous/no-PDGA-# entrants still
  // needing a link decision (Spec 10 §10.4 "B") — unchanged data/flow.
  const provisional = listProvisionalHolders(SEASON_YEAR);
  const pending = listPendingForQueue(SEASON_YEAR);
  const holders = listHolders(SEASON_YEAR).filter((h) => h.active);
  // Merge targets must already be confirmed holders — merging into another
  // still-provisional record would just move the pending state, not resolve it.
  const confirmedHolders = holders.filter((h) => h.confirmed);

  return (
    <>
      <h1 className="admin-page-title">Player review &amp; confirmation</h1>

      {provisional.length === 0 && pending.length === 0 ? (
        <p className="admin-empty">No players awaiting review.</p>
      ) : (
        <>
          <section className="admin-section">
            <h2 className="admin-section-heading">Provisional holders awaiting confirmation</h2>
            {provisional.length === 0 ? (
              <p className="admin-empty">No provisional holders awaiting confirmation.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>PDGA #</th>
                      <th>Entry date</th>
                      <th>Rating</th>
                      <th>PDGA member</th>
                      <th>Rounds</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {provisional.map((holder) => (
                      <ProvisionalHolderRow
                        key={holder.id}
                        holder={holder}
                        roundCount={countResultsForHolder(SEASON_YEAR, holder.id)}
                        targetHolders={confirmedHolders}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="admin-section">
            <h2 className="admin-section-heading">Entrants needing a link decision</h2>
            {pending.length === 0 ? (
              <p className="admin-empty">No entrants awaiting a link decision.</p>
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
          </section>
        </>
      )}
    </>
  );
}
