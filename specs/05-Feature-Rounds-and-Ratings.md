# 05 — Feature: Rounds & Ratings (Core Feature 2)

← [Master Spec](./00-Master-Spec.md)

## Purpose

> Core Spec Feature 2: "It shows the league rounds for every player, their ratings for those rounds and their present rating. It also lets the user filter by season. These data should be pulled from the PDGA Live app."

Per glossary, "filter by season" = filter by **sub-league** (Early / Mid / Late), and optionally by event type.

## User stories

- As a viewer, I can see, for any player, **every league round** they've played with the **score** and **round rating**, plus their **present PDGA rating**.
- As a viewer, I can **filter** the rounds view by sub-league.
- As a viewer, I can see a player's **rating trend** over the Season.

## 5.1 Two entry points

1. **All-players rounds view** — a browsable/searchable table of round results across the roster, filterable by sub-league and player.
2. **Per-player rounds** — the same data scoped to one player (also embedded in their [profile](./08-Feature-Player-Profiles.md)).

## 5.2 Round row fields (from PDGA — [Spec 03 §3.2](./03-Data-Ingestion-and-PDGA.md#32-data-the-app-pulls-from-pdga-per-configured-event))

| Date | Sub-league | Event/Round | Score (to par) | Round rating |

Plus, per player: **present player rating** displayed prominently, and a small **round-rating trend** (sparkline or list).

## 5.3 Filters

- **Sub-league:** All / Early / Mid / Late.
- **Event type:** defaults to **League Nights** (Core Feature 2 says "league rounds"); a filter lets the user **add Tournament and FOD Open rounds**. Player profiles ([Spec 08](./08-Feature-Player-Profiles.md)) show all event types by default.
- **Player:** search/select.

## 5.4 Ratings

- **Present rating** is the player's current official PDGA rating from the latest refresh.
- **Round ratings** are per-round as reported by PDGA.
- If PDGA hasn't yet rated a recent round, show it as **"pending"** rather than blank/zero.
- Rating context matters to eligibility ([Spec 02 §2.2](./02-Domain-Model-and-Scoring.md#22-pools--eligibility)); this view is the human-readable window into that data but does not itself gate anything.

## 5.5 States

- Only **tag holders** are listed; non-tag-holder rounds are **hidden** (they exist in the ingested data only to compute finish order).
- **Freshness** and **stale** indicators as in [Spec 04 §4.4](./04-Feature-Leaderboards.md#44-states).
- Unmatched PDGA entrants do not appear as phantom players; they wait in the admin queue.

## 5.6 Deep links

- `/2026/rounds` (all), `/2026/rounds?league=early`, `/2026/players/{slug}/rounds`.

## Acceptance criteria

- A player's rounds list matches the PDGA source for the configured events, with correct sub-league attribution.
- Present rating matches the latest refresh; round ratings match PDGA; unrated rounds show "pending."
- Sub-league filter correctly partitions rounds across the 3 separate PDGA events.
- Deep links restore filter state.

← Prev: [04 — Leaderboards](./04-Feature-Leaderboards.md) · Next: [06 — OLP Pot](./06-Feature-OLP-Pot.md)
