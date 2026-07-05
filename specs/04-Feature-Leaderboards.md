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

**Default landing:** the app root and the "Leaderboards" nav item open the **2026 Championship, Pool A** view ([§4.5](#45-deep-links-shareable)).

**Pool is preserved across view changes.** The view selection (Overall Championship, or a specific sub-league) and the pool (A / B) are independent: switching from *Championship · Pool B* to *Mid · Pool B* keeps the pool, and switching back to Overall Championship keeps Pool B. Because every view is a deep link ([§4.5](#45-deep-links-shareable)), this "preservation" is simply the control emitting the destination URL that keeps the pool fixed — there is no hidden client state, so a shared link always reproduces the exact view. The **current** sub-league ([§4.3](#43-sub-league-leaderboard-content)) is surfaced as the option marked "(now)".

## 4.2 Columns (mobile-first, PDGA-style)

| Rank | Player | Tag # | Points |

- **Rank** reflects tie-breakers ([Spec 02 §2.6](./02-Domain-Model-and-Scoring.md#26-tie-breakers)) — low tag number breaks ties, so tied point totals still order deterministically.
- **Points** is the aggregated total for the selected scope.
- Tapping a row → player profile.
- The viewing user cannot be "highlighted" (no login), but provide a client-side **name search** ([§4.7](#47-name-search)).

## 4.3 Sub-league leaderboard content

The sub-league view shows standings **within that sub-league**: **League-Night points accrued in that sub-league while it is in progress, with that sub-league's Podium bonus folded in once it is finalized.** All of the sub-league's League Nights count (the best-15 cap is season-wide — [Spec 02 §2.5](./02-Domain-Model-and-Scoring.md#25-top-n-counts-aggregation)). Ranking is per-pool, like everywhere else.

The **current** sub-league (the season toggle's default, and the target of the `/sub-league` alias in [§4.5](#45-deep-links-shareable)) is the one whose **admin-configured `[startDate, endDate]` window contains today** (America/New_York); if none contains today, the **most recently ended** sub-league (the one with the latest `endDate` at or before today). This gap-handling branch is not an edge case: between two sub-leagues (e.g. after Mid's `endDate` but before Late's `startDate`) *no* window contains today, and "current" resolves to the just-ended sub-league. Before the first sub-league begins, "current" resolves to the **earliest** sub-league (so the pre-season view shows Early at zero points, per [§4.4](#44-states)). This resolution is a single shared helper — the OLP feature ([Spec 06](./06-Feature-OLP-Pot.md)) reuses the same "current sub-league" notion.

A sub-league is **finalized** — folding in the computed Podium bonus ([Spec 02 §2.4.1](./02-Domain-Model-and-Scoring.md#241-league-podium--computed-bonus)) — when a director **marks it complete** ([Spec 10 §10.3](./10-Admin-Console.md#103-pdga-event-configuration)). Until then the sub-league standing shows **League-Night points only**, with a non-alarming note that the Podium bonus is not yet finalized; the projected bonus is **not** pre-folded into the displayed totals.

## 4.4 States

- **Loading / empty:** before any rounds, show the roster at 0 points, not an error.
- **Freshness:** every leaderboard shows "Updated {time} ET" and a **stale** badge if the underlying sources are stale ([Spec 03 §3.8](./03-Data-Ingestion-and-PDGA.md#38-resilience--failure-handling)).
- **Data-quality banner:** if unmatched PDGA players exist for the scope, show a non-alarming note ("N results pending review") rather than omitting silently.
- **Ties:** visually indicate a tie is broken by tag number (e.g., subtle marker/tooltip).

## 4.5 Deep links (shareable)

Stable URLs encode scope + pool + sub-league. Every toggle in [§4.6](#46-toggle--navigation-controls) resolves to one of these:

| URL | View |
|---|---|
| `/2026/championship/pool-a` | Championship, Pool A (default landing) |
| `/2026/championship/pool-b` | Championship, Pool B |
| `/2026/sub-league/mid/pool-b` | Explicit sub-league (Mid), Pool B |
| `/2026/sub-league` | **Alias →** redirects to the current sub-league ([§4.3](#43-sub-league-leaderboard-content)), Pool A |
| `/2026/sub-league/pool-b` | **Alias →** redirects to the current sub-league, Pool B |

The two **alias** forms are the "always current" shareable links: they redirect (server-side, HTTP 3xx) to the explicit current-sub-league URL at request time, so the same bookmark follows the season as the current sub-league advances. The explicit `…/sub-league/<early|mid|late>/<pool>` URLs are stable and never redirect. The redirect **preserves the pool** carried in the alias.

## 4.6 Toggle & navigation controls

The leaderboard page carries an in-page control cluster (mobile-first, thumb-reachable); each control simply navigates to the corresponding [§4.5](#45-deep-links-shareable) deep link, preserving the pool:

- **View toggle** — a single segmented control listing **Overall Championship** and each sub-league — **Early · Mid · Late** — as sibling options. The **current** sub-league ([§4.3](#43-sub-league-leaderboard-content)) is marked "(now)". Selecting a sub-league navigates straight to that sub-league at the current pool; selecting Overall Championship returns to the Championship at the current pool. (There is no separate two-step "scope, then sub-league" selection — every scope is one tap.)
- **Pool toggle** — a two-option segmented control: **Pool A** / **Pool B**, carried across view changes.

Controls reflect the active view (the current selection is visibly pressed/selected) and are keyboard-operable and screen-reader-labeled ([Spec 11](./11-UX-and-Nonfunctional.md)). There is no separate top-level "Sub-league" nav item — sub-league standings are reached through this view toggle inside Leaderboards.

## 4.7 Name search

A client-side **name filter** sits above the standings table (no login, so nothing is auto-highlighted):

- Typing narrows the table to rows whose player name matches the query (case-insensitive, accent-insensitive substring; reuse the roster name-normalization already used for player matching).
- A clear/reset control (and clearing the input) restores the full list.
- **Filtering never re-ranks:** the Rank and Points shown on a filtered row are that player's true standing values within the full pool, not a position within the filtered subset.
- The filter is per-view (it does not persist across scope/pool toggles) and is purely client-side — it triggers no refetch and never touches PDGA or the engine.
- Empty result: show a brief "No players match '<query>'" message with the clear control, not an empty table.

## Acceptance criteria

- Default load (app root or "Leaderboards" nav) shows 2026 Championship, Pool A, sorted correctly with tie-breaks applied.
- Toggling to a sub-league and to Pool B updates ranks/points consistently with [Spec 02](./02-Domain-Model-and-Scoring.md).
- **Pool is preserved across view changes:** from *Championship · Pool B*, selecting a sub-league (e.g. Mid) lands on *Mid · Pool B*; selecting Overall Championship again returns to *Championship · Pool B*. The current sub-league is the option marked "(now)".
- **Current-sub-league resolution** picks the window containing today, else the most-recently-ended sub-league; verified for a date that falls in the gap between two sub-leagues (resolves to the just-ended one) and for a pre-season date (resolves to the earliest).
- The `/2026/sub-league` and `/2026/sub-league/pool-b` aliases redirect to the current sub-league's explicit URL, preserving pool; explicit sub-league URLs do not redirect.
- **Name filter** narrows the table to matching rows without re-ranking, clears back to the full list, and shows a no-match message for a non-matching query.
- Tapping a row deep-links to that player's profile.
- Deep links restore the exact view.
- Stale/unmatched conditions render their banners; an in-progress sub-league shows League-Night points only with the "Podium bonus not yet finalized" note.

← Prev: [03 — Data Ingestion](./03-Data-Ingestion-and-PDGA.md) · Next: [05 — Rounds & Ratings](./05-Feature-Rounds-and-Ratings.md)
