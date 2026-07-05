// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.6.
import "server-only";

import { child } from "@server/logging";

/**
 * Shared single-flight guard for `runRefresh` and `runRatingsRefresh`
 * (Spec 03 §3.6 / specs/12-Architecture.md §12.6). A module-level
 * in-flight promise — not a plain boolean — so a second caller coalesces
 * onto the same result rather than starting a concurrent run.
 */
let inFlight: Promise<unknown> | null = null;

/** Test-only escape hatch: forces the guard back to idle between test cases. */
export function __resetSingleFlightForTests(): void {
  inFlight = null;
}

export function withSingleFlight<T extends { outcome: "completed" | "skipped" }>(
  job: string,
  execute: () => Promise<T>,
  meta: Record<string, unknown>,
): Promise<T> {
  if (inFlight) {
    const log = child({ job });
    log.info({ event: `${job}.skipped`, ...meta }, `${job} already in flight — coalescing onto it`);
    return inFlight.then((result) => ({ ...(result as T), outcome: "skipped" as const }));
  }

  const run = execute();
  inFlight = run;

  run.finally(() => {
    inFlight = null;
  });

  return run;
}
