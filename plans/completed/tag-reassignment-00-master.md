# Tag Reassignment & History — Master Plan

Implements the nightly tag reassignment mechanic and tie-break rewiring specified in
Spec 02 §2.10 / §2.6 (+ Spec 03 §3.3/§3.7, Spec 05 §5.3, Spec 07 §7.3, Spec 08
§8.1/§8.2, Spec 10 §10.2/§10.9, Master §5).

## Goal

Tags become **dynamic**: physical numbered tags pooled across both pools and
re-handed-out each League Night by combined-field finishing order (lowest score →
lowest tag). The engine **computes** the nightly reassignment from scores (director-
overridable), **retains the full history**, and every tie-break reads the tag **as of**
the relevant moment. The end goal this unlocks: entering the real per-night tag→holder
record (via overrides) so `real-2026-reconciliation.test.ts` can fully reconcile the
engine against the score sheet.

## Architecture decisions (resolved during planning)

1. **`tag_holders.tagNumber` = the INITIAL (stable) tag.** It already behaves as a
   stable, admin-set value in every current read path (slugs, unique index, snapshot
   input), so we keep the column and clarify its meaning as `initialTagNumber`. **No
   wide rename** — lowest blast radius. The engine treats it as the seed of the
   timeline.
2. **Add `tag_holders.currentTagNumber`** (nullable, unique, derived cache) — the
   holder's latest tag-out, written back by the publish transaction after recompute.
   This is the number the roster/public views show as "tag #". Honors the user's "roster
   shows current tag" intent without destabilizing slugs or mutating the admin input.
3. **`tag_overrides` table = the only new admin INPUT** — one row per (event, holder)
   observed tag-out. The resolved timeline is computed output (published in the read
   model), not a normalized table. The Spec 02 `TagAssignment` entity is realized as
   engine output + read-model rows + this override input, not its own stored table.
4. **Engine computes the timeline in a pure pre-pass** (`engine/tags.ts`), walking
   non-canceled League Nights in `(date, roundOrdinal)` order **before** ranking — a
   night's finish tie-break needs that night's tag-in. Produces: per-holder-night
   `{tagIn, tagOut, source}`, a `tagAsOf(holderId, date)` resolver, and each holder's
   current tag.
5. **Slugs use `initialTagNumber`** (Spec 08 §8.2, already amended) — current tags churn
   nightly and would break slug stability.
6. **Combined-field reassignment ranking ≠ per-pool points ranking** — the engine
   computes both per night; a night's tag-outs are always a permutation of its tag-ins.

## Open flags (defaults chosen; confirm during UAT)

- Cancelled night → **no reassignment** (tags unchanged).
- Pile = only holders **present with tag** (`tagPresent = true`); absent / tag-not-
  present keep their tag.
- Provisional holder with no initial tag enters the sequence **only once assigned** (no
  retroactive insertion into past piles).

## Sub-plans & checklist

Execute in order; test and verify between each chunk. Each chunk is independently
testable.

- [x] **01 — Schema & snapshot** (`01-schema-and-snapshot.md`) — ✅ done, green (424 tests). Migration `0006_thin_roxanne_simpson.sql`. Deviation: added `tagOverrides: []` to existing engine-test snapshot literals (additive, required for typecheck).
  - `currentTagNumber` column + `tag_overrides` table + migration; `tagOverrides`
    repository; `SeasonSnapshot` gains `tagOverrides` + holders carry initial tag;
    snapshot loader wiring. Schema/loader tests green.
- [x] **02 — Engine tag timeline (PURE)** (`02-engine-tag-timeline.md`) — ✅ done, pure, green (12 tag tests / 436 total). `computeTagTimeline({holders, events, tagOverrides})` → `{assignments, tagAsOf, currentTagByHolder, tagInForNight}`. **Deviations to carry forward:** (a) a director override for a holder *present in results* can seed an initially-tagless holder into the sequence (bonus path; base path is still roster `initialTagNumber`); (b) overrides recorded against a **canceled** night are not applied (canceled nights filtered from the walk) — revisit in 05 only if the spec §2.10 canceled-override parenthetical becomes a real need.
  - New pure `engine/tags.ts`: compute tag-in/tag-out per night, apply overrides,
    `tagAsOf`, current tag. Fixture unit tests: reassignment, score ties (tag-in
    break), cancelled, absent, tag-not-present, provisional-no-tag, overrides,
    mid-season buy-in, multi-night-same-date ordering.
