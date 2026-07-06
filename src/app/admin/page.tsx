import { getCurrentVersion } from "@server/db/repositories/readModel";
import { listRuns } from "@server/db/repositories/refreshRuns";

import { RatingsRefreshButton } from "./ratings-refresh-button";
import { RefreshButton } from "./refresh-button";

const SEASON_YEAR = 2026;

export const dynamic = "force-dynamic";

/**
 * Stub admin dashboard (plans/scaffold/08-auth-admin.md; specs/10-Admin-Console.md §10.1/§10.7).
 *
 * A server component reading directly via repositories — never leaks
 * secrets to the client, and the DB/session lookups here run in the
 * Node.js runtime (unlike `src/middleware.ts`, which cannot). Reachability
 * is already enforced by `src/middleware.ts`; the signed-in identity and
 * sign-out live in the shared header auth control (`app/admin/layout.tsx`).
 */
export default async function AdminPage() {
  const currentVersion = getCurrentVersion(SEASON_YEAR);
  const runs = listRuns(SEASON_YEAR, 10);

  return (
    <>
      <h1 className="admin-page-title">FOD Tags Admin</h1>

      <section className="admin-section">
        <h2 className="admin-section-heading">Read model</h2>
        <p>
          Current published version for {SEASON_YEAR}:{" "}
          <strong>{currentVersion ?? "none published"}</strong>
        </p>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-heading">Ingestion</h2>
        <div className="admin-actions">
          <RefreshButton />
          <RatingsRefreshButton />
        </div>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-heading">Recent refresh runs</h2>
        {runs.length === 0 ? (
          <p className="admin-empty">No refresh runs recorded yet.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Ended</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="admin-num">{run.id}</td>
                    <td>{run.trigger}</td>
                    <td>
                      <span className="admin-status" data-status={run.status}>
                        {run.status}
                      </span>
                    </td>
                    <td>{run.startedAt}</td>
                    <td>{run.endedAt ?? "—"}</td>
                    <td>{run.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
