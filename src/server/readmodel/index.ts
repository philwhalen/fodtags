// Server-only: see src/server/db/index.ts for the convention this follows.
import "server-only";

import { buildViews } from "@server/readmodel/build";
import { publish } from "@server/readmodel/publish";

export { buildViews } from "@server/readmodel/build";
export type { StandingsViewPayload, ViewRow } from "@server/readmodel/build";
export { publish } from "@server/readmodel/publish";

/**
 * Convenience composing build → publish. This is what the ingestion
 * pipeline (sub-plan 06) calls at the end of a refresh, and what the boot
 * "ensure published" step (src/instrumentation.ts) calls if the pointer is
 * unset for the season.
 */
export function buildAndPublish(seasonYear: number): number {
  const views = buildViews(seasonYear);
  return publish(seasonYear, views);
}
