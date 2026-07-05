// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.3 / §12.6.
import "server-only";

import fs from "node:fs";
import path from "node:path";

import { config } from "@server/config";
import { child } from "@server/logging";
import {
  listActiveSources,
  markSourceGood,
  markSourceStale,
} from "@server/db/repositories/eventSources";
import { PdgaShapeError } from "@server/ingestion/pdga/schema";
import { getStickyMatches, upsertMatch } from "@server/db/repositories/playerMatches";
import { listHolders } from "@server/db/repositories/tagHolders";
import { startRun, finishRun } from "@server/db/repositories/refreshRuns";
import { recompute } from "@server/readmodel";
import type { EventSourceCategory } from "@/lib";
import { getPdgaSource } from "@server/ingestion/pdga";
import { withSingleFlight, __resetSingleFlightForTests } from "@server/ingestion/single-flight";
import { normalize } from "@server/ingestion/normalize";
import { match, type MatchableHolder } from "@server/ingestion/match";
import { persistEvent } from "@server/ingestion/persist";
import type { RefreshTrigger } from "@server/db/schema";

export interface RunRefreshInput {
  trigger: RefreshTrigger;
  seasonYear: number;
}

interface PerSourceOutcome {
  pdgaEventId: string;
  type: string;
  status: "ok" | "failed";
  entrantsFetched: number;
  matched: number;
  unmatched: number;
  roundsPersisted: number;
  rawFile?: string;
  error?: string;
}

export interface RunRefreshSummary {
  /** `"completed"` when this call ran the pipeline; `"skipped"` when it
   * coalesced onto an already-in-flight run (the single-flight guard). */
  outcome: "completed" | "skipped";
  runId?: number;
  status?: "succeeded" | "failed";
  seasonYear: number;
  trigger: RefreshTrigger;
  sources: PerSourceOutcome[];
  publishedVersion?: number;
  error?: string | null;
}

/** Re-exported for tests — see `@server/ingestion/single-flight`. */
export { __resetSingleFlightForTests };

/**
 * The one pipeline function both "Refresh now" (sub-plan 08) and the
 * scheduler (sub-plan 07) call — identical code path, identical result for
 * a given DB state (Spec 03 "Acceptance criteria": "'Refresh now' produces
 * an identical result to the scheduled path").
 *
 * Steps (Spec 03 §3.7 / specs/12-Architecture.md §12.3):
 *   fetch (per active source) -> normalize -> cache raw -> match
 *     -> recompute (pure engine, via shared `recompute()`) -> atomic publish
 *
 * A single source throwing is caught, recorded as failed for THAT source
 * only, and does not stop the others (Spec 03 §3.8) — see the try/catch
 * inside the per-source loop below. The run itself is ALWAYS recorded in
 * `refresh_runs`: `startRun` happens before any source is touched, and
 * `finishRun` runs in a `finally` block so a thrown error (even one that
 * escapes the per-source isolation, e.g. `recompute` itself failing)
 * still lands a terminal row instead of leaving it stuck at `running`.
 */
export function runRefresh(input: RunRefreshInput): Promise<RunRefreshSummary> {
  return withSingleFlight("refresh", () => executeRefresh(input), {
    trigger: input.trigger,
    seasonYear: input.seasonYear,
  });
}

