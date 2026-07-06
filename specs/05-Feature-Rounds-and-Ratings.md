# 05 — Feature: Rounds & Ratings (Core Feature 2)

← [Master Spec](./00-Master-Spec.md)

## Purpose

> Core Spec Feature 2: "It shows the league rounds for every player, their ratings for those rounds and their present rating. It also lets the user filter by season. These data should be pulled from the PDGA Live app."

Per glossary, "filter by season" = filter by **sub-league** (Early / Mid / Late), and optionally by event type.

This is a **read-only projection** like every other view: it reads a precomputed, published read-model shape and never touches PDGA or recomputes on the fly ([Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution)).

## User stories

- As a viewer, I open **Rounds** and see the whole roster with each player's **present rating**, how many league rounds they've played, and a quick **rating trend** at a glance.
- As a viewer, I can **tap any player** to see **every league round** they've played with the **score (to par)** and **round rating**, with their **present rating** shown prominently.
- As a viewer, I can **filter** the view by **sub-league** (Early / Mid / Late) and by **event type** (add Tournament / FOD Open rounds), and share the filtered view via a stable link.
- As a viewer, I can **search** for a player by name.
- As a viewer, I can see a player's **round-rating trend** over the Season.

## 5.1 Two entry points

1. **All-players roster list** (`/2026/rounds`) — one row per **tag holder** (name, tag #, present rating, round count, mini rating trend), ordered for quick scanning. Tapping a row drills into that player's rounds. This is the default landing for the **Rounds** nav item.
2. **Per-player rounds** (`/2026/players/{slug}/rounds`) — the full round-by-round table for one holder. The profile ([Spec 08 §8.1](./08-Feature-Player-Profiles.md#81-profile-contents)) shows a **compact summary** (sparkline + recent 5 rounds) with a "View full rounds" link here; the profile's rounds summary respects its sub-league selector (§8.5), whereas this standalone path inherits `?league` / `?types` (§5.4).

There is **no pool toggle** here — rounds are not pool-ranked (pools matter only to standings, [Spec 04](./04-Feature-Leaderboards.md)). The roster list is a single combined list across both pools.

## 5.2 All-players roster list

One row per active tag holder:

| # | Player | Tag # | Present rating | Rounds | Trend |

- **#** is a plain **row index** for the current ordering — **not** a league standing or rank (this view is not a competition; contrast [Spec 04 §4.2](./04-Feature-Leaderboards.md#42-columns-mobile-first-pdga-style)).
- **Player** — full name; tapping the row deep-links to that player's rounds (§5.7).
- **Present rating** — current **official** PDGA rating (§5.5); **"—" (Unrated)** when the holder has no official rating on file.
- **Rounds** — count of the holder's league rounds **within the active filters** (§5.4): a specific sub-league and/or event-type selection changes this count.
- **Trend** — a compact **round-rating sparkline** (§5.5) over the rounds in scope; omitted (or shown as a single value) when the holder has fewer than two rated rounds in scope.

**Ordering.** Rows are ordered by **present rating, descending**; holders with no official rating sort **last**, ties broken by **tag number** ascending. This ordering is descriptive scanning aid, not a ranking. (The row index renumbers as filters/search change; it is never a shareable identity — the player slug is.)

**Name search.** A client-side name filter sits above the list, reusing the leaderboard search behavior ([Spec 04 §4.7](./04-Feature-Leaderboards.md#47-name-search)): case-insensitive, accent-insensitive substring over the shared roster name-normalization; a clear control restores the full list; an empty result shows a brief "No players match '<query>'" message. It narrows visible rows only — it never re-sorts the remaining rows into new positions beyond removing the hidden ones, and it triggers no refetch. Its query is mirrored to the URL as `?q=` (§5.7) so a searched view is still shareable, but the filtering itself stays client-side.

## 5.3 Per-player rounds table

Header (shown prominently above the table):

- **Present rating** — the holder's current **official** rating (§5.5), or **"—" (Unrated)**.
- **Round-rating trend** — the sparkline (§5.5) across the rounds in scope.

Round rows (one per league round, **newest first**):

| Date | Sub-league | Event / Round | Score (to par) | Round rating |

- **Date** — the event's ET calendar date.
- **Sub-league** — Early / Mid / Late for League Nights; for Tournament / FOD Open rounds this cell reads the event type (those events belong to no sub-league — §5.4).
- **Event / Round** — e.g. "Early · League Night 6", "FOD Open · R2".
- **Score (to par)** — the round's raw score to par as reported by PDGA.
- **Round rating** — the per-round rating; **"pending"** when the round is ingested but PDGA has not yet rated it (never blank/zero — §5.5).

Only rounds whose event is **not canceled** appear ([Spec 02 §2.7](./02-Domain-Model-and-Scoring.md)); a canceled event's rounds are omitted, consistent with their zero-everywhere treatment.

## 5.4 Filters

Three filter dimensions sit above the view. **Sub-league and event-type are shareable URL state** (query params — §5.7); **name search** is the client-side roster filter (§5.2).

- **Sub-league:** **All** / Early / Mid / Late. Default **All**.
- **Event type:** default scope is **League Nights** only (Core Feature 2 says "league rounds"). Toggles let the viewer **add Tournament and FOD Open** rounds. (Podium is never a row — the Podium bonus is a computed standings bonus, not an ingested round, [Spec 02 §2.4.1](./02-Domain-Model-and-Scoring.md#241-league-podium--computed-bonus).)
- **Name:** client-side search (§5.2), roster list only.

**Sub-league × event-type interaction.** Tournaments and the FOD Open belong to **no sub-league**. Therefore:

- Under **sub-league = All**, the event-type toggles govern which types appear (League Nights always; Tournament / FOD Open when toggled on).
- When a **specific sub-league** (Early / Mid / Late) is selected, the view is inherently scoped to **that sub-league's League Nights**; Tournament / FOD Open rounds cannot appear, so those toggles are disabled/hidden while a specific sub-league is active. Clearing back to **All** restores them.

Filters apply consistently to **both** entry points: on the roster list they change the **Rounds** count and **trend** per holder; on the per-player table they change which rounds are listed. The profile ([Spec 08 §8.5](./08-Feature-Player-Profiles.md#85-sub-league-context-on-the-profile)) uses its own sub-league selector for the compact rounds summary; the full table at `/players/{slug}/rounds` inherits `?league` / `?types` as above.

The **default** all-players view (`/2026/rounds`, no params) is **All sub-leagues, League Nights only**.

## 5.5 Ratings

- **Present rating** is the holder's current **official** PDGA rating — the latest `ratings_history` official row as of the most recent refresh ([Spec 02 §2.2](./02-Domain-Model-and-Scoring.md#22-pools--eligibility)). It is the eligibility-relevant number, so it is deliberately the **official** value, never a live per-round rating.
- **Unrated holders** (no PDGA membership / no official rating on file) show **"—" (Unrated)** for present rating — the app never invents a number and never silently substitutes a live rating here.
- **Round ratings** are per-round as reported by PDGA and are stored **unofficial** ([Spec 03 §3.2](./03-Data-Ingestion-and-PDGA.md#32-data-the-app-pulls-from-pdga-per-configured-event)). Where a round rating is displayed, it is presented as the round's own rating; the view does not relabel each cell, but the surrounding context (present = official; per-round = as-played) matches [Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution) "Ratings usage."
- If PDGA has ingested a round but **not yet rated** it, show **"pending"** rather than blank/zero. (A round still in progress — `roundFinal = false` — is likewise shown without a fabricated rating.)
- **Rating trend** is a **sparkline of the holder's round ratings** over the rounds in scope, ordered by event date. It reflects the active filters (§5.4). It is a **form** indicator; the prominent present rating remains the official number shown separately.
  - **Accessibility** ([Spec 11](./11-UX-and-Nonfunctional.md)): the sparkline carries a text alternative (e.g. an `aria-label` summarizing first→last and count, and/or a visually-hidden numeric list of the plotted ratings) so it is not the sole carrier of the information. It degrades to nothing (not a broken chart) when there are <2 rated rounds.
- Ratings context feeds eligibility ([Spec 02 §2.2](./02-Domain-Model-and-Scoring.md#22-pools--eligibility)); this view is the human-readable window into that data but **does not itself gate anything**.

## 5.6 States

- Only **tag holders** are listed. Non-tag-holder rounds are **hidden** — they exist in the ingested data only to compute finish order ([Spec 03 §3.5](./03-Data-Ingestion-and-PDGA.md#35-player-matching-admin-maps-app-assists)).
- **Empty / pre-season:** before any rounds, show the roster with 0 rounds and no trend (present rating shown if known), **not** an error — mirroring [Spec 04 §4.4](./04-Feature-Leaderboards.md#44-states). A holder with no rounds in the active scope shows a **0 count** and an empty per-player table with a friendly "No rounds yet for this filter" note.
- **Freshness / stale:** every view shows "Updated {time} ET" and a **stale** badge when the underlying sources are stale, exactly as [Spec 04 §4.4](./04-Feature-Leaderboards.md#44-states) / [Spec 03 §3.8](./03-Data-Ingestion-and-PDGA.md#38-resilience--failure-handling). Staleness is scoped to the sources in view (a specific sub-league reflects only that source's staleness; All reflects any).
- **Data-quality banner:** unmatched PDGA entrants do **not** appear as phantom players — they wait in the admin queue; a non-alarming "N results pending review" note appears as elsewhere ([Spec 04 §4.4](./04-Feature-Leaderboards.md#44-states)).

## 5.7 Deep links

Stable, shareable URLs. Sub-league and event-type are **query params**; the per-player table is a **path**. Name search is mirrored to `?q=` on the roster list.

| URL | View |
|---|---|
| `/2026/rounds` | All-players roster list — **All sub-leagues, League Nights** (default) |
| `/2026/rounds?league=early` | Roster list scoped to Early's League Nights |
| `/2026/rounds?types=ln,tournament,fodopen` | Roster list, All sub-leagues, League Nights + Tournaments + FOD Open |
| `/2026/rounds?league=mid&q=smith` | Roster list, Mid, name search "smith" |
| `/2026/players/{slug}/rounds` | One player's rounds table (inherits `?league`/`?types`) |

- `league` ∈ `early` \| `mid` \| `late` (absent = All). `types` is a comma list drawn from `ln` \| `tournament` \| `fodopen` (absent = `ln`); `types` is ignored when `league` names a specific sub-league (§5.4). `q` is the client-side name query.
- Deep links **restore filter state** on load; the controls reflect the URL (selected sub-league / active type toggles pressed).
- Player identity is the **slug**, reused from the profile route ([Spec 08](./08-Feature-Player-Profiles.md)); the roster row index (§5.2) is never a link identity.

## Acceptance criteria

- **Roster list:** `/2026/rounds` lists every active tag holder once, ordered by present rating desc (unrated last, tag-number tie-break), each with tag #, present rating (or "—/Unrated"), a round count, and a round-rating sparkline; tapping a row deep-links to that player's rounds.
- **Per-player rounds:** a holder's rounds table matches the PDGA source for the configured events, newest first, with correct sub-league attribution, score to par, and round rating; the present rating matches the latest refresh's official value.
- **Unrated / pending:** a holder with no official rating shows "—/Unrated"; a round PDGA has not yet rated shows "pending" (never blank/zero); a holder with <2 rated rounds shows no sparkline (no broken chart).
- **Filters:** the sub-league filter correctly partitions rounds across the 3 separate PDGA events; the event-type filter defaults to League Nights and adds Tournament / FOD Open when toggled; selecting a specific sub-league disables the Tournament/FOD Open toggles and shows only that sub-league's League Nights; filters change both the roster aggregates and the per-player list.
- **Search:** the roster name search narrows visible rows client-side without refetch and clears back to the full list; a non-matching query shows the no-match message.
- **Deep links:** `?league`, `?types`, and `?q` restore the exact view; the per-player path inherits `?league`/`?types`; the profile compact summary follows its sub-league selector ([Spec 08 §8.5](./08-Feature-Player-Profiles.md#85-sub-league-context-on-the-profile)).
- **States:** only tag holders appear; pre-season shows the roster at 0 rounds, not an error; stale and pending-review conditions render their banners as in [Spec 04](./04-Feature-Leaderboards.md#44-states).
- **Accessibility:** the sparkline has a non-visual text alternative and is never the sole carrier of the trend information.

← Prev: [04 — Leaderboards](./04-Feature-Leaderboards.md) · Next: [06 — OLP Pot](./06-Feature-OLP-Pot.md)
