// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.7.
import "server-only";

import type { PdgaSource } from "@server/ingestion/pdga/source";
import { stubSource } from "@server/ingestion/pdga/stub-source";

export type { PdgaFetchOptions, PdgaSource, RawEventPayload } from "@server/ingestion/pdga/source";

/**
 * Factory selecting which `PdgaSource` implementation the pipeline uses.
 * Always returns the stub today. Structured so a later real implementation
 * (specs/12-Architecture.md §12.7, deferred per §12.14) can be swapped in
 * behind an env flag without touching `pipeline.ts` — e.g.:
 *
 * ```ts
 * return process.env.PDGA_SOURCE === "live" ? liveSource : stubSource;
 * ```
 *
 * That flag isn't added to `src/server/config` yet because there is nothing
 * for it to select besides the stub; add it alongside the real fetcher.
 */
export function getPdgaSource(): PdgaSource {
  return stubSource;
}
