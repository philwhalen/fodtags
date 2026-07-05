// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import type { PublicFinancialsPayload, SeasonResults } from "@/lib";

import type { ViewRow } from "./build";

/**
 * Builds the single `financials` read-model view (Spec 09 §9.3; plans
 * financials/02-readmodel-build.md) from the `results.financials` already
 * computed by the pure engine in `buildViews` — a read-only projection, no
 * new computation, no repo reads. Mirrors the OLP/score-sheet build edge:
 * the whole `SeasonFinancials` is spread as-is, with the shared
 * `updatedAt`/`pendingReview` (stamped once in `buildViews`) and this
 * view's own `stale` signal attached.
 */
export function buildFinancialsView(
  seasonYear: number,
  results: SeasonResults,
  updatedAt: string,
  stale: boolean,
  pendingReview: number,
): ViewRow {
  const payload: PublicFinancialsPayload = {
    ...results.financials,
    updatedAt,
    stale,
    pendingReview,
  };

  return {
    seasonYear,
    viewKey: "financials",
    payload,
  };
}
