# 01 — Product Overview & Glossary

← [Master Spec](./00-Master-Spec.md)

## Purpose

Establish shared vocabulary. The league's own documents overload the words "league" and "season," which caused the ambiguity resolved in [Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution). Every other spec uses the terms exactly as defined here.

## The competition hierarchy

```
Club Championship (one per calendar year — the "Season")
├── Sub-league: EARLY   (a PDGA-sanctioned league = 1 PDGA event)
│   └── League Nights (weekly Thursday rounds)
├── Sub-league: MID     (1 PDGA event)
│   └── League Nights
├── Sub-league: LATE    (1 PDGA event)
│   └── League Nights
├── FOD PDGA Tournaments (0+ sanctioned events at FOD during the season)
└── The FOD Open (one 4-round tournament)
```

- A **Season** = one calendar year's Club Championship (2026 at launch). Points reset each Season.
- Within a Season there are **3 Sub-leagues** — Early, Mid, Late — each registered as its own PDGA event with its own weekly **League Nights** and its own final **Podium**.
- The Season also includes **FOD Tournaments** and the **FOD Open**, which contribute Championship points but are not sub-leagues.

## Glossary

| Term | Meaning |
|---|---|
| **Season** | One year's Club Championship. Launch = 2026. |
| **Sub-league (Early / Mid / Late)** | A PDGA-sanctioned league segment; one PDGA event ID; a run of weekly League Nights ending in a Podium. In UI, the "current season" leaderboard toggle shows the active sub-league. |
| **League Night** | One weekly Thursday round within a sub-league. ~29 across the Season. |
| **Championship (Overall) standings** | A player's total points across all event types in the Season, ranked within their pool. The default leaderboard. |
| **Pool A / Pool B** | Competitive tiers. Pool A open to all; Pool B for players <900 rated at entry (see [Spec 02](./02-Domain-Model-and-Scoring.md)). |
| **Tag holder** | A player who has bought a tag ($20) and is entered in the competition. **Only tag holders earn points.** |
| **Tag number** | Each holder's tag; low tag number is the universal tie-breaker. |
| **Points** | Championship currency awarded by finish position per Table 2.1 ([Spec 02](./02-Domain-Model-and-Scoring.md)). |
| **Podium** | The final top-3 of a sub-league; awards League Podium bonus points. |
| **OLP (Overall League Performance)** | A separate, lowest-score-wins competition per sub-league that pays a cash pot to its top 3 ([Spec 06](./06-Feature-OLP-Pot.md)). |
| **Skins match** | End-of-year (10/3) cash event for the top 4 point earners in each pool. |
| **Ace pot** | Running pot paid on aces at League Nights; uncapped for tag holders. |
| **Expense reserves** | League operating fund (PDGA fees, trophies, CTPs, contingencies). |
| **CTP** | Closest-to-pin side game; two $20 CTPs per League Night (one per pool), free entry for tag holders. |
| **Round rating** | PDGA's rating for a single round's score. |
| **Player rating** | A player's current official PDGA rating. |

## Product principles

1. **Explain the number.** Every standing, pot position, and payout should be traceable to the rounds and rules that produced it. The app earns trust by showing its work (see the score sheet, [Spec 07](./07-Feature-Pool-Score-Sheets.md)).
2. **Read-only to the public, honest about freshness.** Every computed view shows a "last updated" timestamp and data provenance.
3. **Mobile first.** The primary moment of use is a phone at the course.
4. **Degrade gracefully.** If PDGA is unreachable or a player is unmatched, show the last good data and surface the gap rather than showing wrong numbers.

## Related

- Rules encoded in [Spec 02 — Domain Model & Scoring](./02-Domain-Model-and-Scoring.md).
- Personas summarized in [Master §3](./00-Master-Spec.md#3-audience--personas).
