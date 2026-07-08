# Smart Event-Type Default — Master Plan

Pre-select the most-likely-correct `type` in the admin **Register source** form so a
director doesn't silently mis-file a sub-league event (the 102021 bug: registering the
Early league as a `Tournament` attributes none of its rounds to the Early sub-league and
leaves that leaderboard empty). The default is the **earliest unfilled sub-league slot**
(Early → Mid → Late), then **Tournament** once all three exist; **FOD Open is never
auto-selected**. Advisory only — fully overridable.

**Spec basis:** [Spec 10 §10.3](../../specs/10-Admin-Console.md#103-pdga-event-configuration)
(smart `type` default bullet), model in
[Spec 03 §3.4](../../specs/03-Data-Ingestion-and-PDGA.md#34-event-registration-model).

## Decisions (from spec stage + architecture)

- **"Filled slot" = any source of that type exists this season, active *or* inactive**
  (per spec-stage answer). A deactivated Early source still fills the Early slot. The call
  site therefore feeds **all** season sources (`listSources`, not `listActiveSources`).
- **Default order:** first of `[EARLY, MID, LATE]` with no existing source → that type;
  else `TOURNAMENT`. **`FOD_OPEN` is never returned** — always a manual pick.
- **Pure helper, unit-tested.** Logic lives in `src/server/admin/default-event-type.ts`
  (next to `context.ts`, which already supplies `SEASON_YEAR` to the same page) as a pure
  `defaultEventSourceType(existingTypes)` — plain input → output, no I/O. Unit-tested under
  the repo's `react-server` vitest condition, like other `src/server/*` tests. `EventSourceType`
  is a **type-only** import from `@server/db/schema` (erased at compile; the runtime order
  literals live in the helper).
- **Server computes, client renders.** `app/admin/events/page.tsx` already fetches
  `listSources(SEASON_YEAR)`; it computes the default from that list and passes it as a
  `defaultType` prop to `RegisterSourceForm`. The client form just uses it as the
  `<select>`'s `defaultValue`. No new data fetch.
- **Default advances after each registration.** An uncontrolled `<select defaultValue>`
  only picks up a new default on **mount**; `router.refresh()` alone re-renders the server
  data but keeps the client form mounted, so the dropdown would stay stale. Fix: **remount
  the form when the source set changes** by keying it — `<RegisterSourceForm key={sources.length} …>`
  (count increments on every successful registration). This also clears the label/PDGA-id
  fields for the next entry — desirable.
- **No new validation / no blocking.** The default is advisory; registering a second Early
  (or any override) is still allowed (spec: "fully overridable"). This feature adds a
  default only — it does not gate submission.

## Checklist

- [x] **01 — Pure default helper + unit tests** ([01-default-type-helper.md](./01-default-type-helper.md))
  - `defaultEventSourceType(existingTypes: readonly EventSourceType[]): EventSourceType`.
  - Vitest cases: empty→EARLY; {EARLY}→MID; {EARLY,MID}→LATE; {EARLY,MID,LATE}→TOURNAMENT;
    {MID}→EARLY (order, not presence-count); dupes tolerated; FOD_OPEN present is ignored /
    never returned; a set already including TOURNAMENT still →TOURNAMENT once sub-leagues full.
    **10/10 passing.**
- [x] **02 — Wire form default + remount** ([02-form-wiring.md](./02-form-wiring.md))
  - `page.tsx`: `const defaultType = defaultEventSourceType(sources.map((s) => s.type))`;
    pass `defaultType` + `key={sources.length}` to `RegisterSourceForm`.
  - `event-forms.tsx`: accept `defaultType: string` prop; `<select defaultValue={defaultType}>`.
- [x] **Verify:** `typecheck` + `lint` clean; **414 tests pass** (1 skipped); `next build` green.
  Live drive against the running dev DB (types `["MID","EARLY"]`) via the exact page code path
  (`defaultEventSourceType(listSources(2026).map(s=>s.type))`) → **LATE** ✓. Other slot states
  (empty→EARLY, all-three→TOURNAMENT, FOD_OPEN ignored) covered by the unit tests.

## Interaction / regression watch

- **Registration action unchanged** (`registerSourceAction` / `registerEventSource`): the
  form still posts whatever `type` is selected. Default is purely the initial value.
- **The data fix is separate.** Source 2 (102021) was already corrected TOURNAMENT→EARLY
  out of band; this feature does not touch existing rows, only new-registration defaults.
- **`SourceRow` edit form is out of scope** — it edits label/dates/active, not `type`
  (type is immutable post-registration in the current UI). No change there.
- Helper stays `import "server-only"`-free of runtime `@server` value imports (type-only),
  so no client-bundle leakage risk if it were ever imported elsewhere.

## Token / cost accounting

Cost basis: **Opus 4.8 orchestrator, implemented inline** (no sub-agents authorized).
Fill in as chunks complete.

| Chunk | Model | Input tok | Cache read | Output tok | Notes |
|-------|-------|-----------|-----------|------------|-------|
| 01 — default helper | Opus 4.8 | n/i | n/i | n/i | pure fn + unit tests |
| 02 — form wiring | Opus 4.8 | n/i | n/i | n/i | page prop + select default + remount key |
| Verify + fixes | Opus 4.8 | n/i | n/i | n/i | full gate + live LATE-default drive |
| **Total** | Opus 4.8 | n/i | n/i | n/i | single Opus session, inline |

`n/i` = not separately instrumented (per-chunk token telemetry not exposed to the run).

## Progress notes

- Implemented inline in one Opus 4.8 session, chunks 01→02, no deviations from plan.
- Helper placed at `src/server/admin/default-event-type.ts` with `import "server-only"` +
  type-only `EventSourceType` import (erased); consumed only by the server page.
- Live verification could not go through the browser via `curl` (dev auth bypass needs a
  session cookie; a raw request lands on the Auth.js sign-in page). Rather than script the
  credentials-CSRF flow, verified the substantive dynamic behavior directly against the live
  DB through the identical code path — returned `LATE` for the current `["MID","EARLY"]`
  sources. The `<select defaultValue>` binding is a trivial React render of that value.
- Client form typed `defaultType: string` (not `EventSourceType`) to avoid importing a
  server schema type into a `"use client"` module; the value is always a valid option.
- Unrelated: the data correction for source 2 (102021 → EARLY) still needs a "Refresh now"
  to surface Early standings — independent of this feature.
