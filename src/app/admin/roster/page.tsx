import { SEASON_YEAR } from "@server/admin/context";
import { listHolders } from "@server/db/repositories/tagHolders";
import { latestOfficialRatingByHolder } from "@server/db/repositories/ratingsHistory";
import { listSwitchesBySeason } from "@server/db/repositories/poolSwitches";

import { CreateHolderForm, HolderRow, PoolSwitchForm } from "./roster-forms";

export const dynamic = "force-dynamic";

export default async function AdminRosterPage() {
  const holders = listHolders(SEASON_YEAR);
  const switches = listSwitchesBySeason(SEASON_YEAR);
  const latestRatings = latestOfficialRatingByHolder(SEASON_YEAR);

  return (
    <>
      <h1 className="admin-page-title">Roster</h1>

      <section className="admin-section">
        <h2 className="admin-section-heading">Tag holders</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Initial tag #</th>
                <th>Current tag</th>
                <th>Pool</th>
                <th>Entry date</th>
                <th>PDGA #</th>
                <th>Rating</th>
                <th>Active</th>
                <th>PDGA member</th>
                <th>Edit</th>
              </tr>
            </thead>
            <tbody>
              {holders.map((holder) => (
                <HolderRow
                  key={holder.id}
                  holder={holder}
                  currentRating={latestRatings.get(holder.id) ?? null}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-heading">Add holder</h2>
        <CreateHolderForm />
      </section>

      <section className="admin-section">
        <h2 className="admin-section-heading">Pool switches</h2>
        {switches.length === 0 ? (
          <p className="admin-empty">No pool switches recorded.</p>
        ) : (
          <ul>
            {switches.map((sw) => (
              <li key={sw.id}>
                Holder #{sw.holderId}: {sw.fromPool} → {sw.toPool} effective {sw.effectiveDate} (by{" "}
                {sw.approvedBy})
              </li>
            ))}
          </ul>
        )}

        <h3 className="admin-subsection-heading">Record pool switch</h3>
        <PoolSwitchForm holders={holders.filter((h) => h.active)} />
      </section>
    </>
  );
}
