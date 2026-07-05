"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Admin "Pull official ratings now" control — mirrors `RefreshButton`.
 */
export function RatingsRefreshButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/ratings-refresh", { method: "POST" });
      const body: unknown = await response.json();
      if (!response.ok) {
        const error =
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error: unknown }).error)
            : `HTTP ${response.status}`;
        setMessage(`Ratings pull failed: ${error}`);
        return;
      }

      const summary = body as {
        outcome?: string;
        status?: string;
        runId?: number;
        effectiveDate?: string;
        publishedVersion?: number;
      };
      setMessage(
        `Ratings pull ${summary.outcome ?? "completed"} — status: ${summary.status ?? "unknown"}` +
          (summary.effectiveDate ? `, effective ${summary.effectiveDate}` : "") +
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
        {pending ? "Pulling ratings…" : "Pull official ratings now"}
      </button>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
