// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.7.
import "server-only";

import { config } from "@server/config";
import { fixtureSource } from "@server/ingestion/pdga/fixture-source";
import { liveSource } from "@server/ingestion/pdga/live-source";
import type { PdgaSource } from "@server/ingestion/pdga/source";
import { stubSource } from "@server/ingestion/pdga/stub-source";

export type {
  LiveApiEnvelope,
  LiveApiEventBody,
  LiveApiRoundBody,
  PdgaFetchOptions,
  PdgaSource,
  RawDivision,
  RawEventMeta,
  RawEventPayload,
  RawRound,
  RawScoreEntry,
} from "@server/ingestion/pdga/source";

let pdgaSourceOverride: PdgaSource | null = null;

/** Test-only hook — inject a custom source (e.g. throw on fetch). */
export function __setPdgaSourceForTests(source: PdgaSource | null): void {
  pdgaSourceOverride = source;
}

/**
 * Factory selecting which `PdgaSource` implementation the pipeline uses.
 * Controlled by `PDGA_SOURCE` (`stub` default | `live` | `fixture`).
 */
export function getPdgaSource(): PdgaSource {
  if (pdgaSourceOverride) {
    return pdgaSourceOverride;
  }
  switch (config.pdgaSource) {
    case "live":
      return liveSource;
    case "fixture":
      return fixtureSource;
    default:
      return stubSource;
  }
}