- [x] **03 — Engine tie-break rewire** (`03-engine-tiebreak-rewire.md`) — ✅ done, green
  (440 tests / 1 skipped, up from 436). `computeSeason` now calls `computeTagTimeline`
  first and wires `tagInForNight`/`tagAsOf`/`currentTagByHolder` into every tie-break per
  the sub-plan (LN ranking, Podium/sub-league standing, Championship, OLP). Added
  `tagAssignments` + `currentTagByHolder` to `SeasonResults`. New reshuffle-affects-
  tie-break fixture (`reshuffleSnapshot` in `acceptance-fixtures.ts`) proves a night-1
  reassignment flips a night-2 tie outcome vs. the old static-tag logic, and that
  Championship/Podium rows carry the post-swap current tag. No existing test
  expectations needed changing — every prior fixture's finish order was already
  self-consistent (best score always got the lowest tag), so the timeline never
  reshuffles tags mid-fixture in a way that touches an existing assertion. One
  incidental fix: `src/server/readmodel/skins-build.test.ts`'s `minimalResults()`
  helper builds a full `SeasonResults` literal and needed the two new required fields
  added (mechanical, non-behavioral).
  - Integrate timeline into `computeSeason`: LN ranking uses tag-in; Podium/Overall/
    Tournament/OLP use `tagAsOf`; standings rows carry correct as-of tag; add timeline
    + current-tag to `SeasonResults`. Update existing engine tests + acceptance fixtures.
