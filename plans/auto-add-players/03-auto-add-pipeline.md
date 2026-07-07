# 03 — Auto-add in the ingestion pipeline

**Goal:** on refresh, turn a brand-new entrant (PDGA #, zero holder matches by number **and** name) into a provisional tag holder, attribute their rounds, and make it sticky — without duplicating across sources in the same run.

Depends on: 01 (insert path), 02 (null-tag flows to read model cleanly). Blocks: 06.

## `match.ts` — classify, don't create

- Add `autoAdds: AutoAddCandidate[]` to `MatchResult`, where `AutoAddCandidate = { entrant: NormalizedEntrantResult; pdgaNumber: number }`.
- The current `no-name-match` branch (entrant has a PDGA #, zero name hits) now pushes to `autoAdds` instead of `unmatched`.
- `unmatched` narrows to `ambiguous` (2+ name hits) and `no-pdga-number-match` (no PDGA #) only. `match()` stays pure — it emits candidates; the pipeline creates.
- Update `match.test.ts`: no-name-match→`autoAdds`; ambiguous & no-pdga→`unmatched`; sticky/PDGA-hit/unique-name unchanged.

## Pipeline (`pipeline.ts`) — create provisional holders

New helper (server-only, in ingestion layer — **not** the engine), e.g. `createProvisionalHolders(...)` called per source **after** `match()` and **before** `persistEvent()`:

1. **Dedupe candidates by PDGA #** (an entrant appears in every round). Skip a PDGA # that is already a holder (in the in-run `holders` list) or already in `stickyMap` — defensive; `match()` shouldn't emit those, but the guard makes re-runs safe.
2. **Seed each provisional holder** from the scrape:
   - `name` = entrant `displayName`; `pdgaNumber`; `pool = "A"`; `confirmed = false`; `pdgaMembership = true`.
   - `entryDate` = **earliest `round.eventDate`** across this source's rounds where that PDGA # appears (iterate `normalized.rounds`, not the flattened entrants, to get dates).
   - `ratingAtEntry` = the entrant's reported player rating (`playerRatingReported`) from its earliest appearance, or `null` if unrated.
   - `tagNumber = null`.
   - Insert via `insertHolder` (01).
3. **Attribute results:** for **every** entrant object (across all rounds) whose PDGA # was just created, push `{ holderId, entrant }` into `matchResult.matched` so `persistEvent` writes the holderId. (Persist keys by entrant object identity — decision recorded in master.)
4. **Sticky + audit:** `upsertMatch({ pdgaNumber, holderId, source: "auto", decidedBy: "auto" })` and `recordAudit({ actorEmail: "system", action: "auto_add", entityType: "tag_holder", entityId, after })`.
5. **Inject into the in-run state — the duplicate-across-sources fix:** push the new holder into the local `holders: MatchableHolder[]` array **and** `stickyMap.set(pdgaNumber, { holderId, source: "auto" })`, so a later source in the *same* run auto-links this player (PDGA-# hit) instead of auto-adding a second record. This is the single most important correctness point in the feature — without it a player who plays two sub-leagues the same night triggers a duplicate holder and a `player_matches` unique-constraint throw.

Order in `executeRefresh`'s per-source body: `match()` → `createProvisionalHolders()` (mutates `matchResult`, `holders`, `stickyMap`) → `persistEvent()` → existing `autoLinks` upsert loop (the provisional sticky is already written in step 4; keep the loop for name/number auto-links). Confirm the provisional creation is inside the per-source `try` so a failure marks only that source stale.

## Run reporting

- `PerSourceOutcome`: add `autoAdded: number`. Populate from the count of holders created for that source.
- `RunRefreshSummary` + `finishRun` counts: include a run-total `autoAdded`. Surface in the admin run log (Spec 03 §3.6 "newly auto-added players").

## Tests (ingestion)

- **New entrant → provisional holder:** stub source with a PDGA entrant matching no holder → after refresh, a `confirmed=false`, null-tag holder exists with `pool=A`, `pdgaMembership=true`, `entryDate` = first round date; its `event_results` rows carry the new `holderId`; it scores in `computeSeason`.
- **Cross-source single run (the hazard):** two active sources, same new PDGA entrant in both → **exactly one** holder created; second source auto-links; no unique-constraint error; both events' results attributed.
- **Sticky on re-run:** run twice → second run creates **no** new holder and no duplicate match row.
- **Ambiguous still queues:** 2+ name matches → no auto-add, stays unmatched (holderId null), appears in `listPendingForQueue`.
- Run summary/`refresh_runs` reflect `autoAdded` counts.

## Gate

`npm run typecheck && npm run lint && npm run test`.
