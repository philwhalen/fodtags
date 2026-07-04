# 08 — Feature: Player Profiles

← [Master Spec](./00-Master-Spec.md)

## Purpose

A dedicated page per tag holder that unifies everything the app knows about them. Not one of the four Core Spec features, but selected as a launch UX priority ([Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution)) and the natural tap-target from every leaderboard/score-sheet/rounds row.

## User stories

- As a tag holder, I open my profile and see my **standings, rating, rounds, points breakdown, OLP position, and any money I'm in line for** — in one place.
- As a viewer, I can reach any player's profile from any list and **share the link**.

## 8.1 Profile contents

Header:
- **Full name**, **tag number**, **pool**, **present (official) PDGA rating**, and **PDGA number linking out to the PDGA profile** (public data — privacy decision in [Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution)).
- Eligibility flags (e.g., Pool B accrual active/inactive per the 920 rule; OLP eligible).

Sections (each links to the fuller feature view):
1. **Championship position** — pool rank + total points ([Spec 04](./04-Feature-Leaderboards.md)).
2. **Points breakdown** — their slice of the [score sheet](./07-Feature-Pool-Score-Sheets.md): counted/dropped line items.
3. **Rounds & ratings** — their [rounds](./05-Feature-Rounds-and-Ratings.md), round ratings, rating trend, filterable by sub-league.
4. **OLP** — their score and rank in each sub-league, with components ([Spec 06](./06-Feature-OLP-Pot.md)).
5. **Money** — skins-match qualification status and any projected OLP/skins payout ([Spec 09](./09-Financials.md)).

## 8.2 Identity & URLs

- Stable, human-readable slug (e.g., `/2026/players/jonathan-svendsen`). Slug must remain stable across refreshes and name-casing differences; back it with an internal holder ID.
- Handle name collisions deterministically (e.g., append tag number).

## 8.3 States

- Unmatched-data awareness: if some of a player's PDGA results are pending admin match, note it on the profile rather than showing an incomplete total as if complete.
- Freshness/stale banners as elsewhere.

## Acceptance criteria

- Every leaderboard/score-sheet/rounds/OLP row links to the correct profile.
- Profile figures reconcile exactly with the source feature pages (no divergent totals).
- Slugs are stable and shareable; collisions resolve deterministically.

## Resolved decisions

- **Profiles are for tag holders only.** Non-tag-holders who appear in PDGA data get no profile.
- **Privacy** → full names and PDGA numbers are shown publicly, with rows linking out to PDGA profiles ([Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution)).

## Remaining open questions

- Include historical placeholder sections now (for future multi-year), or add them when past seasons ship? (Default: add when history ships.)

← Prev: [07 — Pool Score Sheets](./07-Feature-Pool-Score-Sheets.md) · Next: [09 — Financials](./09-Financials.md)
