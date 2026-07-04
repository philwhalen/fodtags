"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Stub-dashboard "Refresh now" control (plans/scaffold/08-auth-admin.md).
 *
 * A client component only for the click handler + local pending/result
 * state — it never imports server code (CLAUDE.md boundary: "The 'Refresh
 * now' button may be a small client component but must not import server
 * code directly"). It POSTs to `/api/admin/refresh` and, on success, asks
 * the server-rendered dashboard to refetch (`router.refresh()`) so the new
 * read-model version and run row show up without a full page reload.
 */
export function RefreshButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/refresh", { method: "POST" });
      const body: unknown = await response.json();
      if (!response.ok) {
        const error =
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error: unknown }).error)
            : `HTTP ${response.status}`;
        setMessage(`Refresh failed: ${error}`);
        return;
      }

      const summary = body as {
        outcome?: string;
        status?: string;
        runId?: number;
        publishedVersion?: number;
      };
      setMessage(
        `Refresh ${summary.outcome ?? "completed"} — status: ${summary.status ?? "unknown"}` +
          (summary.runId !== undefined ? `, run #${summary.runId}` : "") +
          (summary.publishedVersion !== undefined ? `, version ${summary.publishedVersion}` : ""),
      );
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button onClick={handleClick} disabled={pending} type="button">
        {pending ? "Refreshing…" : "Refresh now"}
      </button>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
