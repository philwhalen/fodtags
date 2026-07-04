import Link from "next/link";

import { SEASON_YEAR } from "@server/admin/context";
import { listEvents } from "@server/db/repositories/events";
import { listResultsBySeason } from "@server/db/repositories/eventResults";
import { listHolders } from "@server/db/repositories/tagHolders";

import { AdminNav } from "../admin-nav";
import { CancelEventButton, TagNotPresentButton } from "./adjustment-forms";

export const dynamic = "force-dynamic";

export default async function AdminAdjustmentsPage() {
  const events = listEvents(SEASON_YEAR);
  const results = listResultsBySeason(SEASON_YEAR);
  const holders = new Map(listHolders(SEASON_YEAR).map((h) => [h.id, h.name]));
  const eventLabel = new Map(events.map((e) => [e.id, e.label]));

  return (
    <main>
      <h1>Adjustments</h1>
      <AdminNav />
      <p>
        <Link href="/admin">← Dashboard</Link>
      </p>

      <h2>Cancel event</h2>
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>Date</th>
            <th>Canceled</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>{event.label}</td>
              <td>{event.eventDate}</td>
              <td>{event.canceled ? "yes" : "no"}</td>
              <td>
                {!event.canceled ? <CancelEventButton eventId={event.id} /> : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Tag not present</h2>
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>Holder</th>
            <th>Tag present</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {results
            .filter((r) => r.holderId !== null)
            .map((result) => (
              <tr key={result.id}>
                <td>{eventLabel.get(result.eventId) ?? result.eventId}</td>
                <td>{holders.get(result.holderId!) ?? result.displayName}</td>
                <td>{result.tagPresent ? "yes" : "no"}</td>
                <td>
                  {result.tagPresent ? <TagNotPresentButton resultId={result.id} /> : "—"}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </main>
  );
}
