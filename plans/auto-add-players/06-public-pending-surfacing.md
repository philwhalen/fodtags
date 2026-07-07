# 06 — Public "pending confirmation" surfacing + end-to-end gate

**Goal:** render the provisional state on the public site (text badge + "—" tag) and prove the whole flow end-to-end. Closes the feature.

Depends on: 02 (payload `provisional` + null tag), 03 (provisional holders exist to test), 05 (confirm path to flip state). 

## Public rendering

- **Roster index row** (`/2026/players`): when `provisional`, render a **"Pending confirmation"** text badge (not color-only — Spec 11 §11.2); render **"—"** for a null tag number (via `formatTagNumber` from 02). Reuse existing badge styling (`standings-*`/eligibility badge classes).
- **Profile header** (`players/{slug}`): add the **"Pending confirmation"** badge among the eligibility flags when `provisional`; **"—"** for null tag (Spec 08 §8.1).
- **Banner wording:** confirm the shared "N players pending review" copy (Spec 04 §4.4) reads correctly now that the count includes provisional holders — update the string if it currently says "results".
- No new engine or read-model computation — everything is already on the payloads from 02.

## Accessibility

- Badge is text, has an accessible label, and is distinguishable without color. Tag "—" has the same treatment as the existing "Unrated" em-dash.

## End-to-end integration test

Single test that exercises the full loop against an isolated season year:
1. Register a source whose stub payload includes a brand-new PDGA entrant.
2. `runRefresh` → assert published `players` index has the new holder with `provisional=true`, `tagNumber=null`, and that they appear in standings (scored) with the pending banner count ≥ 1.
3. Load the profile payload → `provisional=true`.
4. `confirmHolder({ pool:'A', tagNumber: <n> })` → republish → index row now `provisional=false`, `tagNumber=n`; banner count decremented.

## Full gate

`npm run typecheck && npm run lint && npm run test && npm run build`. Optionally drive the public roster + a provisional profile via the `/run` skill to eyeball the badge in light/dark.

## Feature wrap (on user acceptance — do not do before)

- Move `plans/auto-add-players/00-master.md` → `plans/completed/auto-add-players-00-master.md` (token/cost table filled in).
- Delete `plans/auto-add-players/01..06-*.md` and the now-empty dir.
- Commit (branch off `main` first — repo starts on `main`).
