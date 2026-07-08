# 02 — Domain Model & Scoring

← [Master Spec](./00-Master-Spec.md)

## Purpose

This is the **computation contract**. Because the app computes everything ([Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution)), the rules below must be implemented faithfully and be independently testable. Every rule cites the league [rules doc](https://docs.google.com/document/d/1wegvE6lmUqf7xBVxYSqp25DBvEJtEh82uBhpfH28lwE/edit). Where the rules leave judgment to directors, the app defers to admin-entered data rather than guessing.

## 2.1 Core entities

- **Player** — a person; may have a PDGA number and rating. Not all PDGA entrants are players in our sense.
- **TagHolder** — a Player who holds (or is provisionally recorded as holding) a tag: `{ player, initialTagNumber, tagNumber (current), pool, entryDate, pdgaNumber, ratingAtEntry, active, confirmed }`. Tags are **reassigned every League Night** ([§2.10](#210-tag-numbers--nightly-reassignment)), so a holder carries both an **`initialTagNumber`** — the tag assigned when they buy in, the **admin-editable** value — and a **current `tagNumber`** — their most recent tag-out, the number shown across the app. Both are **nullable**: a holder **auto-added** from the PDGA scrape ([Spec 03 §3.5](./03-Data-Ingestion-and-PDGA.md#35-player-matching--auto-add-app-bootstraps-admin-confirms)) holds **no** tag until a director assigns one, and sorts last in tie-breaks ([§2.6](#26-tie-breakers)) until then. `confirmed` distinguishes a director-**confirmed** holder from an auto-added **provisional** one (`confirmed = false`); provisional holders still score but carry a "pending confirmation" marker until reviewed.
- **Season** — `{ year, subLeagues[], tournaments[], fodOpen }`. Launch: 2026.
- **SubLeague** — `{ name: Early|Mid|Late, pdgaEventId, startDate, endDate, complete, leagueNights[], podium }`. `startDate`/`endDate` are **admin-configured** — they bound the sub-league window and fix the OLP "last day"; `complete` is an **admin flag** a director sets to finalize the sub-league (folds in the Podium bonus, flips OLP payouts to final). See [Spec 10 §10.3](./10-Admin-Console.md#103-pdga-event-configuration).
- **Event** — a scored competition instance with a `type ∈ {LeagueNight, Podium, Tournament, FODOpen}` and results. **One PDGA round within a sub-league's event = one League Night.** The **Podium is computed** from the sub-league's standings (§2.4.1), not ingested as its own PDGA event.
- **Result** — `{ event, tagHolder, rawScoreToPar, roundRating, finishPosition, pointsAwarded }`.
- **TagAssignment** — the per-holder, per-League-Night tag record that backs [§2.10](#210-tag-numbers--nightly-reassignment): `{ leagueNight, tagHolder, tagIn, tagOut, source: computed | override }`. The season-long sequence of these rows is the tag **history**; a holder's latest `tagOut` is their current `tagNumber`.

## 2.2 Pools & eligibility

- **Pool A**: open to anyone.
- **Pool B**: only players **<900 rated at the time of their first entered league round**.
- Players may pick a pool at tag purchase; unspecified → placed in the **lowest pool they're eligible for**; unrated → placed by directors (admin input).
- **Auto-added (provisional) holders default to Pool A** regardless of rating ([Spec 03 §3.5](./03-Data-Ingestion-and-PDGA.md#35-player-matching--auto-add-app-bootstraps-admin-confirms)) — the conservative default (Pool A is open to anyone and never wrongly grants Pool B points). A director assigns Pool B on confirmation when appropriate, subject to the <900-at-first-entry rule above (and the [Spec 10 §10.2](./10-Admin-Console.md#102-roster--tag-management) warning).
- A player may **earn Pool B points only while their rating is <920**. Above that, Pool B results stop accruing.
- Only players rated **≤920** are eligible for the Pool B skins match.
- **Pool switches** forfeit all points earned before the switch and require director approval (admin action; see [Spec 10](./10-Admin-Console.md)).

> The app must therefore evaluate rating **as of a point in time**, not just "current rating." **Eligibility thresholds (900 at entry, 920 for Pool B accrual/skins) use official PDGA player ratings**, which publish monthly (2nd Tuesday — [Spec 03 §3.1](./03-Data-Ingestion-and-PDGA.md#31-known-constraint-pdga-blocks-naive-clients-and-has-no-open-api)). Rating history per player is retained so the app can read the official rating in effect on any given date. Live per-round ratings are unofficial and are **not** used for eligibility.

## 2.3 Entry & eligibility timing

- A player is entered on their **tag purchase date**. **No finish before that date earns points.**
- An **auto-added (provisional) holder** is provisionally entered on the date of their **first ingested league round** ([Spec 03 §3.5](./03-Data-Ingestion-and-PDGA.md#35-player-matching--auto-add-app-bootstraps-admin-confirms)), so all of their observed rounds score. A director corrects this to the true purchase date on confirmation if it was later.
- A finish **on the purchase date** counts (even if the tag was bought after the event finished).
- The "end" of a sub-league is its **last League Night**; a tag bought that day is still eligible for that sub-league's Podium bonus.
- Only results where the holder's **tag was physically present** (able to be won/lost) earn points. This is an admin-confirmable attribute per result when it deviates from default.

## 2.4 Points — Table 2.1

Points by finishing position **among tag holders only** (non-tag-holders are skipped when ranking):

| Place | League Night | League Podium | Tournament | FOD Open |
|---:|---:|---:|---:|---:|
| 1 | 100 | 150 | 150 | 250 |
| 2 | 60 | 100 | 100 | 180 |
| 3 | 35 | 50 | 70 | 150 |
| 4 | 20 | — | 50 | 120 |
| 5 | 10 | — | 35 | 100 |
| 6 | — | — | 25 | 80 |
| 7 | — | — | 20 | 65 |
| 8 | — | — | 15 | 50 |
| 9 | — | — | 10 | 40 |
| 10 | — | — | 5 | 30 |
| 11–15 | — | — | — | 25 / 20 / 15 / 10 / 5 |

Rules for awarding:
- **Finish position is computed among tag holders present**, ignoring non-tag-holders. (The top tag holder gets 1st even if 3 non-holders beat them.)
- Points are awarded **regardless of attendance count**, as long as the event isn't canceled (3 attendees → top-3 points).
- **All finishes are ranked per-pool.** This applies to **every** event type — League Nights, League Podiums, Tournaments, and the FOD Open: Pool A and Pool B each have their own 1st place and each earn the full points for that place. A player's finish is computed only against the other tag holders **in their own pool** at that event.

## 2.4.1 League Podium — computed bonus

The **Podium is not a PDGA source**; it is **computed** when a director marks the sub-league **complete** ([Spec 10 §10.3](./10-Admin-Console.md#103-pdga-event-configuration)):

- Rank tag holders **per pool** by their **accumulated League-Night points within that sub-league**. **All** of the sub-league's League Nights count toward this ranking — the season-wide best-15 cap (§2.5) is a **Championship** aggregation and does **not** apply within a single sub-league.
- Award **League Podium** points (Table 2.1: 1st 150 / 2nd 100 / 3rd 50) to the **top 3 in each pool**.
- Ties are broken by **tag number upon sub-league completion** (§2.6).
- While the sub-league is in progress the Podium is **projected**; it becomes **final** (and its points enter the Championship total) once the sub-league is marked complete ([Spec 04 §4.3](./04-Feature-Leaderboards.md#43-sub-league-leaderboard-content)).

## 2.5 "Top-N counts" aggregation

A player's Championship total is **not** the raw sum of all results. Each event type contributes only a player's best N:

- **League Nights:** best **15** finishes count toward the Championship total.
- **Tournaments (excluding FOD Open):** best **2** finishes if there are **≤3** sanctioned FOD tournaments in the Season; best **3** if there are **≥4**. The cap is derived from the count of tournament event sources registered for the Season ([Spec 03 §3.4](./03-Data-Ingestion-and-PDGA.md#34-event-registration-model)); it **recomputes if that count crosses the 3→4 boundary** mid-season and is final at Season end.
- **League Podium:** all podium finishes count (up to 3 sub-leagues). Each sub-league yields **one computed Podium result per pool per holder** (§2.4.1).
- **FOD Open:** the single result counts.

> The score sheet ([Spec 07](./07-Feature-Pool-Score-Sheets.md)) must show which results **counted** vs were **dropped** by these caps.

## 2.6 Tie-breakers

Because tags are reassigned nightly ([§2.10](#210-tag-numbers--nightly-reassignment)), every tag-number tie-break reads the tag **in effect at the relevant moment**, not a fixed roster number:

- League Night, Podium, and Overall ties → **low tag number wins**, evaluated:
  - League Night ties: each holder's **tag-in** for that night — the tag they held **going into that night** (§2.10).
  - Podium ties: each holder's **tag as of sub-league completion** (§2.10) — their tag-out from the last night on or before the sub-league's end date.
  - Overall ties: each holder's **tag as of the last League Night of the Season** (§2.10) — i.e. their **current tag**.
- Tournament **1st-place** ties → broken by **playoff** when possible; all other tournament ties → each holder's **tag as of the tournament date** (§2.10).
- **OLP** ties ([§2.8](#28-overall-league-performance-olp)) → each holder's **tag as of the sub-league's last day** (§2.10), consistent with the Podium.
- **Unassigned tag number:** a holder holding **no tag** in effect at the relevant moment (an auto-added holder not yet assigned one — §2.1/§2.10) **sorts after all numbered holders** in any tag-number tie-break (a lower number always wins, and "no number" is treated as the highest); ties among multiple tagless holders resolve by **holder ID (creation order)**. Once the holder holds a real tag, normal low-number-wins ordering applies.

## 2.7 Cancellations & partial events

- A League Night is **canceled** if **≤2 players attend** → **no points** awarded for it, regardless of standings.
- A **shortened** event (e.g., a tournament cut to 1 round) still awards **normal points** if it is not declared canceled.
- Canceling a League Night does **not** cancel the sub-league.
- Cancellation status is an admin-set flag on an event ([Spec 10](./10-Admin-Console.md)).

## 2.8 Overall League Performance (OLP)

A separate competition, computed **per sub-league**, entered by **every** tag holder in both pools. **PDGA membership required.**

**Score (lower is better) =**

```
0.10 × (PDGA player rating on the sub-league's last day)
+ (average score-to-par across all league rounds played in that sub-league)
− (number of league rounds played in that sub-league)
− (number of League-Night first-place pool finishes in that sub-league)
```

- Minimum **4 rounds played** to be eligible for the OLP podium.
- **"Average score-to-par"** = the mean of each played league round's strokes-relative-to-par in that sub-league. **Canceled rounds and rounds not played are excluded** from both the average and the round count ([§2.7](#27-cancellations--partial-events)). Carry internal precision and display to **one decimal** (matching the worked examples).
- Worked examples from the rules (must match to the tenth):
  - 853 rated, +5 avg over 7 rounds, 2 Pool-B wins → `85.3 + 5 − 7 − 2 = 81.3`
  - 937 rated, −3.3 avg over 6 rounds, 3 Pool-A wins → `93.7 − 3.3 − 6 − 3 = 81.4`
- Payout: per sub-league OLP pot, **1st 50% / 2nd 30% / 3rd 20%**, rounded to whole dollars using **largest-remainder** so the three payouts **sum exactly to the pot** ("rounded as best as possible"). (Financial side in [Spec 09](./09-Financials.md).)

## 2.9 Skins match qualification

- End-of-year skins match (10/3): **top 4 point earners per pool** qualify.
- If a qualifier can't attend, their slot passes to the **next-highest available** earner in that pool.
- Pool B skins participation requires rating **≤920**.
- The app computes/*displays* qualification order; it does not run the match. (Purse math in [Spec 09](./09-Financials.md).)

## 2.10 Tag numbers & nightly reassignment

Tag numbers are **not static**. They are **physical numbered tags** that circulate among holders: each League Night the tags in play are pooled and **re-handed-out by finishing order**. The app therefore models a tag number **as of a point in time**, exactly as it does pool and rating ([§2.2](#22-pools--eligibility)), and every tie-break in [§2.6](#26-tie-breakers) reads the tag in effect at the relevant moment rather than a fixed roster number.

### The physical mechanic

- Each holder holds one numbered tag. The **initial tag** is the number assigned when the holder buys in (admin input; §2.1). A holder auto-added from the scrape holds **no** physical tag until a director assigns one.
- On a League Night, every holder **present with their tag** returns it to a **single combined pool** — **Pool A and Pool B tags in one pile** (the reshuffle is league-wide, not per-pool).
- After play, the returned tags are handed back in **finishing order across the whole field**: the **lowest raw score** takes the **lowest-numbered tag in the pile**, the next-lowest score the next-lowest tag, and so on down the returned pile. Round-score ties are broken by **who held the lower tag going into that night** (the start-of-round tag — i.e. §2.6's "tag number going into that night").
- The sequence is **season-wide and continuous**: it runs across Early → Mid → Late in night order; the tag a holder leaves one night with is the tag they bring to their next night.

### Definitions (used by §2.6)

- **tag-in** (of a holder, for a night) — the tag they hold **going into** that night: their most recent **tag-out** from a prior night they participated in, or their **initial tag** if this is their first participation.
- **tag-out** (of a holder, for a night) — the tag they hold **after** that night's reassignment.
- **current tag** — a holder's most recent **tag-out** across the Season (their tag-in for the next night). This is the number shown as "tag #" on the roster, standings, profiles, score sheet, etc.
- **tag as of date D** — the holder's tag-out from the latest night **on or before D**, else their initial tag. (Podium, Overall, Tournament, and OLP tie-breaks in §2.6 use this.)

### Reassignment ranking vs points ranking

The reassignment order is the **combined-field** finish order (both pools together, by raw score, tie-broken by tag-in) — **distinct** from the **per-pool** ranking that awards points ([§2.4](#24-points--table-21)). A player can win their pool for points yet not receive the lowest tag, because a lower-scoring player in the other pool takes it first. The returned pile is exactly the multiset of the participating holders' tag-ins, so a night's tag-outs are always a **permutation** of that night's tag-ins.

### Computed, with override

- The engine **computes** each night's reassignment deterministically from that night's scores + tag-ins. This is the default and is what makes the timeline independently testable.
- A director may **override** a night's handout to record **what physically happened** — a mix-up, someone leaving early, or **seeding the real historical tag→holder record** ([Spec 10 §10.9](./10-Admin-Console.md#109-tag-assignments--history)). An override fixes specific holders' tag-outs for that night; a night's tag-outs must remain a **valid permutation** of that night's tag-ins (every returned tag handed out exactly once). Overrides are audited and win over the computed value.

### Who is in the pile

- **Absent** holders (no result that night) are **not** in the pile; their tag is unchanged (tag-out = tag-in).
- A holder whose **tag was not present** (`tagPresent = false`, [§2.3](#23-entry--eligibility-timing)) is **not** in the pile — a tag that isn't there can't be returned or won; their tag is unchanged that night.
- **Non-tag-holders** never hold a league tag and never affect reassignment (as with points, §2.4).
- A **provisional** holder with **no initial tag** (§2.1) holds no physical tag: they are not in the pile and **sort last** in tie-breaks (§2.6) until a director assigns one, from which point they enter the sequence.

### Edge cases

- **Cancelled night** (≤2 attendees / admin-canceled, [§2.7](#27-cancellations--partial-events)): **no reassignment** — every holder's tag is unchanged. *(A director may still record an override if a reshuffle physically occurred.)*
- **Mid-season buy-in:** a newly sold tag is a **new number**, effective the holder's entry date; it enters the pile from that holder's first participating night.
- **Multiple nights on one date:** nights are ordered by **(date, then round ordinal)** so the sequence is well-defined; sub-leagues do not overlap in time, so cross-sub-league order is simply by date.

## Acceptance criteria

- Given a fixture set of PDGA results + roster + admin flags, the engine reproduces Championship totals, per-pool ranks, podium bonuses, OLP scores, and skins qualification, all matching hand calculations.
- Given initial tags + nightly scores, the engine reproduces each holder's **tag-in/tag-out per League Night** (combined-pool, lowest-score-takes-lowest-tag, ties broken by tag-in), and each holder's **current tag equals their latest tag-out**.
- A director **override** of a night's handout wins over the computed reassignment and is rejected unless the night's tag-outs remain a valid permutation of that night's tag-ins.
- Tie-breaks resolve on the correct **as-of** tag: League Night on tag-in, Podium on the completion-date tag, Overall/Championship on the current tag.
- A **canceled** night performs no reassignment; **absent** and **tag-not-present** holders keep their tag across that night.
- The two OLP worked examples above compute to 81.3 and 81.4 exactly.
- Dropped results (beyond top-N caps) are identifiable in output.
- A canceled League Night contributes zero points everywhere (including OLP round counts).
- Rating-as-of-date logic correctly gates Pool B accrual at 920.

← [Master Spec](./00-Master-Spec.md) · Next: [03 — Data Ingestion](./03-Data-Ingestion-and-PDGA.md)
