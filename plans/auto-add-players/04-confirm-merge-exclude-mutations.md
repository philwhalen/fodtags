# 04 — Confirm / Merge / Exclude mutations + queue redefinition

**Goal:** the director-side operations on a provisional holder, plus a `countPending` that sums both queue lists. Reuses existing audit + `commitAndPublish` plumbing.

Depends on: 01 (`listProvisionalHolders`, nullable tag). Blocks: 05.

## Mutations (`src/server/admin/mutations.ts`)

### `confirmHolder(input, actorEmail)`
- `input`: `{ id, pool, tagNumber?: number | null, name?, entryDate?, ratingAtEntry?, pdgaMembership? }`.
- Load holder; error if not found or already `confirmed` (idempotency guard — a re-confirm is a no-op error or just returns, decide and note).
- If `tagNumber != null`, `assertUniqueTag(SEASON_YEAR, tagNumber, id)`.
- `updateHolder(id, { pool, tagNumber, confirmed: true, ...optional corrections })`.
- Return `poolBHighRatingWarning(pool, ratingAtEntry ?? holder.ratingAtEntry)`.
- Audit `action: "confirm"`, `entityType: "tag_holder"`, before/after. `commitAndPublish`.
- **Confirm requires pool (defaulted A upstream), tag number optional** — a tagless confirmed holder is valid (keeps scoring, no longer "pending").

### `mergeProvisionalIntoHolder(provisionalId, targetHolderId, actorEmail)`
- Load both; target must exist and differ from provisional. Read the provisional's `pdgaNumber`.
- **Re-point results:** `event_results` rows for this season with `holderId = provisionalId` → set `holderId = targetHolderId` (new repo helper `repointHolderResults(seasonYear, fromId, toId)` or reuse `setHolderIdByPdgaNumber` on the provisional's PDGA #, which already targets by PDGA # — prefer the PDGA-# path for consistency with sticky).
- **Sticky link:** `upsertMatch({ pdgaNumber, holderId: targetHolderId, source: "admin", decidedBy: actorEmail })`.
- **Retire provisional:** deactivate (`active=false`) — do **not** hard-delete (preserve audit/history). Confirm the deactivated tagless holder drops out of `players` index (index filters `active`).
- Audit `action: "merge"`; before = provisional, after = { target, match }. `commitAndPublish`.

### `markNonHolder(pdgaNumber, actorEmail)` — extend
- Keep current behavior (sticky null + `setHolderIdByPdgaNumber(..., null)` reverts results to non-holder minimal records).
- **New:** if a provisional holder currently owns that PDGA #, deactivate it too (so it stops appearing as a scoring/roster holder). Guard: only auto-created (`confirmed=false`) holders are auto-deactivated here; never silently deactivate a confirmed holder from this path.

### Keep for the ambiguous/PDGA-less list
- `linkEntrant`, `createHolderForEntrant`, `markNonHolder` remain the actions for section B (entrants with `holderId IS NULL`).

## `countPending` (`playerMatches.ts`)

- Redefine: `countPending = listProvisionalHolders(seasonYear).length + <ambiguous link-decision count>`, where the ambiguous count is the existing `listPendingForQueue` length (holderId-null, pdga-not-null, deduped). Keep `listPendingForQueue` as-is for section B; add the provisional count.
- This value already feeds `pendingReview` on every standings payload (`build.ts`), so the public banner updates automatically.

## Tests (`mutations` / `review-queue`, isolated season year)

- **Confirm:** provisional → `confirmHolder({pool:'B', tagNumber:7})` sets pool/tag, `confirmed=true`, drops from `listProvisionalHolders`; duplicate tag rejected; Pool B + rating ≥900 returns warning; tagless confirm allowed.
- **Merge:** provisional with results → merge into target → results now `holderId=target`; provisional `active=false`; sticky admin match on the PDGA #; re-run refresh keeps it merged (sticky).
- **Exclude:** provisional → `markNonHolder(pdga)` → results `holderId=null`, provisional `active=false`, sticky non-holder; re-run does not re-add.
- **countPending:** one provisional + one ambiguous → `countPending === 2`; confirming the provisional drops it to 1.

## Gate

`npm run typecheck && npm run lint && npm run test`.
