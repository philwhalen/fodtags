# 02 — Domain Model & Scoring

← [Master Spec](./00-Master-Spec.md)

## Purpose

This is the **computation contract**. Because the app computes everything ([Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution)), the rules below must be implemented faithfully and be independently testable. Every rule cites the league [rules doc](https://docs.google.com/document/d/1wegvE6lmUqf7xBVxYSqp25DBvEJtEh82uBhpfH28lwE/edit). Where the rules leave judgment to directors, the app defers to admin-entered data rather than guessing.

## 2.1 Core entities

- **Player** — a person; may have a PDGA number and rating. Not all PDGA entrants are players in our sense.
- **TagHolder** — a Player who bought a tag: `{ player, tagNumber, pool, entryDate, pdgaNumber, ratingAtEntry, active }`.
- **Season** — `{ year, subLeagues[], tournaments[], fodOpen }`. Launch: 2026.
- **SubLeague** — `{ name: Early|Mid|Late, pdgaEventId, leagueNights[], podium }`.
- **Event** — a scored competition instance with a `type ∈ {LeagueNight, Podium, Tournament, FODOpen}` and results.
- **Result** — `{ event, tagHolder, rawScoreToPar, roundRating, finishPosition, pointsAwarded }`.

## 2.2 Pools & eligibility

- **Pool A**: open to anyone.
- **Pool B**: only players **<900 rated at the time of their first entered league round**.
- Players may pick a pool at tag purchase; unspecified → placed in the **lowest pool they're eligible for**; unrated → placed by directors (admin input).
- A player may **earn Pool B points only while their rating is <920**. Above that, Pool B results stop accruing.
- Only players rated **≤920** are eligible for the Pool B skins match.
- **Pool switches** forfeit all points earned before the switch and require director approval (admin action; see [Spec 10](./10-Admin-Console.md)).

> The app must therefore evaluate rating **as of a point in time**, not just "current rating." **Eligibility thresholds (900 at entry, 920 for Pool B accrual/skins) use official PDGA player ratings**, which publish monthly (2nd Tuesday — [Spec 03 §3.1](./03-Data-Ingestion-and-PDGA.md#31-known-constraint-pdga-blocks-naive-clients-and-has-no-open-api)). Rating history per player is retained so the app can read the official rating in effect on any given date. Live per-round ratings are unofficial and are **not** used for eligibility.

## 2.3 Entry & eligibility timing

- A player is entered on their **tag purchase date**. **No finish before that date earns points.**
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
- **All finishes are ranked per-pool** (decided with the league). This applies to **every** event type — League Nights, League Podiums, Tournaments, and the FOD Open: Pool A and Pool B each have their own 1st place and each earn the full points for that place. A player's finish is computed only against the other tag holders **in their own pool** at that event.

## 2.5 "Top-N counts" aggregation

A player's Championship total is **not** the raw sum of all results. Each event type contributes only a player's best N:

- **League Nights:** best **15** finishes count toward the Championship total.
- **Tournaments (excluding FOD Open):** best **2** finishes if there are **≤3** sanctioned FOD tournaments in the Season; best **3** if there are **≥4**. The cap is derived from the count of tournament event sources registered for the Season ([Spec 03 §3.4](./03-Data-Ingestion-and-PDGA.md#34-event-registration-model)); it **recomputes if that count crosses the 3→4 boundary** mid-season and is final at Season end.
- **League Podium:** all podium finishes count (up to 3 sub-leagues).
- **FOD Open:** the single result counts.

> The score sheet ([Spec 07](./07-Feature-Pool-Score-Sheets.md)) must show which results **counted** vs were **dropped** by these caps.

## 2.6 Tie-breakers

- League Night, Podium, and Overall ties → **low tag number wins**, evaluated:
  - League Night ties: tag number **going into that night**.
  - Podium ties: tag number **upon sub-league completion**.
  - Overall ties: tag number **upon the last League Night of the Season**.
- Tournament **1st-place** ties → broken by **playoff** when possible; all other tournament ties → tag number.

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

## Acceptance criteria

- Given a fixture set of PDGA results + roster + admin flags, the engine reproduces Championship totals, per-pool ranks, podium bonuses, OLP scores, and skins qualification, all matching hand calculations.
- The two OLP worked examples above compute to 81.3 and 81.4 exactly.
- Dropped results (beyond top-N caps) are identifiable in output.
- A canceled League Night contributes zero points everywhere (including OLP round counts).
- Rating-as-of-date logic correctly gates Pool B accrual at 920.

## Resolved decisions

- **Ranking scope** → **per pool for every event type** (League Night, Podium, Tournament, FOD Open). See [§2.4](#24-points--table-21).
- **OLP average score-to-par** → mean of played rounds' strokes-to-par; canceled/absent rounds excluded; one-decimal display. See [§2.8](#28-overall-league-performance-olp).
- **Rating source for eligibility** → **official monthly PDGA ratings**, read as-of-date; live round ratings are unofficial and never gate eligibility. See [§2.2](#22-pools--eligibility).
- **Tournament count threshold** → derived from registered tournament event sources; recomputes across the 3→4 boundary mid-season; final at Season end. See [§2.5](#25-top-n-counts-aggregation).
- **OLP payout rounding** → largest-remainder so payouts sum to the pot. See [§2.8](#28-overall-league-performance-olp).

## Remaining open questions

- Confirm that "strokes-to-par" uses the course par as PDGA reports it per round (edge case: mixed layouts within a sub-league).
- If a player's official rating updates mid-sub-league, the OLP "rating on last day" naturally uses the latest official value — confirm no snapshotting of an earlier value is expected.

← [Master Spec](./00-Master-Spec.md) · Next: [03 — Data Ingestion](./03-Data-Ingestion-and-PDGA.md)
