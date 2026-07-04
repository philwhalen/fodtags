// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.7.
import "server-only";

import type { PdgaSource, RawEventPayload } from "@server/ingestion/pdga/source";

/**
 * Skeleton `PdgaSource`: no network access, no headers/backoff/Playwright —
 * just an immediately-resolved empty payload. This is what the walking
 * skeleton wires in via `getPdgaSource()` so `runRefresh` can be exercised
 * end-to-end (fetch → normalize → match → publish) without contacting PDGA.
 *
 * DEFERRED (specs/12-Architecture.md §12.7, §12.14; Spec 03 §3.1): the real
 * fetcher needs a server-side HTTP client with browser-like
 * `User-Agent`/`Accept`/`Referer` headers, polite rate limiting, retry/
 * backoff, and a Playwright headless-browser fallback for when header
 * spoofing alone still 403s. The exact 403-avoiding request signature is an
 * open implementation spike and is deliberately NOT solved here — do not
 * attempt it as part of the scaffold.
 */
export const stubSource: PdgaSource = {
  async fetchEvent(eventId: string): Promise<RawEventPayload> {
    return { pdgaEventId: eventId, entrants: [] };
  },
};
