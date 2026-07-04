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

export { olpScore } from "@server/engine/olp";
export { computeStandings } from "@server/engine/standings";
export type { StandingsHolder, StandingsInput, StandingsOutput } from "@server/engine/standings";
export type { Pool, StandingRow, OlpInput } from "@/lib";
