import Link from "next/link";

import { SEASON_YEAR } from "@server/admin/context";
import { listPendingForQueue } from "@server/db/repositories/playerMatches";
import { listHolders } from "@server/db/repositories/tagHolders";

import { AdminNav } from "../admin-nav";
import { PendingEntrantRow } from "./match-forms";

export const dynamic = "force-dynamic";

export default async function AdminMatchesPage() {
  const pending = listPendingForQueue(SEASON_YEAR);
  const holders = listHolders(SEASON_YEAR).filter((h) => h.active);

  return (
    <main>
      <h1>Player matching review queue</h1>
      <AdminNav />
      <p>
        <Link href="/admin">← Dashboard</Link>
      </p>

      {pending.length === 0 ? (
        <p>No entrants awaiting review.</p>
      ) : (
        <table>
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
      )}
    </main>
  );
}
