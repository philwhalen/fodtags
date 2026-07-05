import Link from "next/link";
import type { Route } from "next";

import { SEASON_YEAR } from "@server/admin/context";
import { listAuditLog } from "@server/db/repositories/auditLog";

import { AdminNav } from "../admin-nav";

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
    <main>
      <h1>Audit log</h1>
      <AdminNav />
      <p>
        <Link href="/admin">← Dashboard</Link>
      </p>
      <p>Read-only history of admin changes (Spec 10 §10.1).</p>

      <form method="get">
        <label>
          Entity type{" "}
          <input name="entityType" defaultValue={filter ?? ""} placeholder="e.g. payout" />
        </label>{" "}
        <button type="submit">Filter</button>{" "}
        {filter ? (
          <Link href={"/admin/audit" as Route}>Clear filter</Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <p>No audit entries{filter ? ` for entity type “${filter}”` : ""}.</p>
      ) : (
        <table>
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
                <td>{row.entityId}</td>
                <td>{row.at}</td>
                <td>
                  <details>
                    <summary>before / after</summary>
                    <div>
                      <strong>Before</strong>
                      <pre>{formatJson(row.before)}</pre>
                      <strong>After</strong>
                      <pre>{formatJson(row.after)}</pre>
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
