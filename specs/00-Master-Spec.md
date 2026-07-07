# FOD Tags Aggregator — Master Product Requirements

> Read-only web aggregator for the **Field of Dreams (FOD) Club Championship**, a season-long, tag-holder disc golf league. This document is the entry point; it links to logically grouped sub-specs and states the product rules that bind them together.

## 1. Product vision

The FOD Club Championship is currently run out of a hand-maintained [Google Sheet](https://docs.google.com/spreadsheets/d/15Iof5XV5sQo7D9BMPS1L4OKWNw9O0iky7ipeu8VxV80/edit) and a [rules Google Doc](https://docs.google.com/document/d/1wegvE6lmUqf7xBVxYSqp25DBvEJtEh82uBhpfH28lwE/edit), with raw scores living in the [PDGA Live app](https://www.pdga.com/live/event/104527/leaders). Standings, bonuses, pot math, and financials are computed by hand.

The FOD Tags Aggregator replaces the manual math with a **computation engine**: it ingests raw round data from PDGA Live, applies the league's published rules, and presents always-current standings, ratings, pot leaders, and financials on a mobile-friendly, shareable public website. A private admin console supplies the data PDGA can't (roster, tag numbers, pots, adjustments) and controls refreshes.

The app is the source of truth for computed results; the Google Sheet is being retired, not mirrored.

## 2. Goals & non-goals

**Goals**
- Show accurate, auto-computed Championship and sub-league standings per pool.
- Show every player's league rounds, round ratings, and current PDGA rating.
- Show Overall League Performance (OLP) pot leaders per sub-league.
- Show a per-pool season points breakdown ("score sheet") that explains how each total was reached.
- Be fully transparent about league finances.
- Be trivially viewable and shareable from a phone at the course.

**Non-goals (launch)**
- No live in-round scoring UI (data refreshes on a schedule + on demand — see §5).
- No public account system, comments, or social features.
- No score entry — scores originate in PDGA Live, not this app.
- No multi-year history or all-time leaderboards at launch (architect for it; don't build it yet).

## 3. Audience & personas

- **Tag holder / league member (primary, unauthenticated):** wants to know where they stand, their rating trend, and what they're owed. Mostly on mobile.
- **Spectator / prospective member (unauthenticated):** browsing standings and how the league works.
- **League director (admin, authenticated):** maintains the roster and financials, configures PDGA event sources, resolves unmatched players, records adjustments, and forces refreshes.

## 4. Feature map

The four Core Spec features, plus the supporting capabilities they require:

| # | Capability | Core Spec feature | Spec |
|---|---|---|---|
| 1 | Leaderboards (Championship + sub-league toggle, per pool) | Feature 1 | [04](./04-Feature-Leaderboards.md) |
| 2 | Rounds & ratings per player, filter by sub-league | Feature 2 | [05](./05-Feature-Rounds-and-Ratings.md) |
| 3 | OLP pot leaders per sub-league | Feature 3 | [06](./06-Feature-OLP-Pot.md) |
| 4 | Per-pool season points breakdown ("score sheet") | Feature 4 | [07](./07-Feature-Pool-Score-Sheets.md) |
| + | Player profile pages | — | [08](./08-Feature-Player-Profiles.md) |
| + | Financial transparency | — | [09](./09-Financials.md) |
| + | Admin console | — | [10](./10-Admin-Console.md) |

## 5. Cross-cutting decisions (the "constitution")

These constrain every sub-spec. Change them here first.

| Topic | Decision |
|---|---|
| **Architecture role** | App **computes** standings/points/OLP/pots from raw data + rules. Not a mirror of the Sheet. |
| **Leaderboard scope** | "Overall" = full-year **Championship** points; "season" toggle = the current **sub-league** (Early / Mid / Late). |
| **Ranking scope** | **All event finishes are ranked per-pool** — League Nights, Podiums, Tournaments, and the FOD Open. Pool A and Pool B each have their own 1st place at every event. |
| **Sub-league leaderboard** | Shows **League-Night points accrued in that sub-league; the Podium bonus folds in once the sub-league is final.** |
| **Years in scope** | **2026 only** at launch; model data so past seasons can be added later. |
| **PDGA event shape** | Each sub-league (Early/Mid/Late) is a **separate PDGA event ID**; FOD tournaments and the FOD Open are their own PDGA events too. |
| **PDGA access** | **No official PDGA API at launch** (dev program closed). Server-side **scrape** of PDGA Live (which blocks naive clients), + a **monthly official-rating pull** (2nd-Tuesday cadence). |
| **Data ingestion** | Scheduled refresh **Thursdays 9:00 PM ET** + an admin **"Refresh now"** button. No near-live in-round updates. |
| **Ratings usage** | **Eligibility thresholds (900/920) use official monthly ratings.** Live per-round ratings are shown but labeled **unofficial**. |
| **Admin-managed data** | Tag roster & tag numbers; **per-night entry counts**; financial inputs/pots; opening balances & payouts; manual adjustments/overrides; PDGA event registration & player↔holder matching. |
| **Player matching** | Roster stores each holder's PDGA #. App auto-matches PDGA entrants to holders; a **new entrant with a PDGA # is auto-added as a provisional holder** (scores immediately, flagged pending until a director confirms pool + tag number), while **ambiguous or PDGA-less entrants are flagged** for admin review. |
| **Financial transparency** | **Full**: tag sales, entry splits, skins purses, OLP pot, ace pot, expense reserves, and payouts are all public — as **summary balances + a full chronological ledger**. |
| **Access & auth** | Public read-only site + admin area gated by **Google sign-in against a director email allowlist**. |
| **Privacy** | Public shows **full names and PDGA numbers**, with rows linking out to PDGA profiles (data already public). |
| **UX** | Mobile-first; PDGA-Live-style leaderboards; player detail pages; stable shareable deep links. |

## 6. Sub-spec index

1. [Product Overview & Glossary](./01-Product-Overview-and-Glossary.md) — vision detail, terminology, personas, the season/league/round hierarchy.
2. [Domain Model & Scoring](./02-Domain-Model-and-Scoring.md) — pools, eligibility, the points tables, top-N counting, tie-breakers, OLP formula, cancellations. **The computation contract.**
3. [Data Ingestion & PDGA Integration](./03-Data-Ingestion-and-PDGA.md) — scraping, event registration, player matching, refresh cadence, caching, resilience.
4. [Feature: Leaderboards](./04-Feature-Leaderboards.md) — Core Feature 1.
5. [Feature: Rounds & Ratings](./05-Feature-Rounds-and-Ratings.md) — Core Feature 2.
6. [Feature: OLP Pot](./06-Feature-OLP-Pot.md) — Core Feature 3.
7. [Feature: Pool Score Sheets](./07-Feature-Pool-Score-Sheets.md) — Core Feature 4.
8. [Feature: Player Profiles](./08-Feature-Player-Profiles.md) — player detail pages.
9. [Financials](./09-Financials.md) — full transparency views.
10. [Admin Console](./10-Admin-Console.md) — roster, config, matching, financial inputs, adjustments, refresh.
11. [UX & Non-Functional Requirements](./11-UX-and-Nonfunctional.md) — mobile, performance, accessibility, and the recommended technical shape.
12. [Architecture & Scaffold](./12-Architecture.md) — concrete technical decisions (Next.js + SQLite/Drizzle on a GCP VM), layering, job model, and the walking-skeleton scope.

## 7. Source material

- Seed brief: [`Core Spec.md`](./Core%20Spec.md)
- League standings & finances: [Google Sheet](https://docs.google.com/spreadsheets/d/15Iof5XV5sQo7D9BMPS1L4OKWNw9O0iky7ipeu8VxV80/edit)
- League rules & bonus math: [Google Doc](https://docs.google.com/document/d/1wegvE6lmUqf7xBVxYSqp25DBvEJtEh82uBhpfH28lwE/edit)
- Current season (2026) PDGA event: [104527](https://www.pdga.com/live/event/104527/leaders)
- Prior season PDGA event: [102021](https://www.pdga.com/live/event/102021/leaders)
