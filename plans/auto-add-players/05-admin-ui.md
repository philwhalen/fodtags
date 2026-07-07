# 05 — Admin review & confirmation screen

**Goal:** rework `/admin/matches` from a single "link/create/non-holder" table into the two-section review & confirmation screen (Spec 10 §10.4).

Depends on: 04 (mutations). Blocks: 06 (shares the roster/badge but independent enough to parallelize if needed).

## Page (`src/app/admin/matches/page.tsx`)

Rename heading → **"Player review & confirmation"**. Two sections:

**Section A — Provisional holders awaiting confirmation** (`listProvisionalHolders(SEASON_YEAR)`):
- Per row show the scrape-seeded summary: name, PDGA #, entry date, seeded rating, `pdgaMembership`, round count so far (count `event_results` for the holder, or reuse an existing per-holder count helper).
- Three actions (client forms):
  - **Confirm** — pool select (default A), optional tag-number input (blank allowed), optional name/entry-date/rating corrections → `confirmHolderAction`. Surface the Pool-B ≥900 warning returned by the mutation.
  - **Merge into existing holder** — holder picker (active, confirmed holders) → `mergeProvisionalIntoHolderAction`.
  - **Exclude (non-holder)** — confirm-destructive → `markNonHolderAction(pdgaNumber)`.

**Section B — Entrants needing a link decision** (`listPendingForQueue(SEASON_YEAR)`, unchanged data):
- Existing link / create / mark-non-holder forms (`match-forms.tsx`) reused as-is.

Empty states per section; if both empty, "No players awaiting review."

## Actions (`src/app/admin/actions.ts`)

- Add `confirmHolderAction`, `mergeProvisionalIntoHolderAction` server actions wrapping the 04 mutations (parse/validate form input, pass `actorEmail` from session, return `{ ok, warning?, error? }` in the existing action-result shape). Reuse the existing `markNonHolderAction`.

## Components (`src/app/admin/matches/match-forms.tsx` or a sibling)

- New `ProvisionalHolderRow` client component (Confirm/Merge/Exclude forms + feedback), mirroring the existing `PendingEntrantRow` patterns (`useRouter().refresh()` on success, `Feedback` for message/warning).
- Keep `PendingEntrantRow` for section B.

## Tests

- Action → mutation happy-path unit (confirm sets fields; merge re-points; exclude reverts) — thin, since logic is tested in 04.
- `npm run build` + manual/smoke via `/run` skill: seed one provisional holder + one ambiguous entrant, load `/admin/matches`, verify both sections render and each form posts to the right action.

## Gate

`npm run typecheck && npm run lint && npm run test && npm run build`.
