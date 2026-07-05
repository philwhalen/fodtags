// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.7.
import "server-only";

import type { PdgaSource, RawEventPayload } from "@server/ingestion/pdga/source";

const EMPTY_META: RawEventPayload["meta"] = {
  HighestCompletedRound: 0,
  FinalRound: 0,
  EndDate: "",
  DateRange: "",
  StartDate: "",
};

/**
 * Skeleton `PdgaSource`: no network access, no headers/backoff/Playwright —
 * just an immediately-resolved empty payload. This is what the walking
 * skeleton wires in via `getPdgaSource()` when `PDGA_SOURCE=stub` (default)
 * so `runRefresh` can be exercised end-to-end without contacting PDGA.
 */
export const stubSource: PdgaSource = {
  async fetchEvent(eventId: string): Promise<RawEventPayload> {
    return {
      pdgaEventId: eventId,
      meta: EMPTY_META,
      divisions: [],
      rounds: [],
    };
  },
};
