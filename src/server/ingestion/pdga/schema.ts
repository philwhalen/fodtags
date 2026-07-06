// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.7.
import "server-only";

import { z } from "zod";

import type { LiveApiEventBody, LiveApiRoundBody } from "@server/ingestion/pdga/source";

const rawScoreEntrySchema = z
  .object({
    PDGANum: z.number().nullable(),
    HasPDGANum: z.number(),
    Name: z.string(),
    FirstName: z.string(),
    LastName: z.string(),
    // Nullable in real PDGA data: a player registered in a division but with
    // no score for this round (HasRoundScore !== 1 — e.g. absent / not yet
    // played) carries null here. `normalize.mapEntrant` already skips those
    // rows, so a null score is not an error and must not abort the source.
    RoundtoPar: z.number().nullable(),
    ToPar: z.number().nullable(),
    RoundRating: z.number().nullable(),
    Rating: z.number().nullable(),
    Completed: z.number(),
    HasRoundScore: z.number(),
    Round: z.number(),
    RunningPlace: z.number().nullable(),
    Tied: z.boolean(),
    WonPlayoff: z.string(),
    ProfileURL: z.string(),
    Rounds: z.string(),
    Division: z.string(),
  })
  .passthrough();

const rawDivisionSchema = z
  .object({
    DivisionID: z.number(),
    Division: z.string(),
    LatestRound: z.number(),
  })
  .passthrough();

const liveApiEventBodySchema = z
  .object({
    Divisions: z.array(rawDivisionSchema),
    HighestCompletedRound: z.number(),
    FinalRound: z.number(),
    EndDate: z.string(),
    DateRange: z.string(),
    StartDate: z.string(),
  })
  .passthrough();

const liveApiRoundBodySchema = z
  .object({
    scores: z.array(rawScoreEntrySchema),
  })
  .passthrough();

const envelopeSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    hash: z.string(),
  });

/** Zod schema for the `live_results_fetch_event` live-api envelope. */
export const fetchEventSchema = envelopeSchema(liveApiEventBodySchema);

/** Zod schema for the `live_results_fetch_round` live-api envelope. */
export const fetchRoundSchema = envelopeSchema(liveApiRoundBodySchema);

export class PdgaShapeError extends Error {
  readonly eventId: string;
  readonly endpoint: string;
  readonly zodIssues: z.ZodError["issues"];

  constructor(eventId: string, endpoint: string, cause: z.ZodError) {
    const flattened = z.flattenError(cause);
    const detail = JSON.stringify(flattened);
    super(`PDGA ${endpoint} shape mismatch for event ${eventId}: ${detail}`);
    this.name = "PdgaShapeError";
    this.eventId = eventId;
    this.endpoint = endpoint;
    this.zodIssues = cause.issues;
  }
}

export interface ParseEventContext {
  eventId: string;
  endpoint?: string;
}

export interface ParseRoundContext {
  eventId: string;
  division: string;
  round: number;
  endpoint?: string;
}

/**
 * Validate a `live_results_fetch_event` envelope; throw `PdgaShapeError` on mismatch.
 */
export function parseEvent(raw: unknown, ctx: ParseEventContext): LiveApiEventBody {
  const endpoint = ctx.endpoint ?? "live_results_fetch_event";
  const result = fetchEventSchema.safeParse(raw);
  if (!result.success) {
    throw new PdgaShapeError(ctx.eventId, endpoint, result.error);
  }
  return result.data.data as LiveApiEventBody;
}

/**
 * Validate a `live_results_fetch_round` envelope; throw `PdgaShapeError` on mismatch.
 */
export function parseRound(raw: unknown, ctx: ParseRoundContext): LiveApiRoundBody {
  const endpoint =
    ctx.endpoint ??
    `live_results_fetch_round (${ctx.division} R${ctx.round})`;
  const result = fetchRoundSchema.safeParse(raw);
  if (!result.success) {
    throw new PdgaShapeError(ctx.eventId, endpoint, result.error);
  }
  return result.data.data as LiveApiRoundBody;
}
