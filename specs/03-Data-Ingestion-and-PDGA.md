# 03 — Data Ingestion & PDGA Integration

← [Master Spec](./00-Master-Spec.md)

## Purpose

Define how raw round data gets from PDGA Live into the app, how PDGA entrants are reconciled with tag holders, and how fresh the data is. This spec feeds the computation engine in [Spec 02](./02-Domain-Model-and-Scoring.md); everything downstream depends on it.

## 3.1 Known constraint: PDGA blocks naive clients and has no open API

- **No official API at launch.** The PDGA REST API developer program is **closed** (targeting a reopen in early 2026), so there is no supported programmatic feed. Ingestion targets the **PDGA Live pages / undocumented `live-api`**.
- **Bot protection.** Both the Live pages and the `live-api` JSON endpoints returned **HTTP 403** to non-browser fetchers during analysis. **Requirement:** ingestion must use a **server-side fetch with browser-like headers** (realistic `User-Agent`, `Accept`, `Referer`), respectful rate limiting, and retry/backoff. A **headless-browser fallback** should be built in if header spoofing proves insufficient. All PDGA access is **server-side only** — never from the client.
- **Ratings cadence.** Unofficial per-round ratings appear on PDGA Live as soon as 2+ propagators play, so they're available at the Thursday-night refresh — but they are **unofficial**. Official **player** ratings publish **monthly, the 2nd Tuesday**. The app therefore runs an additional **monthly official-rating pull** (aligned to the 2nd-Tuesday update) to refresh the ratings used for eligibility and OLP ([Spec 02 §2.2](./02-Domain-Model-and-Scoring.md#22-pools--eligibility)). This monthly pull is a **distinct fetch** — the player rating pages, not the per-event `live-api` — and writes **official** ratings (stored `official = true`) that supersede the unofficial per-round ratings for eligibility gating and the OLP rating component. The UI keeps showing the unofficial per-round rating, labeled **unofficial**, until an official update supersedes it.

## 3.2 Data the app pulls from PDGA (per configured event)

For each registered PDGA event (a sub-league, a tournament, or the FOD Open), per division and round:
- Player display name and **PDGA number**.
- Per-round **score to par** and total.
- Per-round **round rating** and the player's **current player rating**.
- Round completion status / whether a round is final.

**One PDGA round = one League Night.** Within a sub-league's event, each ingested round is attributed to a single League Night — the source of the "best 15 League Nights" count ([Spec 02 §2.5](./02-Domain-Model-and-Scoring.md#25-top-n-counts-aggregation)). Ingestion must **verify** this mapping holds for the live event shape and fail loudly in the run log if a round can't be attributed to a night.

The app stores a normalized, versioned copy so views never depend on a live PDGA call. Per-round ratings ingested here are stored **unofficial** (`official = false`); the monthly pull (§3.1) writes the superseding **official** rows.

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
  startDate          // sub-leagues: admin-configured window start (ET)
  endDate            // sub-leagues: admin-configured window end / OLP "last day" (ET)
  complete           // sub-leagues: admin flag — finalizes Podium + OLP payouts
}
```

`startDate`/`endDate`/`complete` apply to **sub-league** sources (Early/Mid/Late): they drive current-sub-league selection ([Spec 04 §4.3](./04-Feature-Leaderboards.md#43-sub-league-leaderboard-content)) and OLP finalization ([Spec 06 §6.4](./06-Feature-OLP-Pot.md#64-freshness--correctness)). The **League Podium is not registered as a source** — it is computed from sub-league standings ([Spec 02 §2.4.1](./02-Domain-Model-and-Scoring.md#241-league-podium--computed-bonus)).

The sub-league structure (3 separate PDGA events) is a launch decision ([Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution)). The app must handle **multiple events per Season** and correctly attribute each round to its sub-league/tournament.

**Pool ≠ PDGA division.** Pool (A / B) is a league overlay stored on the roster, not a PDGA division. The scraper reads whatever PDGA division(s) the event uses; pool assignment is applied from admin data during player matching.

## 3.5 Player matching ("Admin maps, app assists")

Only tag holders score, so every PDGA entrant must be resolved to a tag holder or explicitly ignored.

1. **Auto-match, in priority order:**
   - **Exact PDGA number** → the holder carrying that PDGA number. The PDGA number is the source of truth: a number hit auto-links **even if the display name differs** (players change how their name renders on PDGA).
   - **Unique normalized name** (only when there is no PDGA-number hit): if the entrant's normalized name matches **exactly one** holder, auto-link.
2. **Confidence policy.** The two cases above are the *only* auto-links. Everything else is routed to the **admin review queue** — specifically a normalized name matching **zero** holders (unmatched) or **two or more** holders (ambiguous). The app never silently guesses a holder.
3. The review queue lives in the admin console (see [Spec 10 §10.4](./10-Admin-Console.md#104-player-matching-review-queue)); each pending entrant is resolved by **link / create / mark-as-non-holder**.
4. **Sticky decisions.** Every resolution — an auto-link, or an admin **link / create / mark-as-non-holder** — is recorded keyed by **PDGA number** and persists across refreshes: resolved entrants are never re-queued and auto-links are not re-evaluated each run.
5. Non-tag-holders remain in the data as a **minimal record** (PDGA number + name) — needed for raw finish order / round context — but are **excluded from points**.

**Name normalization** (for the unique-name auto-match and the queue's suggestions): lowercased, trimmed, internal whitespace collapsed, punctuation and diacritics stripped. Nickname/alias resolution beyond this is out of scope — those simply fall to the review queue and, once linked, stick.

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
