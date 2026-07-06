import { SEASON_YEAR } from "@server/admin/context";
import { listEvents } from "@server/db/repositories/events";
import { listResultsBySeason } from "@server/db/repositories/eventResults";
import { listHolders } from "@server/db/repositories/tagHolders";

import { CancelEventButton, TagNotPresentButton } from "./adjustment-forms";

export const dynamic = "force-dynamic";

export default async function AdminAdjustmentsPage() {
  const events = listEvents(SEASON_YEAR);
  const results = listResultsBySeason(SEASON_YEAR);
  const holders = new Map(listHolders(SEASON_YEAR).map((h) => [h.id, h.name]));
  const eventLabel = new Map(events.map((e) => [e.id, e.label]));

  return (
    <>
      <h1 className="admin-page-title">Adjustments</h1>

      <section className="admin-section">
        <h2 className="admin-section-heading">Cancel event</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
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
                  <td>
                    <span className="admin-status" data-status={event.canceled ? "yes" : "no"}>
                      {event.canceled ? "yes" : "no"}
                    </span>
                  </td>
                  <td>
                    {!event.canceled ? <CancelEventButton eventId={event.id} /> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-heading">Tag not present</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
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
                    <td>
                      <span
                        className="admin-status"
                        data-status={result.tagPresent ? "yes" : "no"}
                      >
                        {result.tagPresent ? "yes" : "no"}
                      </span>
                    </td>
                    <td>
                      {result.tagPresent ? <TagNotPresentButton resultId={result.id} /> : "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
