// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { buildViews } from "@server/readmodel/build";
import { publish } from "@server/readmodel/publish";

/**
 * Shared single-flight guard for read-model publish (plans/common-a/06-admin-forms.md
 * "Recompute wiring"). Both admin mutations and the ingestion pipeline's final
 * step call `recompute` so concurrent publishes coalesce instead of racing.
 *
 * Distinct from `runRefresh`'s own single-flight (which guards the whole
 * fetch→normalize→match→recompute pipeline) — this guard applies only to the
 * build→publish transaction.
 */
let inFlight: Promise<number> | null = null;

/** Test-only escape hatch — reset between cases that assert coalescing. */
export function __resetRecomputeSingleFlightForTests(): void {
  inFlight = null;
}

/**
 * Load snapshot → pure engine → atomic publish. Returns the new version
 * number. Concurrent callers receive the same promise/result.
 */
export function recompute(seasonYear: number): Promise<number> {
  if (inFlight) {
    return inFlight;
  }

  const run = Promise.resolve().then(() => {
    const { views, currentTags } = buildViews(seasonYear);
    return publish(seasonYear, views, currentTags);
  });

  inFlight = run;
  run.finally(() => {
    inFlight = null;
  });

  return run;
}
