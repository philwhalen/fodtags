# 03 — Data Ingestion & PDGA Integration

← [Master Spec](./00-Master-Spec.md)

## Purpose

Define how raw round data gets from PDGA Live into the app, how PDGA entrants are reconciled with tag holders, and how fresh the data is. This spec feeds the computation engine in [Spec 02](./02-Domain-Model-and-Scoring.md); everything downstream depends on it.

## 3.1 Known constraint: PDGA blocks naive clients and has no open API

- **No official API at launch.** The PDGA REST API developer program is **closed** (targeting a reopen in early 2026), so there is no supported programmatic feed. Ingestion targets the **PDGA Live pages / undocumented `live-api`**.
- **Bot protection.** Both the Live pages and the `live-api` JSON endpoints returned **HTTP 403** to non-browser fetchers during analysis. **Requirement:** ingestion must use a **server-side fetch with browser-like headers** (realistic `User-Agent`, `Accept`, `Referer`), respectful rate limiting, and retry/backoff. A **headless-browser fallback** should be built in if header spoofing proves insufficient. All PDGA access is **server-side only** — never from the client.
- **Ratings cadence.** Unofficial per-round ratings appear on PDGA Live as soon as 2+ propagators play, so they're available at the Thursday-night refresh — but they are **unofficial**. Official **player** ratings publish **monthly, the 2nd Tuesday**. The app therefore runs an additional **monthly official-rating pull** (aligned to the 2nd-Tuesday update) to refresh the ratings used for eligibility and OLP ([Spec 02 §2.2](./02-Domain-Model-and-Scoring.md#22-pools--eligibility)). Round ratings shown in the UI are labeled **unofficial** until an official update supersedes them.

## 3.2 Data the app pulls from PDGA (per configured event)

For each registered PDGA event (a sub-league, a tournament, or the FOD Open), per division and round:
- Player display name and **PDGA number**.
- Per-round **score to par** and total.
- Per-round **round rating** and the player's **current player rating**.
- Round completion status / whether a round is final.

The app stores a normalized, versioned copy so views never depend on a live PDGA call.

## 3.3 Data the app does NOT get from PDGA (admin-supplied)

See [Spec 10 — Admin Console](./10-Admin-Console.md). Summary:
- Tag roster, **tag numbers**, pool assignment, entry dates, PDGA# ↔ holder mapping.
- Which PDGA event IDs belong to the Season and their **type** (Early/Mid/Late sub-league, Tournament, FOD Open).
- Financial inputs & pot balances ([Spec 09](./09-Financials.md)).
- Manual adjustments: cancellations, tag-not-present flags, pool switches, overrides ([Spec 02](./02-Domain-Model-and-Scoring.md)).

## 3.4 Event registration model

Each Season is configured with a set of **PDGA event sources**:

```
EventSource {
  pdgaEventId        // e.g. 104527
  type               // EARLY | MID | LATE | TOURNAMENT | FOD_OPEN
  divisions[]        // which PDGA divisions to ingest
  active             // include in current refreshes?
  label              // human name
}
```

The sub-league structure (3 separate PDGA events) is a launch decision ([Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution)). The app must handle **multiple events per Season** and correctly attribute each round to its sub-league/tournament.

**Pool ≠ PDGA division.** Pool (A / B) is a league overlay stored on the roster, not a PDGA division. The scraper reads whatever PDGA division(s) the event uses; pool assignment is applied from admin data during player matching.

## 3.5 Player matching ("Admin maps, app assists")

Only tag holders score, so every PDGA entrant must be resolved to a tag holder or explicitly ignored.

1. **Auto-match** PDGA entrants to holders by **PDGA number** first, then by normalized name.
2. Confident matches are applied automatically.
3. Anything ambiguous or unmatched is placed in an **admin review queue** (see [Spec 10](./10-Admin-Console.md)) — the app never silently guesses a holder.
4. Matches are **sticky**: once an admin confirms `PDGA# → holder`, it persists across refreshes.
5. Non-tag-holders remain in the data (needed to compute raw finish order / round context) but are **excluded from points**.

**Requirement:** the public UI must never attribute points to a wrongly matched or unmatched player; unresolved matches surface as a data-quality banner rather than a bad number.

## 3.6 Refresh cadence

- **Scheduled refresh: every Thursday at 9:00 PM ET** (after League Night play), pulling all active event sources.
- **Admin "Refresh now"** button for on-demand pulls (corrections, mid-week rating updates, tournaments/FOD Open).
- **No near-live in-round updates** at launch.
- Each refresh is a **run**: records start/end time, per-source success/failure, counts, and any new unmatched players. Runs are visible in the admin console.
- Timestamps everywhere are stored in UTC and displayed in **ET** (league-local).

## 3.7 Ingestion pipeline

```
Fetch (per source) → Normalize → Match players → Persist snapshot
      → Recompute derived results (Spec 02) → Publish
```

- **Idempotent:** re-running a refresh yields the same stored state (no dupes).
- **Atomic publish:** the public site reads the last fully computed snapshot; a partially failed refresh does not corrupt live views.
- **Auditable:** each published number can be traced to a source event, round, and refresh run.

## 3.8 Resilience & failure handling

- If a source 403s / times out: keep last good snapshot, mark that source **stale**, and show a per-view freshness/stale indicator. Alert the admin.
- If PDGA changes its response shape: fail loudly in the admin run log; never publish garbage.
- Rate-limit and space out requests to avoid hammering PDGA.
- Cache raw PDGA responses per refresh for debugging and reprocessing without re-fetching.

## Acceptance criteria

- A scheduled Thursday 9 PM ET run pulls all active sources, matches players, recomputes, and publishes atomically.
- "Refresh now" produces an identical result to the scheduled path.
- A single source failing leaves other sources' data intact and flags the failure.
- A newly appearing PDGA entrant with no confident match lands in the admin review queue and is excluded from points until resolved.
- Every public number is traceable to `(eventSource, round, refreshRun)`.

← Prev: [02 — Domain Model](./02-Domain-Model-and-Scoring.md) · Next: [04 — Leaderboards](./04-Feature-Leaderboards.md)
