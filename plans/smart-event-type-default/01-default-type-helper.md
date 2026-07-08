# 01 — Pure default helper + unit tests

## Goal

A pure function that, given the `type`s of a season's existing event sources, returns the
`type` the Register-source form should pre-select.

## File

`src/server/admin/default-event-type.ts` (new) — co-located with `context.ts`.

```ts
import "server-only";
import type { EventSourceType } from "@server/db/schema";

// Sub-league slots, filled earliest-first. Tournament is the terminal default;
// FOD_OPEN is intentionally absent — it is never auto-selected.
const SUB_LEAGUE_ORDER = ["EARLY", "MID", "LATE"] as const;

/**
 * The `type` the admin Register-source form defaults to (Spec 10 §10.3): the
 * earliest sub-league slot with no source yet this season, else TOURNAMENT.
 * `existing` should include inactive sources — a registered slot stays filled
 * even if that source is later deactivated.
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
```

Note: `import "server-only"` is fine here (the helper is consumed only by the server
page). The `EventSourceType` import is **type-only** (erased), so no runtime coupling.

## Tests

`src/server/admin/default-event-type.test.ts`:

| existing types | expected |
|----------------|----------|
| `[]` | `EARLY` |
| `["EARLY"]` | `MID` |
| `["EARLY","MID"]` | `LATE` |
| `["EARLY","MID","LATE"]` | `TOURNAMENT` |
| `["MID"]` | `EARLY` (order, not count) |
| `["MID","LATE"]` | `EARLY` |
| `["EARLY","MID","LATE","TOURNAMENT"]` | `TOURNAMENT` |
| `["EARLY","EARLY","MID"]` (dupes) | `LATE` |
| `["FOD_OPEN"]` | `EARLY` (FOD_OPEN doesn't fill a sub-league slot) |
| `["EARLY","MID","LATE","FOD_OPEN"]` | `TOURNAMENT` (FOD_OPEN never returned) |

## Done when

`npm run test` passes the new file; `npm run typecheck` clean.
