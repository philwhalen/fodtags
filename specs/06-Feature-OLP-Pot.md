# 06 — Feature: OLP Pot (Core Feature 3)

← [Master Spec](./00-Master-Spec.md)

## Purpose

> Core Spec Feature 3: "It shows the Overall Performance Pot leaders for each season."

Per glossary, "each season" = **each sub-league** (Early / Mid / Late). The OLP formula is defined in [Spec 02 §2.8](./02-Domain-Model-and-Scoring.md#28-overall-league-performance-olp).

## User stories

- As a tag holder, I can see the **OLP standings for each sub-league**, sorted best (lowest) score first.
- As a viewer, I can see the **projected payouts** to the top 3 (50/30/20% of that sub-league's pot), and the **total pot** they split.
- As a tag holder, I can see **why** my OLP score is what it is (its components).
- As a viewer, I can see who is **not yet eligible** (fewer than 4 rounds, or no PDGA membership).
- As a viewer, I can **search** for a player by name.

## 6.1 Views

- One OLP standings table **per sub-league** (Early / Mid / Late), selectable.
- OLP is **across both pools together** (every holder in both pools is entered), per the rules — not split by pool. (Contrast with leaderboards, which are per-pool.)
- **Sub-league selector.** A single segmented control lists **Early · Mid · Late** as sibling options, the **current** sub-league marked "(now)". Selecting one navigates to that sub-league's OLP deep link (§6.5). This reuses the shared "current sub-league" notion ([Spec 04 §4.3](./04-Feature-Leaderboards.md#43-sub-league-leaderboard-content)) — the same resolution used by the leaderboards. Unlike the leaderboard control, OLP has **no "Overall Championship" option and no pool toggle**: OLP exists only per sub-league and only across both pools together.

## 6.2 Columns & eligibility presentation

The ranked table lists the **eligible** players, ranked 1..N by OLP score (best/lowest first), so ranks 1/2/3 map directly to the three payouts:

| Rank | Player | OLP score | Rating (10%) | Avg to par | Rounds (−) | Pool wins (−) | Payout |

- **OLP score** lower is better; show to one decimal (matches the worked examples, [Spec 02 §2.8](./02-Domain-Model-and-Scoring.md#28-overall-league-performance-olp)).
- Show the **four components** so the number is explainable ([principle: "explain the number"](./01-Product-Overview-and-Glossary.md#product-principles)). The four component columns must **reconcile to the displayed score**: `Rating(10%) + Avg to par − Rounds − Pool wins = OLP score` (each shown to the same one-decimal precision). "Rating (10%)" shows the **0.10× contribution** (e.g. `85.3` for an 853 rating), not the raw rating.

**Not-yet-eligible section.** Players who are **ineligible** — fewer than 4 league rounds played in the sub-league, or no PDGA membership — are **not ranked and receive no payout**. They appear in a distinct **"Not yet eligible"** group **below** the ranked table (not interleaved into the ranks), still showing their OLP score and the same four components, plus a short **reason** (e.g. "2 rounds" or "no PDGA"). A holder who has played **zero** league rounds in the sub-league has not entered it and does **not** appear in either list.

- **PDGA-membership status is an admin flag on the roster** ([Spec 10 §10.2](./10-Admin-Console.md#102-roster--tag-management)) — reliable and not dependent on scraping.
- Ties among ranked players are broken by **low tag number** ([Spec 02 §2.6](./02-Domain-Model-and-Scoring.md#26-tie-breakers)); surface a tie-break indicator as the leaderboards do.

## 6.3 Payouts & pot

- The page shows the **total OLP pot** for the sub-league alongside the per-rank payouts, so viewers see the whole pool and how it splits. Label it **"projected"** while the sub-league is in progress and **"final"** once complete (§6.4), matching the payout labels.
- Projected payout for ranks 1–3 = 50% / 30% / 20% of the sub-league's OLP pot, rounded to whole dollars via **largest-remainder** so the three shares sum exactly to the pot ([Spec 02 §2.8](./02-Domain-Model-and-Scoring.md#28-overall-league-performance-olp)).
- The OLP pot balance comes from [Financials](./09-Financials.md) ($1 per League-Night entry into the OLP pot); at this stage it is the Common-A per-night entry-count slice. The displayed **total pot cross-links to the OLP pot detail** on the financials page ([Spec 09 §9.3](./09-Financials.md#93-public-financial-views), `#pots-olp`).
- Before a sub-league completes, mark payouts **"projected"**; after, **"final."**
- If fewer than 3 players are eligible, only the available ranks receive a payout; the pot total is still shown in full.

## 6.4 Freshness & correctness

- Rating component uses the official rating **in effect on the sub-league's admin-configured end date** ([Spec 03 §3.4](./03-Data-Ingestion-and-PDGA.md#34-event-registration-model)); while the sub-league is in progress, use the latest official rating and label as projected. Payouts flip from **projected** to **final** when a director **marks the sub-league complete** ([Spec 10 §10.3](./10-Admin-Console.md#103-pdga-event-configuration)).
- Excludes canceled rounds from the round count and average ([Spec 02 §2.7](./02-Domain-Model-and-Scoring.md#27-cancellations--partial-events)).
- Standard freshness/stale/data-quality banners.

## 6.5 Deep links

| URL | View |
|---|---|
| `/2026/olp/early`, `/2026/olp/mid`, `/2026/olp/late` | Explicit sub-league OLP standings — stable, never redirect. |
| `/2026/olp` | **Alias →** redirects (server-side, HTTP 3xx) to the **current** sub-league's explicit OLP URL at request time. |

- The bare `/2026/olp` alias is the "always current" shareable link, mirroring the `/2026/sub-league` alias ([Spec 04 §4.5](./04-Feature-Leaderboards.md#45-deep-links-shareable)); it follows the season as the current sub-league advances. The top-level **OLP** nav link ([Spec 11](./11-UX-and-Nonfunctional.md)) points at this alias.
- Name search is mirrored to `?q=` on any of these URLs (§6.6).

## 6.6 Name search

A client-side **name filter** sits above the standings, reusing the leaderboard search behavior ([Spec 04 §4.7](./04-Feature-Leaderboards.md#47-name-search)): case-insensitive, accent-insensitive substring over the shared roster name-normalization; a clear control restores the full lists; an empty result shows a brief "No players match '\<query\>'" message.

- It narrows visible rows across **both** the ranked table and the "Not yet eligible" section; it **never re-ranks** — a filtered player keeps their true rank, score, and payout.
- It is purely client-side (no refetch, never touches PDGA or the engine) and per-view (does not persist across sub-league changes). Its query is mirrored to the URL as `?q=` so a searched view is still shareable.

## Acceptance criteria

- OLP scores reproduce the rules doc's worked examples (81.3 and 81.4) exactly.
- The ranked table lists **eligible players only**, sorted ascending by score, ranked 1..N; ineligible players (\<4 rounds or no PDGA membership) appear in a separate "Not yet eligible" section with a reason and no payout, and a 0-round holder appears in neither.
- Each component column reconciles to the displayed OLP score (`Rating(10%) + Avg to par − Rounds − Pool wins = score`).
- The total pot is displayed; projected payouts sum to the pot (modulo rounding) and, with payouts, flip from "projected" to "final" on sub-league completion.
- The `/2026/olp` alias redirects to the current sub-league's explicit OLP URL; explicit sub-league URLs do not redirect.
- The name filter narrows both sections without re-ranking, clears back to the full lists, mirrors to `?q=`, and shows a no-match message for a non-matching query.

← Prev: [05 — Rounds & Ratings](./05-Feature-Rounds-and-Ratings.md) · Next: [07 — Pool Score Sheets](./07-Feature-Pool-Score-Sheets.md)
