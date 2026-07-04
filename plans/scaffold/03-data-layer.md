# 03 — Data Layer

**Goal:** Drizzle ORM over `better-sqlite3` (WAL), the §12.5 skeleton schema, migrations generated to `drizzle/` and applied on boot, thin repositories, and an idempotent seed.

**Spec refs:** §12.5, §12.4. **Depends on:** 02.

## Client — `src/server/db/client.ts`

- `import 'server-only'`.
- Open `better-sqlite3` at `config.dbPath`; set `PRAGMA journal_mode = WAL`, `foreign_keys = ON`, a sane `busy_timeout`.
- Wrap with Drizzle; export the singleton `db` and the raw `sqlite` handle (needed for `VACUUM INTO` in backup and for transactions).
- Ensure `DATA_DIR` and `raw/` exist on open (mkdir-p).

## Schema — `src/server/db/schema.ts`

Skeleton tables (§12.5). **Every domain table carries `seasonYear`.** Timestamps stored as UTC (ISO text or unix int — pick one, document it).

| Table | Key columns |
|---|---|
| `seasons` | `year` (PK), created-at |
| `tag_holders` | id, `seasonYear` FK, name, `tagNumber`, `pool` (A/B), `entryDate`, `pdgaNumber?`, `ratingAtEntry?`, `active` |
| `event_sources` | id, `seasonYear` FK, `pdgaEventId`, `type` (EARLY/MID/LATE/TOURNAMENT/FOD_OPEN), `active`, `label` |
| `directors` | `email` (PK), `addedBy?`, `addedAt`, `active` |
| `refresh_runs` | id, `seasonYear`, `trigger` (manual/scheduled), `startedAt`, `endedAt?`, `status`, per-source status JSON, counts, `error?` |
| `read_model` | id, `seasonYear`, `version` (monotonic), `viewKey` (e.g. `championship/pool-a`), `payload` JSON, `builtAt`; **+** a `published_pointer` table/row: `{ seasonYear, currentVersion }` |

Notes:
- `read_model` is view-shaped rows keyed by `(seasonYear, version, viewKey)`. Publishing writes a new `version`; the pointer flip is one transaction (see [05]).
- Keep `refresh_runs.perSource` and `read_model.payload` as JSON columns for the skeleton — full normalization arrives with feature specs.

## Migrations

- `drizzle.config.ts` → dialect sqlite, schema path, out `drizzle/`.
- Generate the initial migration (`drizzle-kit generate`); commit the SQL.
- **Apply on boot** via Drizzle's migrator, invoked from the boot entry [01] before seed. Also runnable standalone for CI.

## Repositories — `src/server/db/repositories/`

Thin, typed functions (no business logic — that's the engine). At minimum:
- `seasons`: `getSeason(year)`.
- `tagHolders`: `listHolders(seasonYear)`.
- `eventSources`: `listActiveSources(seasonYear)`.
- `directors`: `isDirector(email)`, `upsertDirector(...)`.
- `refreshRuns`: `startRun(...)`, `finishRun(...)`, `listRuns(...)`.
- `readModel`: `getPublished(seasonYear, viewKey)`, `getCurrentVersion(seasonYear)` — write side lives in [05].

## Seed — `src/server/db/seed.ts`

Idempotent (upserts / `INSERT ... ON CONFLICT DO NOTHING`), runnable on boot and via script:
- Season **2026**.
- A handful of `tag_holders` (mix of Pool A/B, distinct tag numbers, a couple with PDGA #s) — enough to render a non-empty roster at 0 points.
- The **3 sub-league** `event_sources` (EARLY/MID/LATE), `active`, with the real 2026 event id `104527` on one where appropriate (or placeholders; label them).

## Done when

- Fresh `DATA_DIR` → boot creates the DB, applies migrations, seeds 2026 + holders + sources.
- Re-running seed changes nothing (idempotent).
- Repositories return typed rows.