- [x] **04 — Read model & write-back** (`04-readmodel-and-writeback.md`) — ✅ done, green
  (445 tests / 1 skipped, up from 440). `buildViews` now returns `{ views, currentTags }`;
  `publish`/`recompute`/`buildAndPublish` thread `currentTags` through and write it back
  to `tag_holders.current_tag_number` inside the same publish transaction, two-phase
  (null all → set all) to dodge the `(seasonYear, currentTagNumber)` unique index during
  mid-transaction permutation. `RoundRow` gained `tagIn`/`tagOut`; League Night rows join
  `SeasonResults.tagAssignments` by `(holderId, eventId)`, Tournament/FOD Open rows use a
  read-model-local `tagAsOf` resolver rebuilt from the published `tagAssignments` (mirrors
  the engine's private closure without depending on it). `players-build.ts`'s index/profile
  `tagNumber` switched to `currentTagByHolder`; slugs confirmed already sourced from
  initial `tagNumber` (no change needed — single call site in `build.ts`).
  **Deviation (engine fix, chunk 02's `tags.ts`):** the write-back's real
  `(seasonYear, currentTagNumber)` unique index surfaced a genuine non-permutation
  `currentTagByHolder` output — `computeTagTimeline` didn't dedupe a holder appearing
  twice in one night's results (reproduced via `review-queue.test.ts`'s `linkEntrant`
  back-filling a second result onto a holder who already had one that night). Fixed by
  keeping only the better-scoring row per holder per night before building the pile
  (`src/server/engine/tags.ts`) — a defensive robustness fix, not a ranking-rule change.
  **Deviation (pre-existing test expectation, not a bug):** `pending-surfacing.test.ts`
  expected a freshly-`confirmHolder`'d holder's displayed tag to equal the just-assigned
  initial tag; this chunk is the first to publish `currentTagByHolder` anywhere, which
  exposed that a holder confirmed mid-season with pre-existing League Night results is
  legitimately retroactively folded into the combined-field reassignment pile for every
  night they already played (Spec 02 §2.10, architecture decision 1: initial tag "seeds
  the timeline"). Updated the test to assert the initial tag lands as typed and the
  *displayed* tag matches the engine's own `currentTagByHolder` (cross-checked, not
  hardcoded) rather than assuming the two are always equal.
  - Publish tag timeline (rounds Tag data + current tag on holder rows); write current
    tag back to `tag_holders.currentTagNumber` inside the publish transaction. Build/
    integration tests.
- [x] **05 — Admin tag management** (`05-admin-tag-management.md`) — ✅ done, green (448 tests), build clean. Roster relabeled "Initial tag #" + read-only "Current tag"; new `/admin/tags` per-night page reads the published `rounds` timeline (no read-path recompute); `setTagNightOverrides` mutation validates the submission is a permutation of the night's tag-ins (derived via `computeNightPile` = engine call on the *write* path with that night's own overrides stripped), upserts only differs-from-computed, deletes overrides that re-equal computed, audits + recomputes. Deviation: form does not expose the "inject a tagless holder" bonus path (tied to open-flag #3 — deferred per instruction).
  - Roster form: edit initial tag, show current read-only. New §10.9 per-night tag view
    + override entry with permutation validation + audit + recompute. Mutation tests.
- [x] **06 — Display: rounds Tag column** (`06-display-rounds-tag.md`) — ✅ done, green (454 tests), build clean. `roundTagCell` projection helper (`{text, ariaLabel}`) → `tag-in → tag-out` / collapsed / "—", with spelled-out aria-label ("tag 1 to 5"); Tag column added to `PlayerRoundsView`; profile header gained a caption/link to the Rounds table for night-by-night movement.
  - Rounds per-player table Tag column (`tag-in → tag-out`); profile header current-tag
    note. Component/projection tests.

**FEATURE COMPLETE — all 6 chunks green.** Final gate: `typecheck` clean · `lint` clean ·
`454 passed / 1 skipped` · `next build` clean. Awaiting user acceptance (Stage 4). **Must
resolve open-flag #3 (retroactive pile insertion, see Deviations log) before archiving.**

## Verification between chunks

`npm run typecheck && npm run lint && npm test` after each chunk; `next build` before
declaring the feature done. Do **not** commit before user acceptance (workflow Stage 4).

## Token / cost accounting

Implemented **inline by the orchestrating model (Opus 4.8)** unless the user asks to
spawn Sonnet sub-agents (workflow Stage 3 default is inline). Record actuals as chunks
complete. (Pricing table in CLAUDE.md is Cursor/Composer; this feature is being built in
Claude Code / Opus — note the model basis per chunk.)

| Chunk | Model | Input tok | Cache read | Output tok | Notes |
|-------|-------|----------:|-----------:|-----------:|-------|
| 00 planning | Opus 4.8 | — | — | — | this plan + spec edits |
| 01 schema/snapshot | Sonnet | — | — | 127,573 (subagent total) | 77 tool uses; green |
| 02 engine timeline | Sonnet | — | — | 110,342 (subagent total) | 41 tool uses; pure, green |
| 03 tie-break rewire | Sonnet | — | — | 103,857 (subagent total) | 47 tool uses; 440 tests / 1 skipped green; no existing expectations changed |
| 04 readmodel/writeback | Sonnet | — | — | 271,028 (subagent total) | 149 tool uses; 445 tests / 1 skipped green (up from 440); new `tag-writeback.test.ts` (5 tests) + 1 engine robustness fix (`tags.ts` dedupe) + 1 pre-existing test expectation updated (`pending-surfacing.test.ts`) |
| 05 admin | Sonnet | — | — | 191,774 (subagent total) | 69 tool uses; 448 tests green, build clean; `/admin/tags` route added |
| 06 display | Sonnet | — | — | 84,407 (subagent total) | 50 tool uses; 454 tests green, build clean |
| **Total** | Sonnet ×6 | — | — | ~888,981 (subagent tokens) | orchestration (Opus) not included |

## Deviations log

- **OPEN-FLAG #3 — RESOLVED (2026-07-08): keep current behavior (option A).** The
  implementation folds a provisional holder into all already-played nights' piles the
  moment an initial tag is assigned (initial tag seeds the timeline from the start — arch
  decision 1). The user confirmed the pathological case (a holder confirmed mid-league
  *with back-rounds*) **will not occur in production** — the league keeps data current
  every League Night. A genuine mid-league joiner has **no results before their join
  night**, so they are simply absent from earlier piles (never retro-inserted) and enter
  the shuffle from their assignment forward — already the case, covered by the chunk-02
  "mid-season buy-in" test. No code change. (Future: the real per-night tag record will be
  **seeded directly** — initial tags + fully-populated `tag_overrides` — via a
  `seed-real-tags.ts`, to be built when the dataset exists; pin down tag-in vs tag-out
  semantics then.)
- Chunk 02: override can seed an initially-tagless holder present in results; canceled-
  night overrides not applied (see chunk-02 note).
- Chunk 04: two-phase (null-all → set-all) write-back to avoid mid-transaction unique-
  index self-collision on the tag permutation; engine dedupe of a holder with two result
  rows in one night (best score kept).

- **04 — `computeTagTimeline` dedupes a holder's results within one night** (engine
  robustness fix, `src/server/engine/tags.ts`): the write-back's real DB unique index on
  `(seasonYear, currentTagNumber)` caught a case chunks 01–03 never exercised — a holder
  with two `event_results` rows in the same event (e.g. `linkEntrant`, Spec 10 §10.4,
  back-filling a second appearance onto a holder who already had one that night) doubled
  them into the reassignment pile, producing two holders mapped to the same tag-out and
  crashing the write-back. Fixed by keeping only the better-scoring row per holder per
  night before ranking; verified via `review-queue.test.ts` and
  `ingestion-acceptance.test.ts`, which exercise this exact scenario against the real PDGA
  fixture and previously silently computed a broken (non-permutation) timeline with no way
  to notice, since nothing consumed `currentTagByHolder` before this chunk.
- **04 — `pending-surfacing.test.ts` expectation updated, not a bug**: this chunk is the
  first to publish `currentTagByHolder`, which surfaced that `confirmHolder`-ing a holder
  who already has League Night results retroactively includes them in the combined-field
  reassignment for every night they already played (intended per architecture decision 1
  — the initial tag "seeds the timeline"). The test asserted the displayed tag would equal
  the just-typed initial tag; updated to assert the initial tag lands correctly AND the
  displayed tag matches the engine's own `currentTagByHolder` (computed independently in
  the test, not hardcoded).
