import Link from "next/link";

import { SEASON_YEAR } from "@server/admin/context";
import { listHolders } from "@server/db/repositories/tagHolders";
import { listSwitchesBySeason } from "@server/db/repositories/poolSwitches";

import { AdminNav } from "../admin-nav";
import { CreateHolderForm, HolderRow, PoolSwitchForm } from "./roster-forms";

export const dynamic = "force-dynamic";

export default async function AdminRosterPage() {
  const holders = listHolders(SEASON_YEAR);
  const switches = listSwitchesBySeason(SEASON_YEAR);

  return (
    <main>
      <h1>Roster</h1>
      <AdminNav />
      <p>
        <Link href="/admin">← Dashboard</Link>
      </p>

      <h2>Tag holders</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Tag #</th>
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
            <HolderRow key={holder.id} holder={holder} />
          ))}
        </tbody>
      </table>

      <h2>Add holder</h2>
      <CreateHolderForm />

      <h2>Pool switches</h2>
      {switches.length === 0 ? (
        <p>No pool switches recorded.</p>
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

      <h3>Record pool switch</h3>
      <PoolSwitchForm holders={holders.filter((h) => h.active)} />
    </main>
  );
}
