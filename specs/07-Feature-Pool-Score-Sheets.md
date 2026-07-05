# 07 — Feature: Pool Score Sheets (Core Feature 4)

← [Master Spec](./00-Master-Spec.md)

## Purpose

> Core Spec Feature 4: "It shows the score sheet for each pool."

Per [Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution): the score sheet is the **season points breakdown per pool** — the "show your work" view that explains how each Championship total was assembled. Where the leaderboard ([Spec 04](./04-Feature-Leaderboards.md)) shows *rank + total*, the score sheet shows *how the total was reached*.

**Data source (read-only projection).** Like Rounds & Ratings ([Spec 05](./05-Feature-Rounds-and-Ratings.md)) and the OLP Pot ([Spec 06](./06-Feature-OLP-Pot.md)), this feature adds **no new computation**: the engine already emits, per holder, a `scoreSheet` entry with `byType` totals, `countedLineItems`, `droppedLineItems` (each dropped item tagged `cap` or `forfeited`), and a `total` ([Spec 02 §2.5](./02-Domain-Model-and-Scoring.md#25-top-n-counts-aggregation)). The read model **enriches** that output with holder names/tag numbers, human event labels (from the stored events), the pool's Championship ordering, and the active caps — the engine stays untouched.

## User stories

- As a tag holder, I can see, for my pool, **each player's points itemized by event type**, ordered exactly as the leaderboard ranks them.
- As a tag holder, I can expand any player to see **every result that fed their total**, and see **which results counted** and which were **dropped** by the top-N caps ([Spec 02 §2.5](./02-Domain-Model-and-Scoring.md#25-top-n-counts-aggregation)).
- As a tag holder in a sub-league that's still running, I can see my **projected Podium** placement clearly marked as not-yet-final, so the sheet foreshadows the bonus without misstating my current total.
- As a viewer, I can see the **tag numbers** used to break ties, and find a player fast with a **name filter**.
- As a director, I can point a player at a **deep link to their row** to answer "why is my total X?"

## 7.1 Layout

One score sheet **per pool** (A / B), selected by a pool toggle (Pool A default) that mirrors the leaderboard's pool control. The page is **mobile-first with two-level disclosure**:

**Level 1 — the per-pool summary table.** One collapsed row per holder in the pool, in **Championship order** (see [§7.2](#72-roster-ordering-and-pool-membership)):

| Rank | Player | Tag # | League Night (best 15) | Podium | Tournament (best N) | FOD Open | **Total** |

- **Rank / order / Total** come from that pool's Championship standing, so the score sheet lines up 1:1 with the leaderboard.
- The per-type columns show each holder's **counted** points for that event type (`byType`). The header states the active cap for that column ([§7.3](#73-explainability-requirements)); the Tournament cap is dynamic (best 2 or best 3).
- **Podium** shows **finalized** Podium points only. Any **projected** (not-yet-final) Podium bonus is **not** added here; it surfaces in the expanded detail, flagged (see below), consistent with how the leaderboard withholds the projected bonus from the displayed total ([Spec 04 §4.3](./04-Feature-Leaderboards.md#43-sub-league-leaderboard-content)).

**Level 2 — per-player line-item detail (expand a row).** For the selected holder, the results that make up each column, grouped by event type:

- **League Nights** — every counted result: **event label + date**, sub-league, finish position, points. Counted items show by default; items dropped by the best-15 cap collapse behind a **"show all"** expander ([§7.3](#73-explainability-requirements)).
- **League Podium** — the holder's Podium result per sub-league. A **finalized** Podium (its sub-league marked complete) is a counted line. A **projected** Podium (sub-league still in progress, holder currently top-3 in their pool) shows as a **de-emphasized, not-counted line labeled "projected — not final,"** with its provisional points; it is excluded from the Total.
- **Tournaments** — each result with the best-2/best-3 cap applied (counted vs dropped marked).
- **FOD Open** — the single result.

**Line-item labels.** Each line is identified by its **stored event label plus date** (e.g. a tournament's name; a League Night's label with its round ordinal) — the same labels the Rounds & Ratings view uses ([Spec 05](./05-Feature-Rounds-and-Ratings.md)) — not a bare "sub-league + date," so tournaments and specific nights are unambiguous.

**Name filter.** A client-side name filter (as on the leaderboard [§4.7](./04-Feature-Leaderboards.md#47-name-search) and other views) narrows the summary table without a round-trip.

## 7.2 Roster, ordering, and pool membership

The holders shown on a pool's sheet — and their order and rank — are exactly that pool's **Championship standing** ([Spec 02 §2.5](./02-Domain-Model-and-Scoring.md#25-top-n-counts-aggregation), [Spec 04 §4.1](./04-Feature-Leaderboards.md#41-views)): every active holder whose **current pool** (as of the latest date in the data) is that pool, ranked by Championship total with the low-tag-number tie-break. This makes the "why is my total X?" reconciliation exact and side-steps ambiguity for **pool switchers**: a holder appears once, on their **current** pool's sheet, and any points earned in a former pool before an approved switch appear in their detail as **dropped ("forfeited on pool switch")** — never silently missing ([Spec 02 §2.2](./02-Domain-Model-and-Scoring.md#22-pools--eligibility)).

## 7.3 Explainability requirements

- The sum of a player's **counted** line items **must equal** their Championship total on the leaderboard. Because the leaderboard total excludes not-yet-final Podium bonuses, the flagged **projected** Podium line is deliberately **not** part of that sum.
- **Counted results show by default; dropped results collapse behind a per-player "show all" expander** (mobile space). When shown, dropped items are de-emphasized with a **reason**:
  - Top-N cap → "beyond best 15" (League Nights) / "beyond best {2\|3}" (Tournaments).
  - Pool-switch forfeiture → "forfeited on pool switch" ([Spec 02 §2.2](./02-Domain-Model-and-Scoring.md#22-pools--eligibility)).
- A **counted line worth 0 points** is shown as-is (e.g. a League Night finish outside the points-paying places, or a Pool-B result that scored 0 because the holder's rating reached ≥920 — [Spec 02 §2.2](./02-Domain-Model-and-Scoring.md#22-pools--eligibility)); it counts toward the best-15 slot count but adds 0 to the total. No special engine annotation is added for the ≥920 case in this feature.
- The active **top-N caps** are stated on the page ([Spec 02 §2.5](./02-Domain-Model-and-Scoring.md#25-top-n-counts-aggregation)): League Nights best **15**, FOD Open single result, and Tournaments **best 2 of N** (when ≤3 sanctioned FOD tournaments) or **best 3 of N** (when ≥4), with the current tournament count shown so the cap choice is self-explaining. The tournament count/cap is derived by the read model from the registered tournament sources ([Spec 03 §3.4](./03-Data-Ingestion-and-PDGA.md#34-event-registration-model)), matching the engine's own derivation.
- **Tie-break tag numbers are shown** (the Tag # column), and a row whose Championship rank was resolved by tag number rather than a strict points difference is marked, consistent with the leaderboard's tie indicator ([Spec 04 §4.4](./04-Feature-Leaderboards.md#44-states)).

## 7.4 Relationship to the spreadsheet's "score sheet"

The legacy Google Sheet showed per-pool ranked lists with skins-pot values attached. This app **separates concerns**: the competitive points breakdown lives here (points only); **all skins/CTP purse math lives in [Financials](./09-Financials.md)**, cross-linked from this page. The cross-link is wired once the Financials feature ships; until then the score sheet stands alone as a points-only view.

## 7.5 States

- **Pre-Season / empty** → the pool roster listed at 0 points with no line items (never an error), consistent with the leaderboard's empty state ([Spec 04 §4.4](./04-Feature-Leaderboards.md#44-states)).
- **Freshness / stale / pending-review banners** as elsewhere ([Spec 04 §4.4](./04-Feature-Leaderboards.md#44-states), [Spec 03 §3.8](./03-Data-Ingestion-and-PDGA.md#38-resilience--failure-handling)).

## 7.6 Deep links

- `/2026/score-sheet/pool-a` and `/2026/score-sheet/pool-b` (the pool toggle emits these, mirroring the leaderboard's pool deep links).
- Per-player anchors use the **name slug** (as in Rounds & Ratings / Player Profiles): `/2026/score-sheet/pool-a#{name-slug}`, so a director can link a holder straight to their row.

## Acceptance criteria

- Per-player counted line items sum exactly to the leaderboard Championship total for that player (projected-Podium lines excluded from that sum).
- Best-15 League-Night and best-2/3 Tournament caps are correctly applied, and the dropped items are shown behind "show all" with the correct reason.
- Pool-switch forfeited items appear as dropped ("forfeited on pool switch"); the holder appears on their current pool's sheet.
- A projected (not-yet-final) Podium placement is shown, flagged as not-final, and excluded from the displayed total; once its sub-league is marked complete the same placement appears as a counted Podium line and enters the total.
- The stated caps reflect the actual tournament count for the Season, and the Tournament column header states the active cap.
- Switching pools shows the correct roster, order, and breakdowns; the name filter narrows the summary table; per-player anchors deep-link to the right row.

← Prev: [06 — OLP Pot](./06-Feature-OLP-Pot.md) · Next: [08 — Player Profiles](./08-Feature-Player-Profiles.md)
