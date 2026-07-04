import Link from "next/link";

import { SEASON_YEAR } from "@server/admin/context";
import { listSources } from "@server/db/repositories/eventSources";

import { AdminNav } from "../admin-nav";
import { RegisterSourceForm, SourceRow } from "./event-forms";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const sources = listSources(SEASON_YEAR);

  return (
    <main>
      <h1>Event sources</h1>
      <AdminNav />
      <p>
        <Link href="/admin">← Dashboard</Link>
      </p>

      <h2>Registered sources</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Type</th>
            <th>Label</th>
            <th>PDGA event</th>
            <th>Start</th>
            <th>End</th>
            <th>Complete</th>
            <th>Active</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => (
            <SourceRow key={source.id} source={source} />
          ))}
        </tbody>
      </table>

      <h2>Register source</h2>
      <RegisterSourceForm />
    </main>
  );
}
