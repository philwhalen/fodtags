// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.3.
import "server-only";

import { config } from "@server/config";
import { child } from "@server/logging";
import { listHolders } from "@server/db/repositories/tagHolders";
import { upsertOfficialRating } from "@server/db/repositories/ratingsHistory";
import { startRun, finishRun } from "@server/db/repositories/refreshRuns";
import { recompute } from "@server/readmodel";
import type { RefreshTrigger } from "@server/db/schema";
import { getRatingsSource } from "@server/ingestion/pdga/ratings-source";
import { withSingleFlight } from "@server/ingestion/single-flight";

export interface RunRatingsRefreshInput {
  trigger: RefreshTrigger;
  seasonYear: number;
  /** Defaults to the 2nd Tuesday (ET) of the run's calendar month. */
  effectiveDate?: string;
}

export interface RunRatingsRefreshSummary {
  outcome: "completed" | "skipped";
  runId?: number;
  status?: "succeeded" | "failed";
  seasonYear: number;
  trigger: RefreshTrigger;
  effectiveDate?: string;
  holdersFetched?: number;
  holdersSucceeded?: number;
  holdersFailed?: number;
  publishedVersion?: number;
  error?: string | null;
}

interface HolderOutcome {
  holderId: number;
  pdgaNumber: number;
  status: "ok" | "failed";
  rating?: number;
  error?: string;
}

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Returns `YYYY-MM-DD` for the 2nd Tuesday of `month` in `timeZone`. */
export function secondTuesdayOfMonth(year: number, month: number, timeZone: string): string {
  for (let day = 1; day <= 14; day += 1) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const weekday = weekdayInTimezone(dateStr, timeZone);
    if (weekday === 2) {
      const firstTuesday = day;
      return `${year}-${String(month).padStart(2, "0")}-${String(firstTuesday + 7).padStart(2, "0")}`;
    }
  }
  throw new Error(`No second Tuesday found for ${year}-${String(month).padStart(2, "0")} in ${timeZone}`);
}

function weekdayInTimezone(dateStr: string, timeZone: string): number {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(new Date(`${dateStr}T12:00:00Z`));
  return WEEKDAY[short] ?? -1;
}

/** 2nd Tuesday (ET) of the calendar month containing `referenceDate`. */
export function secondTuesdayEffectiveDate(
  referenceDate: Date = new Date(),
  timeZone: string = config.APP_TIMEZONE,
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
  }).formatToParts(referenceDate);
  const year = Number.parseInt(parts.find((p) => p.type === "year")!.value, 10);
  const month = Number.parseInt(parts.find((p) => p.type === "month")!.value, 10);
  return secondTuesdayOfMonth(year, month, timeZone);
}

/**
 * Monthly official-ratings pull (Spec 03 §3.1): fetch each rostered holder's
 * PDGA profile rating, upsert `official=true` rows, recompute, publish.
 * Shares the same single-flight guard as `runRefresh`.
 */
export function runRatingsRefresh(input: RunRatingsRefreshInput): Promise<RunRatingsRefreshSummary> {
  return withSingleFlight("ratings-refresh", () => executeRatingsRefresh(input), {
    trigger: input.trigger,
    seasonYear: input.seasonYear,
  });
}

async function executeRatingsRefresh(input: RunRatingsRefreshInput): Promise<RunRatingsRefreshSummary> {
  const { trigger, seasonYear } = input;
  const effectiveDate = input.effectiveDate ?? secondTuesdayEffectiveDate();
  const runId = startRun({ seasonYear, trigger });
  const log = child({ job: "ratings-refresh", runId });
  log.info({ event: "ratings-refresh.start", trigger, seasonYear, effectiveDate }, "ratings refresh starting");

  const holders = listHolders(seasonYear).filter((h) => h.pdgaNumber != null);
  const source = getRatingsSource();
  const outcomes: HolderOutcome[] = [];
  let runError: string | null = null;

  try {
    for (const holder of holders) {
      const pdgaNumber = holder.pdgaNumber!;
      try {
        const fetched = await source.fetchPlayerRating(pdgaNumber);
        upsertOfficialRating({
          seasonYear,
          holderId: holder.id,
          effectiveDate,
          rating: fetched.rating,
        });
        outcomes.push({
          holderId: holder.id,
          pdgaNumber,
          status: "ok",
          rating: fetched.rating,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(
          { event: "ratings-refresh.holder_failed", holderId: holder.id, pdgaNumber, error: message },
          "holder ratings fetch failed — continuing with remaining holders",
        );
        outcomes.push({
          holderId: holder.id,
          pdgaNumber,
          status: "failed",
          error: message,
        });
      }
    }

    const failed = outcomes.filter((o) => o.status === "failed");
    if (failed.length > 0) {
      runError = `${failed.length}/${outcomes.length} holder(s) failed: ${failed
        .map((o) => String(o.pdgaNumber))
        .join(", ")}`;
    }

    const publishedVersion = await recompute(seasonYear);

    finishRun(runId, {
      status: "succeeded",
      perSource: outcomes,
      counts: {
        kind: "ratings",
        effectiveDate,
        holdersFetched: outcomes.length,
        holdersSucceeded: outcomes.length - failed.length,
        holdersFailed: failed.length,
        publishedVersion,
      },
      error: runError,
    });

    log.info(
      {
        event: "ratings-refresh.finish",
        status: "succeeded",
        publishedVersion,
        holdersFailed: failed.length,
      },
      "ratings refresh finished",
    );

    return {
      outcome: "completed",
      runId,
      status: "succeeded",
      seasonYear,
      trigger,
      effectiveDate,
      holdersFetched: outcomes.length,
      holdersSucceeded: outcomes.length - failed.length,
      holdersFailed: failed.length,
      publishedVersion,
      error: runError,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    finishRun(runId, {
      status: "failed",
      perSource: outcomes,
      counts: { kind: "ratings", effectiveDate, holdersFetched: outcomes.length },
      error: message,
    });
    log.error({ event: "ratings-refresh.finish", status: "failed", error: message }, "ratings refresh failed");

    return {
      outcome: "completed",
      runId,
      status: "failed",
      seasonYear,
      trigger,
      effectiveDate,
      holdersFetched: outcomes.length,
      holdersSucceeded: outcomes.filter((o) => o.status === "ok").length,
      holdersFailed: outcomes.filter((o) => o.status === "failed").length,
      error: message,
    };
  }
}
