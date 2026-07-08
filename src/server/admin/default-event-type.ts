// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import type { EventSourceType } from "@server/db/schema";

// Sub-league slots, filled earliest-first. TOURNAMENT is the terminal default;
// FOD_OPEN is intentionally absent — it is never auto-selected (Spec 10 §10.3).
const SUB_LEAGUE_ORDER = ["EARLY", "MID", "LATE"] as const;

/**
 * The `type` the admin Register-source form defaults to (Spec 10 §10.3): the
 * earliest sub-league slot with no source yet this Season, else TOURNAMENT.
 *
 * `existing` should include inactive sources — a registered slot stays filled
 * even if that source is later deactivated (spec: "any source of that type
 * exists"). The default is advisory and fully overridable; it never gates
 * submission and never selects FOD_OPEN.
 */
export function defaultEventSourceType(
  existing: readonly EventSourceType[],
): EventSourceType {
  const present = new Set(existing);
  for (const type of SUB_LEAGUE_ORDER) {
    if (!present.has(type)) return type;
  }
  return "TOURNAMENT";
}
