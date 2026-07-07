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
import { listHolders, insertHolder, updateHolder } from "@server/db/repositories/tagHolders";
import { earliestAttributedRound } from "@server/db/repositories/eventResults";
import { recordAudit } from "@server/db/repositories/auditLog";
import { startRun, finishRun } from "@server/db/repositories/refreshRuns";
import { recompute } from "@server/readmodel";
import type { EventSourceCategory } from "@/lib";
import { getPdgaSource } from "@server/ingestion/pdga";
import { withSingleFlight, __resetSingleFlightForTests } from "@server/ingestion/single-flight";
import { normalize, type NormalizedEventResult } from "@server/ingestion/normalize";
import { match, type MatchableHolder, type MatchResult, type StickyMatch } from "@server/ingestion/match";
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
  autoAdded: number;
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
  autoAdded?: number;
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

    // Holders auto-added during THIS run — their entry dates get reconciled
    // after the source loop (see below), once every source's rounds are
    // attributed.
    const autoAddedHolderIds = new Set<number>();

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

        // Auto-add (Spec 03 §3.5/§3.6): turn each brand-new PDGA# entrant
        // into a provisional tag holder BEFORE persisting, so persistEvent
        // attributes their rounds to the new holderId. Mutates matchResult
        // (moves autoAdds into matched), holders, and stickyMap in place —
        // the in-run injection into holders/stickyMap is what stops a
        // second source in this same run from creating a duplicate holder
        // for the same player (Spec 03 §3.5 "auto-add").
        const createdHolderIds = createProvisionalHolders(seasonYear, normalized, matchResult, holders, stickyMap);
        for (const id of createdHolderIds) autoAddedHolderIds.add(id);
        const autoAdded = createdHolderIds.length;

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
          autoAdded,
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
          autoAdded: 0,
          roundsPersisted: 0,
          error: message,
        });
      }
    }

    // Back-date each holder auto-added this run to their TRUE first ingested
    // round. A player who plays multiple sub-leagues has their provisional
    // holder created while processing the FIRST source, seeded with that
    // source's earliest round — but an earlier sub-league (a later source in
    // this loop) may hold their real first round. Without this, sub-league
    // eligibility (entry_date <= round date) silently drops those earlier
    // rounds (Spec 03 §3.5 "entry date = first ingested round"). Scoped to
    // holders auto-added THIS run, so a re-run never clobbers a director's
    // later manual entry-date correction (they're no longer auto-added).
    for (const holderId of autoAddedHolderIds) {
      const earliest = earliestAttributedRound(seasonYear, holderId);
      if (earliest) {
        updateHolder(holderId, {
          entryDate: earliest.eventDate,
          ratingAtEntry: earliest.playerRatingReported,
        });
      }
    }

    const failedSources = sources.filter((s) => s.status === "failed");
    if (failedSources.length > 0) {
      runError = `${failedSources.length}/${sources.length} source(s) failed: ${failedSources
        .map((s) => s.pdgaEventId)
        .join(", ")}`;
    }

    const totalAutoAdded = sources.reduce((sum, s) => sum + s.autoAdded, 0);

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
      counts: {
        sourceCount: sources.length,
        failedCount: failedSources.length,
        autoAdded: totalAutoAdded,
        publishedVersion,
      },
      error: runError,
    });

    log.info(
      {
        event: "refresh.finish",
        status: "succeeded",
        publishedVersion,
        failedCount: failedSources.length,
        autoAdded: totalAutoAdded,
      },
      "refresh run finished",
    );

    return {
      outcome: "completed",
      runId,
      status: "succeeded",
      seasonYear,
      trigger,
      sources,
      autoAdded: totalAutoAdded,
      publishedVersion,
      error: runError,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const totalAutoAdded = sources.reduce((sum, s) => sum + s.autoAdded, 0);
    finishRun(runId, {
      status: "failed",
      perSource: sources,
      counts: { sourceCount: sources.length, autoAdded: totalAutoAdded },
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
      autoAdded: totalAutoAdded,
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

/**
 * Turn each brand-new PDGA# entrant (`match()`'s `autoAdds` bucket — a PDGA#
 * that hit zero holders by number AND by name) into a provisional tag
 * holder (Spec 03 §3.5/§3.6). This is the one place provisional-holder
 * CREATION happens — `match()` only classifies; the engine never creates.
 *
 * Mutates its inputs in place (the ingestion pipeline's one impure seam):
 *  - `matchResult.matched` gains one entry per attributed entrant object so
 *    `persistEvent` writes the new holderId (persist keys by entrant object
 *    identity, not PDGA#).
 *  - `holders` and `stickyMap` gain the new holder/decision so a LATER
 *    source in the SAME run auto-links this PDGA# (an ordinary PDGA# hit)
 *    instead of creating a second holder for the same real player — the
 *    cross-source-single-run duplicate hazard this feature exists to avoid.
 *
 * Returns the holder IDs of the provisional holders created for this source
 * (the caller counts them for run reporting and reconciles their entry dates
 * after all sources are processed).
 */
function createProvisionalHolders(
  seasonYear: number,
  normalized: NormalizedEventResult,
  matchResult: MatchResult,
  holders: MatchableHolder[],
  stickyMap: Map<number, StickyMatch>,
): number[] {
  // Dedupe by PDGA# — the same brand-new entrant appears once per round it
  // played, so `autoAdds` holds one candidate per (round, entrant).
  const byPdgaNumber = new Map<number, typeof matchResult.autoAdds>();
  for (const candidate of matchResult.autoAdds) {
    const existing = byPdgaNumber.get(candidate.pdgaNumber);
    if (existing) {
      existing.push(candidate);
    } else {
      byPdgaNumber.set(candidate.pdgaNumber, [candidate]);
    }
  }

  const createdHolderIds: number[] = [];

  for (const [pdgaNumber, candidates] of byPdgaNumber) {
    // Defensive re-run safety: `match()` shouldn't emit a candidate already
    // resolved (sticky or an existing holder), but a second source in this
    // same run reaches this point via the in-run injection below — this
    // guard is what makes that injection actually prevent a duplicate.
    if (holders.some((h) => h.pdgaNumber === pdgaNumber) || stickyMap.has(pdgaNumber)) {
      continue;
    }

    // Entry date = earliest round.eventDate (across THIS source's rounds)
    // where the PDGA# appears — iterate `normalized.rounds`, not the
    // flattened candidates, to read the round's date. Rating seed comes
    // from that same earliest appearance. (A player who also appears in an
    // earlier sub-league processed LATER this run gets their entry date
    // back-dated by the post-loop reconciliation in `executeRefresh`.)
    let entryDate: string | null = null;
    let ratingAtEntry: number | null = null;
    for (const round of normalized.rounds) {
      const appearance = round.entrants.find((e) => e.pdgaNumber === pdgaNumber);
      if (!appearance) continue;
      if (entryDate === null || round.eventDate < entryDate) {
        entryDate = round.eventDate;
        ratingAtEntry = appearance.playerRatingReported;
      }
    }

    const displayName = candidates[0]!.entrant.displayName;
    // `entryDate` is guaranteed set here: `candidates` is non-empty (it's a
    // `byPdgaNumber` bucket), and every candidate's entrant is one of
    // `normalized.rounds[].entrants`, so the loop above finds at least one
    // appearance.
    const resolvedEntryDate = entryDate!;

    const holderId = insertHolder({
      seasonYear,
      name: displayName,
      tagNumber: null,
      pool: "A",
      entryDate: resolvedEntryDate,
      pdgaNumber,
      ratingAtEntry,
      pdgaMembership: true,
      confirmed: false,
    });

    for (const candidate of candidates) {
      matchResult.matched.push({ holderId, entrant: candidate.entrant });
    }

    upsertMatch({
      seasonYear,
      pdgaNumber,
      holderId,
      source: "auto",
      decidedBy: "auto",
    });

    recordAudit({
      seasonYear,
      actorEmail: "system",
      action: "auto_add",
      entityType: "tag_holder",
      entityId: String(holderId),
      after: {
        name: displayName,
        pdgaNumber,
        pool: "A",
        tagNumber: null,
        confirmed: false,
        entryDate: resolvedEntryDate,
        ratingAtEntry,
        pdgaMembership: true,
      },
    });

    // The duplicate-across-sources fix (Spec 03 §3.5): inject into the
    // SAME `holders`/`stickyMap` the rest of this run's sources read, so a
    // player appearing in a second source tonight auto-links instead of
    // triggering a second auto-add.
    holders.push({ id: holderId, name: displayName, pdgaNumber });
    stickyMap.set(pdgaNumber, { holderId, source: "auto" });

    createdHolderIds.push(holderId);
  }

  return createdHolderIds;
}
