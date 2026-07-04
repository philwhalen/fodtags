# 07 — Feature: Pool Score Sheets (Core Feature 4)

← [Master Spec](./00-Master-Spec.md)

## Purpose

> Core Spec Feature 4: "It shows the score sheet for each pool."

Per [Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution): the score sheet is the **season points breakdown per pool** — the "show your work" view that explains how each Championship total was assembled. Where the leaderboard ([Spec 04](./04-Feature-Leaderboards.md)) shows *rank + total*, the score sheet shows *how the total was reached*.

## User stories

- As a tag holder, I can see, for my pool, **each player's points itemized by event type**.
- As a tag holder, I can see **which results counted** and which were **dropped** by the top-N caps ([Spec 02 §2.5](./02-Domain-Model-and-Scoring.md#25-top-n-counts-aggregation)).
- As a viewer, I can see the **tag numbers** used to break ties.
- As a director, I can point a player at this page to answer "why is my total X?"

## 7.1 Layout

One score sheet **per pool** (A / B). For each player, a breakdown:

| Player | Tag # | League Night pts (best 15) | Podium pts | Tournament pts (best 2–3) | FOD Open pts | **Total** |

Expandable per player to a **line-item detail**:
- Every League Night result (date, finish, points), with **counted** vs **dropped** clearly marked (best-15 rule).
- Podium finishes per sub-league.
- Tournament results with the counted/dropped cap applied (best-2 or best-3 depending on tournament count).
- FOD Open result.

## 7.2 Explainability requirements

- The sum of counted line items **must equal** the player's Championship total on the leaderboard.
- Counted results show by default; **dropped results are collapsed behind a "show all" expander** (mobile space), and when shown are de-emphasized with a reason ("beyond best 15").
- The active **top-N caps** are stated on the page (e.g., "Tournaments: best 3 of N counted because ≥4 sanctioned FOD tournaments").
- Tie-break tag numbers are shown.

## 7.3 Relationship to the spreadsheet's "score sheet"

The legacy Google Sheet showed per-pool ranked lists with skins-pot values attached. This app **separates concerns**: the competitive points breakdown lives here (points only); **all skins/CTP purse math lives in [Financials](./09-Financials.md)**, cross-linked from this page.

## 7.4 States

- Pre-Season / empty → roster at 0 with no line items.
- Freshness/stale/data-quality banners as elsewhere.

## 7.5 Deep links

- `/2026/score-sheet/pool-a`, `/2026/score-sheet/pool-b`, and per-player anchors.

## Acceptance criteria

- Per-player counted line items sum exactly to the leaderboard total for that player.
- Best-15 League-Night and best-2/3 Tournament caps are correctly applied and the dropped items are shown.
- Switching pools shows the correct roster and breakdowns.
- The stated caps reflect the actual tournament count for the Season.

← Prev: [06 — OLP Pot](./06-Feature-OLP-Pot.md) · Next: [08 — Player Profiles](./08-Feature-Player-Profiles.md)
