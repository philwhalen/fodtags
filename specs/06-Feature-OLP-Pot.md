# 06 — Feature: OLP Pot (Core Feature 3)

← [Master Spec](./00-Master-Spec.md)

## Purpose

> Core Spec Feature 3: "It shows the Overall Performance Pot leaders for each season."

Per glossary, "each season" = **each sub-league** (Early / Mid / Late). The OLP formula is defined in [Spec 02 §2.8](./02-Domain-Model-and-Scoring.md#28-overall-league-performance-olp).

## User stories

- As a tag holder, I can see the **OLP standings for each sub-league**, sorted best (lowest) score first.
- As a viewer, I can see the **projected payouts** to the top 3 (50/30/20% of that sub-league's pot).
- As a tag holder, I can see **why** my OLP score is what it is (its components).
- As a viewer, I can see who is **not yet eligible** (fewer than 4 rounds, or no PDGA membership).

## 6.1 Views

- One OLP standings table **per sub-league** (Early / Mid / Late), selectable.
- OLP is **across both pools together** (every holder in both pools is entered), per the rules — not split by pool. (Contrast with leaderboards, which are per-pool.)

## 6.2 Columns

| Rank | Player | OLP score | Rating (10%) | Avg to par | Rounds (−) | Pool wins (−) | Eligible? | Projected payout |

- **OLP score** lower is better; show to one decimal (matches the worked examples, [Spec 02 §2.8](./02-Domain-Model-and-Scoring.md#28-overall-league-performance-olp)).
- Show the **four components** so the number is explainable ([principle: "explain the number"](./01-Product-Overview-and-Glossary.md#product-principles)).
- **Eligible?** flags <4 rounds or missing PDGA membership; ineligible players still display but are marked and excluded from podium/payout. **PDGA-membership status is an admin flag on the roster** ([Spec 10 §10.2](./10-Admin-Console.md#102-roster--tag-management)) — reliable and not dependent on scraping.

## 6.3 Payouts

- Projected payout for ranks 1–3 = 50% / 30% / 20% of the sub-league's OLP pot, rounded to whole dollars via **largest-remainder** so the three shares sum exactly to the pot ([Spec 02 §2.8](./02-Domain-Model-and-Scoring.md#28-overall-league-performance-olp)).
- The OLP pot balance comes from [Financials](./09-Financials.md) ($1 per League-Night entry into the OLP pot).
- Before a sub-league completes, mark payouts **"projected"**; after, **"final."**

## 6.4 Freshness & correctness

- Rating component uses the rating **on the sub-league's last day**; while in progress, use latest and label as projected.
- Excludes canceled rounds from the round count and average ([Spec 02 §2.7](./02-Domain-Model-and-Scoring.md#27-cancellations--partial-events)).
- Standard freshness/stale/data-quality banners.

## 6.5 Deep links

- `/2026/olp/early`, `/2026/olp/mid`, `/2026/olp/late`.

## Acceptance criteria

- OLP scores reproduce the rules doc's worked examples (81.3 and 81.4) exactly.
- Sorting is ascending by score; ineligible players are marked and excluded from top-3 payouts.
- Projected payouts sum to the pot (modulo rounding) and flip to "final" on sub-league completion.
- Each component column reconciles to the displayed OLP score.

← Prev: [05 — Rounds & Ratings](./05-Feature-Rounds-and-Ratings.md) · Next: [07 — Pool Score Sheets](./07-Feature-Pool-Score-Sheets.md)
