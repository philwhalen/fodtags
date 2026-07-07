# 08 — Feature: Player Profiles

← [Master Spec](./00-Master-Spec.md)

## Purpose

A dedicated page per tag holder that unifies everything the app knows about them. Not one of the four Core Spec features, but selected as a launch UX priority ([Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution)) and the natural tap-target from every leaderboard/score-sheet/rounds/OLP row. **Profiles exist only for tag holders**; non-tag-holders who appear in PDGA data get no profile.

This feature is a **read-only projection/aggregation** like Features 1–5: it reads precomputed read-model shapes and never touches PDGA or recomputes on the fly. Profile figures **must reconcile exactly** with the source feature pages — the profile is a compact window, not a second source of truth.

## User stories

- As a tag holder, I open my profile and see my **standings, rating, rounds, points breakdown, OLP position, and any money I'm in line for** — in one place.
- As a viewer, I can reach any player's profile from any list and **share the link**.
- As a viewer, I open **Players** in the nav and browse the full roster with a name filter, each row linking to a profile.

## 8.1 Profile contents

### Header

Shown at the top of every profile:

- **Full name**, **tag number** (**"—"** when unassigned for a provisional holder), **pool** (A / B), **present (official) PDGA rating** (or **"—" (Unrated)**), and **PDGA number** linking out to the holder's PDGA profile (public data — privacy decision in [Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution)).
- **Eligibility flags** (text badges, not color-only — [Spec 11 §11.2](./11-UX-and-Nonfunctional.md#112-accessibility)):
  - **Pending confirmation** — shown for a **provisional (auto-added, unconfirmed)** holder ([Spec 03 §3.5](./03-Data-Ingestion-and-PDGA.md#35-player-matching--auto-add-app-bootstraps-admin-confirms)); the record was bootstrapped from the PDGA scrape and awaits director confirmation. Omitted for confirmed holders.
  - **Pool B accrual** — `active` or `inactive` per the 920 rule ([Spec 02 §2.2](./02-Domain-Model-and-Scoring.md#22-pools--eligibility)); shown only for Pool B holders (Pool A omits this flag).
  - **OLP eligible** — `yes` or `no`; when `no`, a short reason: `"N rounds"` (fewer than 4 in the **current** sub-league) and/or `"no PDGA membership"`.
  - **Skins qualified** — `yes` or `no` for the holder's pool ([Spec 02 §2.9](./02-Domain-Model-and-Scoring.md#29-skins-match-qualification)); when `no` but the holder is in the top-4 point earners, show `"not eligible (rating >920)"` for Pool B as appropriate.

### Sections (compact summaries + deep links)

Each section shows **key figures only** and carries a **"View full …"** link to the corresponding feature page with the right scope pre-selected (pool, sub-league, anchor). Full tables and line-item detail live on the feature pages — the profile does not duplicate them inline.

1. **Championship position** — pool rank + Championship total points ([Spec 04](./04-Feature-Leaderboards.md)). Also shows the holder's rank + points in the **current sub-league** (League-Night points only until that sub-league's Podium is finalized — same rule as [Spec 04 §4.3](./04-Feature-Leaderboards.md#43-sub-league-leaderboard-content)). Links to `/2026/championship/{pool}` and `/2026/sub-league/{current}/pool-{pool}`.
2. **Points breakdown** — per-event-type **counted subtotals** (League Night, Podium, Tournament, FOD Open) plus counts of counted vs dropped line items ([Spec 07](./07-Feature-Pool-Score-Sheets.md)). Does **not** expand full line-item detail on the profile. Links to `/2026/score-sheet/pool-{pool}#{slug}`.
3. **Rounds & ratings** — present rating, round-rating **sparkline**, and the **most recent 5** league rounds (date, event label, score to par, round rating) for the **active sub-league filter** (§8.6). Links to `/2026/players/{slug}/rounds?league={current}`.
4. **OLP** — for the **active sub-league** (§8.6): rank (or "Not yet eligible" with reason), OLP score, the four components, and projected/final payout. A compact **all-sub-leagues summary** below lists Early · Mid · Late with score + rank/eligibility status only (no component columns). Links to `/2026/olp/{active}`.
5. **Money** — per the holder's pool and each sub-league ([Spec 09](./09-Financials.md)):
   - **Skins match:** qualification status (`qualified` / `not qualified` / `not eligible`), the holder's rank among pool point earners, and — when qualified — their **projected share** of the pool's skins purse (the season-end match pays the **entire purse** split among qualifiers; before payout is recorded, label projected). Links to `/2026/financials#pots-skins`.
   - **OLP payout:** per sub-league, the holder's projected/final payout amount (or "—" when ineligible), mirroring the OLP page. Links to `/2026/financials#pots-olp`.

Ace-pot wins, tag-sale batches, and expense-reserve flows are **season-level** ledger facts with no per-holder public slice today — they are **out of scope** for the profile money section at launch.

## 8.2 Identity & URLs

### Slug scheme

Each tag holder has a **canonical, human-readable slug** backed by the internal `tag_holders.id`:

1. Start from the holder's roster **name**, normalized: trim, lowercase, replace non-alphanumeric runs with `-`, strip leading/trailing hyphens (same rules as today's `slugifyName`).
2. If **no other active holder** in the season shares that base slug, the canonical slug **is** the base slug (e.g. `jonathan-svendsen`).
3. If two or more holders collide on the base slug, append `-{tagNumber}` to **each** colliding holder's canonical slug (e.g. `alex-smith-12`, `alex-smith-47`). A colliding holder with **no tag number** (auto-added/provisional — [Spec 02 §2.1](./02-Domain-Model-and-Scoring.md#21-core-entities)) falls back to `-{holderId}` so every canonical slug stays unique and stable.

Slugs are computed **once at read-model build time** from the season roster and stamped on every holder-scoped read-model row. All public links (leaderboards, OLP, score sheet, rounds, profile) use the **same canonical slug** — no ad-hoc re-slugification at render time.

### Routes

| URL | View |
|---|---|
| `/2026/players` | **Players roster index** — all active tag holders, name filter, each row → profile (§8.3). Default landing for the **Players** nav item. |
| `/2026/players/{slug}` | **Profile page** for one holder. |
| `/2026/players/{slug}/rounds` | **Full rounds table** for one holder ([Spec 05 §5.3](./05-Feature-Rounds-and-Ratings.md#53-per-player-rounds-table)); linked from the profile's Rounds section. Inherits `?league` / `?types` query params per [Spec 05 §5.7](./05-Feature-Rounds-and-Ratings.md#57-deep-links). |

The legacy **`/2026/players/search`** placeholder is **retired**: requests redirect (server-side, HTTP 3xx) to `/2026/players`.

### Resolution & redirects

- Profile routes resolve a `{slug}` to a holder by matching the **canonical slug** in the published `players` read-model index (§8.4).
- A request whose slug is a **unique prefix** or the **base slug of a tag-suffixed canonical** (e.g. `/players/alex-smith` when the canonical is `alex-smith-12` and no other holder owns `alex-smith`) **redirects** to the canonical URL.
- Unknown slugs → **404**.
- Slugs remain **stable across refreshes** and name-casing differences; a roster name edit that changes the base slug updates the canonical slug on the next publish (old URLs that no longer match redirect or 404 — there is no permanent redirect table at launch).

## 8.3 Players roster index

The `/2026/players` landing replaces the old search placeholder:

- One row per **active tag holder**: name (links to profile), tag # (**"—"** when unassigned for a provisional holder), pool, present rating (or Unrated), Championship rank in their pool, and a round count (all sub-leagues, League Nights only — same default scope as `/2026/rounds`). A **provisional (auto-added, unconfirmed)** holder ([Spec 03 §3.5](./03-Data-Ingestion-and-PDGA.md#35-player-matching--auto-add-app-bootstraps-admin-confirms)) carries a small **"pending confirmation"** text badge (not color-only — [Spec 11 §11.2](./11-UX-and-Nonfunctional.md#112-accessibility)).
- **Ordering:** present rating descending; unrated last; ties by tag number ascending (same as [Spec 05 §5.2](./05-Feature-Rounds-and-Ratings.md#52-all-players-roster-list)).
- **Name filter:** client-side, reusing [Spec 04 §4.7](./04-Feature-Leaderboards.md#47-name-search); mirrored to `?q=` for shareable filtered views.
- Standard freshness/stale/pending-review banners.

## 8.4 Read-model & data sources

Like every public feature, profiles read **only** from published read-model views — never from `computeSeason()` on the request path.

### New / extended views in `buildViews`

1. **`players` (index view)** — one row per active tag holder: `{ holderId, name, tagNumber, pool, slug, pdgaNumber, presentRating, championshipRank, championshipPoints, roundCount, …freshness flags }`. Used by the roster index, slug resolution, and as the holder directory for link generation across all features.

2. **`players/{slug}` (per-holder profile view)** — one published payload per holder containing the pre-aggregated profile sections (§8.1). Built at publish time by joining:
   - `players` index row (identity, header flags)
   - Championship + current-sub-league standing rows (from existing championship/sub-league views or engine output)
   - Holder slice of `score-sheet/pool-{a|b}` (counted subtotals + line-item counts)
   - Holder slice of `rounds` (present rating, sparkline inputs, recent rounds)
   - Holder rows from each `olp/{early|mid|late}` view
   - Holder slice of new **`skins/pool-{a|b}`** views (see below)

   Alternatively, the page may compose holder slices from the existing per-feature views at request time **provided** figures reconcile exactly; the **`players` index and canonical slugs are required either way**, and a dedicated `players/{slug}` payload is the **preferred** approach to keep the request path a single read.

3. **`skins/pool-a`, `skins/pool-b` (new)** — holder-scoped skins qualification rows derived from `computeSeason().skins` ([Spec 02 §2.9](./02-Domain-Model-and-Scoring.md#29-skins-match-qualification)): `{ holderId, name, slug, tagNumber, rank, totalPoints, eligible, qualified, projectedPayoutCents?, projected }` plus pool purse total and `skinsPaidOut` flag from `SeasonFinancials`. This is the first public exposure of engine `skins` output (previously deferred in `buildViews`). Projected payout per qualifier = whole pool purse ÷ number of qualified holders (integer cents, largest-remainder so shares sum to the purse).

### Pure projection helper

A `src/lib/profile-view.ts` (or equivalent) may reshape the `players/{slug}` payload for display (sub-league selector state, "View full …" link targets, projected/final labels) — same pattern as `olp-view.ts`, `score-sheet-view.ts`, etc. **No new engine computation.**

### Link unification

After this feature ships, **every** row link in `StandingsTable`, `OlpTable`, `ScoreSheetTable`, and `RoundsRosterTable` uses the canonical `slug` from the read model (via the `players` index or the holder row), not ad-hoc `slugifyName(name)`.

## 8.5 Sub-league context on the profile

Rounds (§8.1 item 3) and OLP detail (§8.1 item 4) respect an **active sub-league** selector on the profile page:

- A segmented control lists **Early · Mid · Late**; the **current** sub-league ([Spec 04 §4.3](./04-Feature-Leaderboards.md#43-sub-league-leaderboard-content)) is marked **"(now)"** and is the default on load.
- Selecting a sub-league updates the Rounds and OLP sections in place; the selector state is **not** a separate URL param at launch (the profile URL stays `/2026/players/{slug}`).
- The **Championship position** section (§8.1 item 1) is **not** gated by this selector — it always shows overall Championship rank/points plus the current-sub-league standing.
- The **all-sub-leagues OLP summary** (§8.1 item 4) is always visible regardless of selector.

## 8.6 States

- **Unmatched-data awareness:** if unresolved player items exist season-wide (provisional holders awaiting confirmation and/or link-decision entrants), show the standard **"N players pending review"** banner ([Spec 04 §4.4](./04-Feature-Leaderboards.md#44-states)). A provisional holder's **own** profile also shows the **"Pending confirmation"** header badge (§8.1). The profile does **not** attempt to show per-holder unmatched counts at launch.
- **Freshness / stale / pending-review banners** as elsewhere, using the worst applicable flag across the profile's source views.
- **Pre-season / empty:** a holder with no rounds shows 0 counts and friendly empty notes in each section — never an error.
- **Projected vs final:** OLP payouts, Podium-withheld sub-league standings, and skins/OLP purse labels follow the same projected/final rules as [Spec 06 §6.3](./06-Feature-OLP-Pot.md#63-payouts--pot), [Spec 04 §4.3](./04-Feature-Leaderboards.md#43-sub-league-leaderboard-content), and [Spec 09 §9.4](./09-Financials.md#94-correctness--display).

## Acceptance criteria

- **`/2026/players`** lists every active tag holder with name filter; each row links to the correct profile; `/2026/players/search` redirects to `/2026/players`.
- **Slug stability:** canonical slugs are holder-ID-backed, deterministic on collision (tag-number suffix), and identical across all feature links.
- **Slug resolution:** canonical URLs serve the profile; unambiguous non-canonical slugs redirect; unknown slugs 404.
- **Every** leaderboard, score-sheet, rounds, and OLP row links to the correct profile using the canonical slug.
- **Reconciliation:** profile Championship rank/points, score-sheet subtotals, OLP score/rank/payout, rounds data, and skins qualification match the corresponding feature pages exactly for the same refresh.
- **Compact sections** each carry a working "View full …" deep link with the correct scope.
- **Header flags** correctly reflect Pool B accrual, OLP eligibility (with reason), and skins qualification.
- **Sub-league selector** defaults to current "(now)" and updates Rounds + OLP sections; Championship section always shows overall + current-sub-league standing.
- **`skins/pool-{a|b}`** read-model views publish and drive the profile money section; projected skins shares sum to the pool purse.
- Stale, pending-review, and projected/final treatments match sibling features.

← Prev: [07 — Pool Score Sheets](./07-Feature-Pool-Score-Sheets.md) · Next: [09 — Financials](./09-Financials.md)
