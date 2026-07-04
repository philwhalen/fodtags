import Link from "next/link";

import { SEASON_YEAR } from "@server/admin/context";
import { getEntryCount } from "@server/db/repositories/entryCounts";
import { listEvents } from "@server/db/repositories/events";
import { listSources } from "@server/db/repositories/eventSources";

import { AdminNav } from "../admin-nav";
import { EntryCountForm } from "./entry-count-forms";

export const dynamic = "force-dynamic";

export default async function AdminEntryCountsPage() {
  const events = listEvents(SEASON_YEAR).filter((e) => e.type === "LeagueNight" && !e.canceled);
  const sources = listSources(SEASON_YEAR);
  const sourceLabel = new Map(sources.map((s) => [s.id, s.label]));

  return (
    <main>
      <h1>Entry counts</h1>
      <AdminNav />
      <p>
        <Link href="/admin">← Dashboard</Link>
      </p>
      <p>Paid entry counts per League Night (feeds OLP pot).</p>

      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>Source</th>
            <th>Date</th>
            <th>Paid entries</th>
            <th>Update</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const count = getEntryCount(event.id);
            return (
              <tr key={event.id}>
                <td>{event.label}</td>
                <td>{sourceLabel.get(event.eventSourceId) ?? event.eventSourceId}</td>
                <td>{event.eventDate}</td>
                <td>{count?.paidEntries ?? "—"}</td>
                <td>
                  <EntryCountForm eventId={event.id} current={count?.paidEntries ?? 0} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
