// PURE MODULE — do not weaken this boundary.
//
// `src/server/engine/` computes championship totals, tie-breaks, OLP
// scores, and financial splits as plain functions: plain inputs in, plain
// outputs out. It must never import a DB client, the system clock,
// `fetch`, ingestion code, or anything from Next.js — including the
// `server-only` guard used elsewhere under `src/server/`. Purity is what
// makes the OLP hand-calculation fixtures (81.3 / 81.4, spec 02 §2.8)
// testable in isolation with Vitest.
//
// Populated in sub-plan 04 (pure engine): computeStandings + olpScore.
// See plans/scaffold/04-engine.md.
//
// `computeSeason` (sub-plan 02, plans/common-a/02-engine-scoring.md) is
// the season-wide scoring engine that supersedes the walking-skeleton
// `computeStandings` stub for real standings; `computeStandings` itself
// is left as-is (still used by the pre-sub-plan-04 read-model builder,
// src/server/readmodel/build.ts) until sub-plan 04 generalizes publishing.

export { olpScore } from "@server/engine/olp";
export { computeFinancials } from "@server/engine/financial";
export { computeStandings } from "@server/engine/standings";
export { computeSeason } from "@server/engine/season";
export { computeTagTimeline } from "@server/engine/tags";
export type { StandingsHolder, StandingsInput, StandingsOutput } from "@server/engine/standings";
export type { TagTimelineInput, TagTimelineResult } from "@server/engine/tags";
export type {
  Pool,
  StandingRow,
  OlpInput,
  SeasonSnapshot,
  SeasonResults,
  SeasonFinancials,
  FundBalancesCents,
  LedgerEntry,
  TagAssignmentRow,
} from "@/lib";
