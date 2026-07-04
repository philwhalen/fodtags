# 04 — Pure Engine

**Goal:** Establish `src/server/engine/` as a **pure** module and land exactly two functions the skeleton needs: `computeStandings` (drives the empty-roster page) and `olpScore` (proves purity + testability via the 81.3/81.4 fixtures). No full scoring — that arrives with Spec 02's feature work.

**Spec refs:** §12.1 (purity), §12.11; [Spec 02 §2.8](../../specs/02-Domain-Model-and-Scoring.md) (OLP), [Spec 04 §4.2](../../specs/04-Feature-Leaderboards.md) (columns). **Depends on:** 01.

## Purity contract (enforce, don't just intend)

`src/server/engine/` imports **nothing** from `db`, `ingestion`, `readmodel`, Next.js, `node:*` I/O, or a clock. Inputs are plain objects; outputs are plain objects. Types come from `src/lib/` or are engine-local. A lint boundary rule (or a test that greps imports) is worth adding but optional for the skeleton.

## `olpScore` — the testable nucleus

Signature (plain inputs → number):

```ts
interface OlpInput {
  ratingOnLastDay: number;   // official PDGA rating
  avgScoreToPar: number;     // mean strokes-to-par over played rounds
  roundsPlayed: number;
  leagueNightPoolWins: number;
}
function olpScore(i: OlpInput): number; // = 0.10*rating + avg − rounds − wins
```

- Carry internal precision; the **displayed** value rounds to one decimal. Decide where rounding lives (return raw number; round at the read-model/UI edge) and document it.
- **Must reproduce exactly** ([Spec 02 §2.8]):
  - `{1000-ish→} rating 853, avg +5, rounds 7, wins 2 → 81.3` (`85.3 + 5 − 7 − 2`)
  - `rating 937, avg −3.3, rounds 6, wins 3 → 81.4` (`93.7 − 3.3 − 6 − 3`)
- Watch float precision: `85.3 + 5 - 7 - 2` etc. Assert with a tolerance or round-to-1-decimal in the test (the test lives in [10]; the function lives here).

## `computeStandings` — drives the page

Minimal, but real (pure) so the read model has something to materialize:

```ts
interface StandingsInput {
  holders: { id; name; tagNumber; pool: 'A'|'B'; }[];
  results: [];                // empty in the skeleton
}
interface StandingRow { rank: number; playerId; name; tagNumber; points: number; pool: 'A'|'B'; }
function computeStandings(i: StandingsInput): { poolA: StandingRow[]; poolB: StandingRow[]; };
```

Skeleton behavior: every holder at **0 points**, split by pool, ranked by **ascending tag number** (the [Spec 02 §2.6] tie-break — low tag wins — which at 0 points fully determines order). This is the pre-season empty state ([Spec 04 §4.4]).

## Shared types — `src/lib/`

Put `Pool`, `StandingRow`, and the OLP types in `src/lib/` so both engine and UI share them without the UI importing server code.

## Done when

- `olpScore` and `computeStandings` exist, are pure, and are import-clean of DB/IO.
- (Test asserting 81.3/81.4 is written in [10] but the signature here supports it.)
