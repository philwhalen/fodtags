# 04 — Feature: Leaderboards (Core Feature 1)

← [Master Spec](./00-Master-Spec.md)

## Purpose

> Core Spec Feature 1: "It shows the current leaderboard for the overall league and allows the user to switch to the leaderboard for the current season."

Per [Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution): **"overall" = full-year Championship standings; "season" = the current sub-league (Early / Mid / Late).**

## User stories

- As a tag holder, I open the app and immediately see the **Championship standings** for my pool, with my row easy to find.
- As a viewer, I can **toggle** between the Championship (overall) view and the **current sub-league** view.
- As a viewer, I can switch between **Pool A** and **Pool B**.
- As a viewer, I can tap any player to open their [profile](./08-Feature-Player-Profiles.md).

## 4.1 Views

**Two scopes, toggled:**
1. **Championship (Overall) — default.** Total Season points per the top-N aggregation ([Spec 02 §2.5](./02-Domain-Model-and-Scoring.md#25-top-n-counts-aggregation)), ranked within pool.
2. **Sub-league (current "season").** Standings for the active sub-league. Defaults to the currently-running sub-league; user can pick Early / Mid / Late.

**Two pools:** A and B, always separated (each has its own ranking and its own 1st place).

## 4.2 Columns (mobile-first, PDGA-style)

| Rank | Player | Tag # | Points |

- **Rank** reflects tie-breakers ([Spec 02 §2.6](./02-Domain-Model-and-Scoring.md#26-tie-breakers)) — low tag number breaks ties, so tied point totals still order deterministically.
- **Points** is the aggregated total for the selected scope.
- Tapping a row → player profile.
- The viewing user cannot be "highlighted" (no login), but provide a client-side **name search/jump**.

## 4.3 Sub-league leaderboard content

The sub-league view shows standings **within that sub-league**: **League-Night points accrued in that sub-league while it is in progress, with that sub-league's Podium bonus folded in once it is finalized.** Ranking is per-pool, like everywhere else.

## 4.4 States

- **Loading / empty:** before any rounds, show the roster at 0 points, not an error.
- **Freshness:** every leaderboard shows "Updated {time} ET" and a **stale** badge if the underlying sources are stale ([Spec 03 §3.8](./03-Data-Ingestion-and-PDGA.md#38-resilience--failure-handling)).
- **Data-quality banner:** if unmatched PDGA players exist for the scope, show a non-alarming note ("N results pending review") rather than omitting silently.
- **Ties:** visually indicate a tie is broken by tag number (e.g., subtle marker/tooltip).

## 4.5 Deep links (shareable)

Stable URLs encode scope + pool + sub-league, e.g.:
- `/2026/championship/pool-a`
- `/2026/sub-league/mid/pool-b`

## Acceptance criteria

- Default load shows 2026 Championship, Pool A, sorted correctly with tie-breaks applied.
- Toggling to a sub-league and to Pool B updates ranks/points consistently with [Spec 02](./02-Domain-Model-and-Scoring.md).
- Tapping a row deep-links to that player's profile.
- Deep links restore the exact view.
- Stale/unmatched conditions render their banners.

← Prev: [03 — Data Ingestion](./03-Data-Ingestion-and-PDGA.md) · Next: [05 — Rounds & Ratings](./05-Feature-Rounds-and-Ratings.md)
