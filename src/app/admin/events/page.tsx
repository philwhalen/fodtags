import { SEASON_YEAR } from "@server/admin/context";
import { defaultEventSourceType } from "@server/admin/default-event-type";
import { listSources } from "@server/db/repositories/eventSources";

import { RegisterSourceForm, SourceRow } from "./event-forms";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const sources = listSources(SEASON_YEAR);
  const defaultType = defaultEventSourceType(sources.map((s) => s.type));

  return (
    <>
      <h1 className="admin-page-title">Event sources</h1>

      <section className="admin-section">
        <h2 className="admin-section-heading">Registered sources</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
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
                <th>Stale</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <SourceRow key={source.id} source={source} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-heading">Register source</h2>
        <RegisterSourceForm key={sources.length} defaultType={defaultType} />
      </section>
    </>
  );
}
