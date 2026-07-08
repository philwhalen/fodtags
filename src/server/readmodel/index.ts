// Server-only: see src/server/db/index.ts for the convention this follows.
import "server-only";

import { buildViews } from "@server/readmodel/build";
import { publish } from "@server/readmodel/publish";

export { buildViews } from "@server/readmodel/build";
export type { BuildViewsResult, StandingsViewPayload, ViewRow } from "@server/readmodel/build";
export { publish } from "@server/readmodel/publish";

/**
 * Synchronous build → publish. Boot and unit tests that don't need the
 * shared single-flight guard call this directly; admin writes and the
 * ingestion pipeline call `recompute` instead.
 */
export function buildAndPublish(seasonYear: number): number {
  const { views, currentTags } = buildViews(seasonYear);
  return publish(seasonYear, views, currentTags);
}

export {
  recompute,
  __resetRecomputeSingleFlightForTests,
} from "@server/readmodel/recompute";
