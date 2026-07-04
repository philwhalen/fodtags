import { auth, signOut } from "@server/auth";
import { getCurrentVersion } from "@server/db/repositories/readModel";
import { listRuns } from "@server/db/repositories/refreshRuns";

import { RefreshButton } from "./refresh-button";

const SEASON_YEAR = 2026;

/**
 * Stub admin dashboard (plans/scaffold/08-auth-admin.md; specs/10-Admin-Console.md §10.1/§10.7).
 *
 * A server component reading directly via repositories — never leaks
 * secrets to the client, and the DB/session lookups here run in the
 * Node.js runtime (unlike `src/middleware.ts`, which cannot). Reachability
 * is already enforced by `src/middleware.ts`; `auth()` here is just to
 * display the signed-in identity.
 */
export default async function AdminPage() {
  const session = await auth();
  const currentVersion = getCurrentVersion(SEASON_YEAR);
  const runs = listRuns(SEASON_YEAR, 10);

  return (
    <main>
      <h1>FOD Tags Admin</h1>
      <p>
        Signed in as <strong>{session?.user?.email ?? "unknown"}</strong>
      </p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button type="submit">Sign out</button>
      </form>

      <h2>Read model</h2>
      <p>
        Current published version for {SEASON_YEAR}:{" "}
        <strong>{currentVersion ?? "none published"}</strong>
      </p>

      <h2>Ingestion</h2>
      <RefreshButton />

      <h2>Recent refresh runs</h2>
      {runs.length === 0 ? (
        <p>No refresh runs recorded yet.</p>
      ) : (
        <table>
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
                <td>{run.id}</td>
                <td>{run.trigger}</td>
                <td>{run.status}</td>
                <td>{run.startedAt}</td>
                <td>{run.endedAt ?? "—"}</td>
                <td>{run.error ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
