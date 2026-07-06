import Link from "next/link";
import type { Route } from "next";

import { SEASON_YEAR } from "@server/admin/context";
import { listAuditLog } from "@server/db/repositories/auditLog";

export const dynamic = "force-dynamic";

function formatJson(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string }>;
}) {
  const { entityType } = await searchParams;
  const filter = entityType?.trim() || undefined;
  const rows = listAuditLog(SEASON_YEAR, { entityType: filter });

  return (
    <>
      <h1 className="admin-page-title">Audit log</h1>
      <p className="admin-page-intro">Read-only history of admin changes (Spec 10 §10.1).</p>

      <form method="get" className="admin-toolbar">
        <label className="admin-field">
          Entity type{" "}
          <input
            name="entityType"
            defaultValue={filter ?? ""}
            placeholder="e.g. payout"
            className="admin-input"
          />
        </label>{" "}
        <button type="submit" className="admin-button admin-button--primary">
          Filter
        </button>{" "}
        {filter ? (
          <Link href={"/admin/audit" as Route} className="admin-toolbar-link">
            Clear filter
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <p className="admin-empty">No audit entries{filter ? ` for entity type “${filter}”` : ""}.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity type</th>
                <th>Entity id</th>
                <th>At</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.actorEmail}</td>
                  <td>{row.action}</td>
                  <td>{row.entityType}</td>
                  <td className="admin-num">{row.entityId}</td>
                  <td>{row.at}</td>
                  <td>
                    <details className="admin-details">
                      <summary>before / after</summary>
                      <div className="admin-diff">
                        <span className="admin-diff-label">Before</span>
                        <pre className="admin-json">{formatJson(row.before)}</pre>
                        <span className="admin-diff-label">After</span>
                        <pre className="admin-json">{formatJson(row.after)}</pre>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
