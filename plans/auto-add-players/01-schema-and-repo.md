# 01 — Schema & Repository foundation

**Goal:** make `tag_holders.tag_number` nullable and add a `confirmed` flag, then teach the `tagHolders` repository to insert/query provisional holders. Everything else in the feature keys off these two columns.

Depends on: nothing. Blocks: 02, 03, 04.

## Schema (`src/server/db/schema.ts`)

- `tagNumber: integer("tag_number")` — **drop `.notNull()`** (now `number | null`). Keep the existing `uniqueIndex("tag_holders_season_tag_number_idx")` — SQLite treats NULLs as distinct, so many tagless holders coexist and app-level "unique when present" is enforced in the repo (04/mutations).
- Add `confirmed: integer("confirmed", { mode: "boolean" }).notNull().default(true)` — existing/seeded holders are confirmed; provisional inserts pass `false`. Comment it against Spec 02 §2.1.
- Update the doc comment on `tagNumber` to note it is null until a director assigns one (auto-added holders — Spec 03 §3.5).

## Migration

- Run `npm run db:generate` → new `drizzle/0005_*.sql`. Verify it (a) recreates `tag_holders` with nullable `tag_number` (SQLite column-drop-notnull is a table rebuild — confirm the generated SQL preserves data + the unique index) and (b) adds `confirmed` with default 1. Hand-edit only if drizzle-kit produces an unsafe rebuild.
- Apply via `npm run db:migrate`; confirm `domainSchema.test.ts` (which runs migrations) stays green.

## Repository (`src/server/db/repositories/tagHolders.ts`)

- `insertHolder` input: `tagNumber?: number | null`, `confirmed?: boolean` (default true when omitted). Existing callers (seed, admin create) unaffected.
- `HolderRow` / return types: `tagNumber: number | null`, `confirmed: boolean`.
- `findHolderByTagNumber(seasonYear, tagNumber, excludeId?)` — early-return `undefined` when `tagNumber == null` (a null tag never collides). Keeps the unique-when-present contract callable from mutations.
- `updateHolder` patch: allow setting `tagNumber` to `number | null` and `confirmed`.
- **New:** `listProvisionalHolders(seasonYear): HolderRow[]` — `active = true AND confirmed = false`, ordered by `id`. Feeds the review queue (04) and `countPending`.

## Types touched

- Anywhere `HolderRow.tagNumber` is consumed as `number` will now flag under `strict` — that is the point; 02 fixes the comparators, and read-model payload types. In *this* chunk, only make the repo compile: cast/guard at call sites that will be reworked in 02 are acceptable **only** if left with a `// 02:` marker, but prefer letting 02 own them. If typecheck can't pass standalone, narrow the blast radius by having `listHolders` keep returning the real `number | null` and updating the 2–3 direct consumers minimally.

## Tests (`tagHolders` repo test, isolated season year)

- Insert holder with `tagNumber: null, confirmed: false` → row persists; `listHolders` returns it with null tag.
- Insert **two** holders with null tag → both persist (no unique violation).
- `findHolderByTagNumber` returns `undefined` for a null argument and still finds a real duplicate.
- `listProvisionalHolders` returns only `confirmed=false && active`, excludes confirmed and deactivated.

## Gate

`npm run typecheck && npm run lint && npm run test` (migration test + repo test green).