async function executeRefresh(input: RunRefreshInput): Promise<RunRefreshSummary> {
  const { trigger, seasonYear } = input;
  const runId = startRun({ seasonYear, trigger });
  const log = child({ job: "refresh", runId });
  log.info({ event: "refresh.start", trigger, seasonYear }, "refresh run starting");

  const sources: PerSourceOutcome[] = [];
  let runError: string | null = null;

  try {
    const activeSources = listActiveSources(seasonYear);
    const holders: MatchableHolder[] = listHolders(seasonYear).map((h) => ({
      id: h.id,
      name: h.name,
      pdgaNumber: h.pdgaNumber,
    }));
    const stickyMap = getStickyMatches(seasonYear);

    for (const source of activeSources) {
      // Isolation (Spec 03 §3.8): one source's failure must not abort the
      // others, so the fetch/normalize/cache/match sequence for EACH source
      // is wrapped in its own try/catch. Nothing here re-throws out of the
      // loop body.
      try {
        const pdgaSource = getPdgaSource();
        const payload = await pdgaSource.fetchEvent(source.pdgaEventId);
        const normalized = normalize(payload, source.type as EventSourceCategory);

        const rawFile = cacheRawPayload(seasonYear, source.pdgaEventId, payload);

        const entrants = normalized.rounds.flatMap((round) => round.entrants);
        const matchResult = match(entrants, holders, stickyMap);
        const roundsPersisted = persistEvent(seasonYear, source, normalized, matchResult);

        for (const link of matchResult.autoLinks) {
          upsertMatch({
            seasonYear,
            pdgaNumber: link.pdgaNumber,
            holderId: link.holderId,
            source: "auto",
            decidedBy: "auto",
          });
        }

        const entrantsFetched = entrants.length;

        markSourceGood(source.id);

        sources.push({
          pdgaEventId: source.pdgaEventId,
          type: source.type,
          status: "ok",
          entrantsFetched,
          matched: matchResult.matched.length,
          unmatched: matchResult.unmatched.length,
          roundsPersisted,
          rawFile,
        });
      } catch (err) {
        // Shape change = PDGA API contract drift — fail the whole run loudly
        // so we never publish garbage (sub-plan 02 / Spec 03 §3.8).
        if (err instanceof PdgaShapeError) {
          throw err;
        }

        markSourceStale(source.id);

        const message = err instanceof Error ? err.message : String(err);
        log.error(
          { event: "refresh.source_failed", pdgaEventId: source.pdgaEventId, error: message },
          "source failed — continuing with remaining sources",
        );
        sources.push({
          pdgaEventId: source.pdgaEventId,
          type: source.type,
          status: "failed",
          entrantsFetched: 0,
          matched: 0,
          unmatched: 0,
          roundsPersisted: 0,
          error: message,
        });
      }
    }

    const failedSources = sources.filter((s) => s.status === "failed");
    if (failedSources.length > 0) {
      runError = `${failedSources.length}/${sources.length} source(s) failed: ${failedSources
        .map((s) => s.pdgaEventId)
        .join(", ")}`;
    }

    // Recompute + atomic publish (sub-plan 05) runs regardless of per-source
    // failures above — the engine works off whatever is currently persisted
    // (unaffected by a source that failed to fetch this round), and
    // `publish` either commits a whole new version or rolls back entirely.
    const publishedVersion = await recompute(seasonYear);

    // No "partial" status exists in the `refresh_runs` schema (running |
    // succeeded | failed) — a run that published successfully is recorded
    // `succeeded` even if some sources failed; the per-source detail and
    // `runError` summary carry the partial-failure signal (surfaced in the
    // admin run log per Spec 03 §3.6).
    finishRun(runId, {
      status: "succeeded",
      perSource: sources,
      counts: { sourceCount: sources.length, failedCount: failedSources.length, publishedVersion },
      error: runError,
    });

    log.info(
      { event: "refresh.finish", status: "succeeded", publishedVersion, failedCount: failedSources.length },
      "refresh run finished",
    );

    return {
      outcome: "completed",
      runId,
      status: "succeeded",
      seasonYear,
      trigger,
      sources,
      publishedVersion,
      error: runError,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    finishRun(runId, {
      status: "failed",
      perSource: sources,
      counts: { sourceCount: sources.length },
      error: message,
    });
    log.error({ event: "refresh.finish", status: "failed", error: message }, "refresh run failed");

    return {
      outcome: "completed",
      runId,
      status: "failed",
      seasonYear,
      trigger,
      sources,
      error: message,
    };
  }
}

/**
 * Cache the raw PDGA payload to `config.rawDir` (Spec 03 §3.8 "Cache raw
 * PDGA responses per refresh for debugging and reprocessing without
 * re-fetching") — written even when the payload is empty (the stub's
 * always is) so the path is exercised end-to-end in the skeleton.
 *
 * Filename: `<seasonYear>-<pdgaEventId>-<timestamp>.json`, timestamp being
 * a filesystem-safe (colon-free) UTC ISO instant — unique per run per
 * source, sorts lexicographically by time, and is human-greppable.
 */
function cacheRawPayload(seasonYear: number, pdgaEventId: string, payload: unknown): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${seasonYear}-${pdgaEventId}-${timestamp}.json`;
  const filePath = path.join(config.rawDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}
