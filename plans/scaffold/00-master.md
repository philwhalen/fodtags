# Scaffold — Master Plan (Walking Skeleton)

**Owning spec:** [`specs/12-Architecture.md` §12.13](../../specs/12-Architecture.md)
**Nature of work:** The walking-skeleton scaffold. Per [`CLAUDE.md`](../../CLAUDE.md), the scaffold is explicitly **exempt** from the four-stage spec-driven workflow — no spec changes required. This plan exists only to sequence the build.

## Goal

Every architectural layer is **wired and provably runs** — no product features implemented. The acceptance bar (§12.13):

> The app starts, a director signs in and clicks "Refresh now," a run is recorded, the public page renders the empty roster with an "Updated {time} ET" stamp, and `/api/health` is green — with PDGA scraping, the scoring engine, and all feature views still to be built.

## Non-negotiable boundaries (carry through every sub-plan)

- **Engine is pure** — `src/server/engine/` imports no DB, clock, `fetch`, ingestion, or Next.js. Plain inputs → plain outputs.
- **Public reads never recompute or touch PDGA** — `app/(public)` reads only from `readmodel`.
- **Recompute publishes a new version and flips one pointer in a single SQLite transaction** — readers never see a partial refresh. Manual "Refresh now" and the scheduled job call the **same** pipeline function, single-flighted.
- **Server-only stays server-only** — everything under `src/server/` is guarded by `import 'server-only'`; secrets and PDGA access never reach the client bundle.
- **Season-scoped from day one** — every domain table carries `seasonYear`.

## Build order & sub-plans

Ordered by dependency. Each is small and independently testable; **implement inline — do not spawn subagents** unless the user asks.

| # | Sub-plan | Depends on | Delivers |
|---|---|---|---|
| 01 | [Project bootstrap](./01-project-bootstrap.md) | — | Next.js App Router app, TS strict, lint clean, folder skeleton, `server-only` guard, standalone build |
| 02 | [Config & logging](./02-config-and-logging.md) | 01 | Zod-validated `config`, `.env.example`, `pino` structured logging |
| 03 | [Data layer](./03-data-layer.md) | 02 | Drizzle + `better-sqlite3`, skeleton schema, migrations-on-boot, repositories, seed |
| 04 | [Pure engine](./04-engine.md) | 01 | `computeStandings` + `olpScore` (pure); OLP signature that will satisfy the 81.3/81.4 fixtures |
| 05 | [Read model](./05-readmodel.md) | 03, 04 | Versioned view rows + atomic publish/pointer-flip; empty-roster standings shape |
| 06 | [Ingestion pipeline](./06-ingestion-pipeline.md) | 03, 04, 05 | `PdgaSource` interface + stub, normalize/match stubs, single-flight `runRefresh()`, `refresh_runs` record |
| 07 | [Scheduler & jobs](./07-scheduler-jobs.md) | 06 | `croner` scheduler; Thu 21:00 ET + monthly 2nd-Tue jobs; next-fire logged on boot |
| 08 | [Auth & admin](./08-auth-admin.md) | 02, 03, 06 | Auth.js Google, `directors` allowlist + bootstrap, `/admin/*` middleware gate, stub dashboard, "Refresh now" route |
| 09 | [Public page & health](./09-public-and-health.md) | 05 | `/2026/championship/pool-a` (empty roster + freshness stamp); `GET /api/health` |
| 10 | [Testing & CI](./10-testing-and-ci.md) | 04, 06 | Vitest; OLP engine test (81.3/81.4); pipeline integration test; CI: typecheck→lint→test→build |
| 11 | [Ops & docs](./11-ops-and-docs.md) | 03 | `scripts/backup.sh` (`VACUUM INTO` + retention); sample nginx block; systemd unit; README |

## Boot sequence (the integration contract all sub-plans converge on)

On process start, in order:
1. Load & validate `config` (fail fast) — [02].
2. Open SQLite (WAL), **apply migrations** — [03].
3. **Seed** idempotently: 2026 season, sample tag holders, 3 sub-league event sources — [03].
4. **Bootstrap director** from `BOOTSTRAP_DIRECTOR_EMAIL` (idempotent upsert) — [08].
5. Ensure **≥1 published read-model version** exists (run an initial recompute if the pointer is unset) so the public page always has something to read — [05/06].
6. **Register scheduler jobs**, log each job's next fire time — [07].

> Where boot code lives (Next.js `instrumentation.ts` vs a custom server entry) is decided in sub-plan 01 and referenced by 03/07/08.

## Master checklist (mirrors §12.13 — tick as sub-plans land)

- [x] Next.js app boots; TypeScript strict; lint clean. *(01)*
- [x] SQLite via Drizzle; initial migration for §12.5 tables; migrations apply on boot. *(03)*
- [x] Seed: 2026 season + sample tag holders + 3 sub-league event sources. *(03)*
- [x] `/2026/championship/pool-a` renders roster at **0 points** from the **published read model**. *(05, 09)*
- [x] Admin: Google sign-in; `/admin` gated by `directors` (bootstrapped); stub dashboard. *(08)*
- [x] "Refresh now" → runs pipeline with **stub** source, records a `refresh_runs` row, republishes. *(06, 08)* — route wired+gated (08); pipeline exercised directly (06). Authenticated click path not run end-to-end (build/health-only: no live Google).
- [x] Scheduler registered (Thu 21:00 ET + monthly 2nd-Tue); next-fire times logged on boot. *(07)*
- [x] `GET /api/health` green (DB reachable, read-model version reported). *(09)*
- [x] Vitest: one passing engine test (OLP 81.3/81.4) + one pipeline integration test. *(10)*
- [x] `.env.example`, Zod config validation, `server-only` guards in place. *(01, 02)*
- [x] `scripts/backup.sh` (`VACUUM INTO` + retention); sample nginx block in docs. *(11)*
- [x] CI green: typecheck, lint, test, build. *(10)* — workflow authored + step order correct; verified locally by simulating the CI env with no `.env`. Not yet run on GitHub Actions (no remote push in this scaffold).

## Sub-agent run log

Each sub-plan is implemented by a **general-purpose sub-agent on Sonnet 5**, spawned sequentially. After each run the output is verified with the **full gate** — file review + `typecheck` + `lint` + `build` (+ `vitest` once tests exist) — before the next agent is spawned. **Tokens** = the sub-agent's own token usage as reported in the Agent tool result (this turned out to be available after all; the 5-hour quota **percentage** is still omitted because the orchestrator has no reliable denominator for it).

| # | Sub-plan | Agent / model | Tokens | Tool calls | Verification | Result |
|---|----------|---------------|-------:|-----------:|--------------|--------|
| 01 | Project bootstrap | general-purpose / Sonnet 5 | 66,377 | 45 | typecheck ✓ · lint ✓ · build ✓ · standalone ✓ | ✅ pass |
| 02 | Config & logging | general-purpose / Sonnet 5 | 48,829 | 36 | typecheck ✓ · lint ✓ · build ✓ · boot log ✓ | ✅ pass |
| 03 | Data layer | general-purpose / Sonnet 5 | 106,514 | 93 | typecheck ✓ · lint ✓ · build ✓ · fresh-boot migrate+seed ✓ · idempotent ✓ | ✅ pass |
| 04 | Pure engine | general-purpose / Sonnet 5 | 40,880 | 25 | typecheck ✓ · lint ✓ · build ✓ · OLP 81.3/81.4 ✓ · purity grep clean ✓ | ✅ pass |
| 05 | Read model | general-purpose / Sonnet 5 | 61,990 | 32 | typecheck ✓ · lint ✓ · build ✓ · atomic rollback ✓ · v1→v2 bump ✓ | ✅ pass |
| 06 | Ingestion pipeline | general-purpose / Sonnet 5 | 87,702 | 61 | typecheck ✓ · lint ✓ · build ✓ · manual run ✓ · single-flight ✓ · raw cache ✓ | ✅ pass |
| 07 | Scheduler & jobs | general-purpose / Sonnet 5 | 62,691 | 41 | typecheck ✓ · lint ✓ · build ✓ · boot next-fire logs ✓ · 2nd-Tue ✓ (6 mo) · idempotent ✓ | ✅ pass |
| 08 | Auth & admin | general-purpose / Sonnet 5 | 115,715 | 86 | typecheck ✓ · lint ✓ · build ✓ · bootstrap idempotent ✓ · /admin 307 · POST refresh 401 · / 200 | ✅ pass |
| 09 | Public page & health | general-purpose / Sonnet 5 | 63,433 | 41 | typecheck ✓ (clean-state) · lint ✓ · build ✓ · pool-a roster 0pts+ET ✓ · /→307 · health 200 | ✅ pass |
| 10 | Testing & CI | general-purpose / Sonnet 5 | 89,083 | 57 | typecheck ✓ · lint ✓ · build ✓ · vitest 4/4 ✓ · CI-sim (no .env) ✓ · YAML valid ✓ | ✅ pass |
| 11 | Ops & docs | general-purpose / Sonnet 5 | 53,864 | 34 | typecheck ✓ · lint ✓ · build ✓ · VACUUM INTO snapshot valid ✓ · retention prune ✓ · shellcheck ✓ | ✅ pass |

**Totals:** **797,078 tokens** across all 11 sub-agents (avg ~72.5k/agent). Plus orchestrator verification overhead (not counted here). Per-agent range: 40,880 (04) – 115,715 (08).

> **Note on token/quota tracking:** the 5-hour usage **quota %** requested at kickoff is omitted — the orchestrator has no reliable denominator for it. Per-agent **token** counts (above) came from each Agent tool result's `<usage>` block, which turned out to be available after the initial assumption that it wasn't.

## Progress log

_Update this section during implementation (stage 3). Record deviations from the plan here._

- **✅ ALL 11 SUB-PLANS COMPLETE & VERIFIED.** Every master-checklist item ticked. Final holistic check against the §12.13 acceptance bar (fresh absolute `DATA_DIR`, `.next/standalone/server.js`): the boot sequence fires in exact order — `boot.summary → db.migrate → db.seed → auth.bootstrapDirector → readmodel.ensurePublished → scheduler.registered ×2`; `/api/health` → `{status:ok, db:ok, readModelVersion:1}`; `/2026/championship/pool-a` renders the seeded roster at 0 points with "Updated … ET"; `/` → 307 to pool-a; `/admin` → 307 (gated, signed out); full `vitest run` 4/4; typecheck/lint/build all 0. The only unverifiable item is a **live Google sign-in** (build/health-only per the run's ground rules — no real OAuth creds). **Nothing committed** (HEAD still `5afc2c2`) — awaiting user acceptance per CLAUDE.md stage 4, after which `plans/scaffold/` is deleted and the feature committed.

- **Environment setup (orchestrator, pre-run):** Box had no Node toolchain. Installed **Node 20.20.2 / npm 10.8.2** via NodeSource, and **build-essential** (g++ 12.2, make 4.3) as a native-module fallback for `better-sqlite3`. Verification uses `npm run typecheck|lint|build|test`; a local `.env` with valid dummy values is created so the Zod config (which `process.exit(1)`s on missing env) doesn't block build/test.
- **01 Project bootstrap — ✅ pass.** Deviation: `create-next-app` pulled **Next.js 16.2.10 / React 19.2.4** (current `latest`, newer than the 14/15 era the specs were written against) — accepted, all gates pass. Boot entry decided: **`src/instrumentation.ts` `register()`** with TODO slots for steps 02/03/05/06/07/08. `typedRoutes: true` is on, so `src/app/page.tsx` uses a plain `<a>` to the not-yet-existent `/2026/championship/pool-a` (sub-plan 09 can switch to `next/link`). Independently verified: typecheck 0, lint 0, build 0, `.next/standalone/server.js` present.
- **02 Config & logging — ✅ pass.** Added `zod@4`, `pino@10`, `pino-pretty@13`. Config parses `process.env` once at module load, freezes a typed `config` (derives `dbPath`/`rawDir`), `process.exit(1)` on invalid env. Logging deliberately reads `NODE_ENV` from `process.env` (not `@server/config`) to avoid a config↔logging circular import. Boot step 1 wired into `instrumentation.ts` (config import + `boot.summary` log). Local gitignored `.env` created for verification; `.env.example` committed-eligible. Independently verified: typecheck 0, lint 0, build 0, and a live standalone boot emitted the `boot.summary` JSON line.
- **11 Ops & docs — ✅ pass.** `scripts/backup.sh` (`set -euo pipefail`): `sqlite3 VACUUM INTO` (not `cp`) → temp file → atomic `mv`; timestamped `fodtags-<UTC>.db` under `$DATA_DIR/backups`; retention keeps N newest by count (arg > `BACKUP_RETENTION` > default 14); `raw/` excluded (documented reproducible cache); fails closed on missing `sqlite3`/DB/bad retention. `docs/nginx.sample.conf` (TLS at existing nginx → `127.0.0.1:$PORT`, forwards `X-Forwarded-*`/`Host`), `docs/fodtags.service.sample` (EnvironmentFile §12.9, `ExecStart=node .next/standalone/server.js`, journald, absolute `DATA_DIR`) + optional backup timer/service samples. README replaced with product blurb + dev quickstart + §12.12 deploy contract. Installed `sqlite3` + `shellcheck` (VM provisioning deps). Independently verified: snapshot `PRAGMA integrity_check` = ok / tag_holders=6; retention 6→3 keeps newest; missing-DB exits 1; shellcheck clean; typecheck/lint/build 0. **Minor edge (noted, not a defect):** two invocations within the same wall-clock second → the second aborts with "refusing to overwrite" (fine for a daily timer).
- **10 Testing & CI — ✅ pass.** Added `vitest@4` + `vite-tsconfig-paths`. `vitest.config.ts` resolves `server-only` to its no-op via `resolve.conditions:['react-server']` (+ `ssr.resolve.conditions`), and supplies dummy config env via `test.env`. `olp.test.ts` asserts OLP 81.3/81.4 exactly (rounded) + raw within tight tolerance. `pipeline.test.ts` (integration): fresh `mkdtemp` `DATA_DIR`, **dynamic `import()`** of all server modules AFTER setting `DATA_DIR` (so the frozen config picks up the temp dir), migrate+seed, then asserts succeeded `refresh_runs` row + version advance + roster all 0 points + single-flight (two overlapping calls → one row, matching runId, completed+skipped). `.github/workflows/ci.yml`: checkout→setup-node(.nvmrc)→npm ci→typecheck→lint→test→build, with a **job-level dummy env block** (no committed `.env`; both `test` and `build` import the config module graph). Independently verified: `vitest run` 4/4; confirmed `npm ci` keeps devDeps under `NODE_ENV=production` (146 pkgs both ways, so CI install is safe); CI simulation with `.env` moved aside + CLI env → test 4/4 + build compiled+standalone (no `.env` banner). CI not yet executed on GitHub Actions (no remote in scaffold). typecheck/lint 0.
- **09 Public page & health — ✅ pass.** `app/(public)/[season]/championship/[pool]/page.tsx` is SSR reading ONLY `getPublished` (imports verified: readmodel repo + `@/lib` only — no engine/ingestion/PDGA). Columns Rank|Player|Tag#|Points, all 0; freshness via `formatEt` in `src/lib/` (client-safe `Intl.DateTimeFormat` @ `America/New_York` + " ET"). Root `page.tsx` → `redirect('/2026/championship/pool-a')`. `api/health/route.ts` (`force-dynamic`, no auth) returns `{status,db,readModelVersion,time}`, 503 on DB throw. **Checked the sub-agent's CI concern:** clean-state `tsc --noEmit` (with `.next` removed) passes 0 — typedRoutes falls back to `string` when `.next/types` is absent, so CI's typecheck→build order is safe (no build-before-typecheck dependency). Independently verified live: pool-a roster ranks 1–3 tags 1–3 at 0 pts + "Updated … ET"; `/`→307 pool-a; `/api/health`→200 `readModelVersion:1`; pool-b→200. typecheck/lint/build 0.
- **08 Auth & admin — ✅ pass.** Added `next-auth@5.0.0-beta.31` (installs cleanly — its peer range already lists Next 16, no overrides needed). Google provider; `signIn` callback is the allowlist gate (`isDirector(email)`, rejects non-directors before any session). **Edge/Node split:** middleware runs on the Edge runtime which can't load `better-sqlite3`, so `src/middleware.ts` decodes the JWT via `getToken` and trusts the `isDirector` flag stamped at sign-in (real DB check happens in the Node-runtime `signIn`). `trustHost:true` (behind nginx). Boot step 4 wired: idempotent `upsertDirector(BOOTSTRAP_DIRECTOR_EMAIL)`. Refresh route re-checks `auth()` then calls the shared `runRefresh`. **Known skeleton limitation:** a director removed from the allowlist keeps access until their JWT expires (middleware trusts the stamped flag; not re-checked against DB per request) — fine for the skeleton. **Next 16 note:** `middleware` file convention is deprecated in favor of `proxy` (build warning only; kept `middleware.ts` as the named deliverable). Independently verified: boot bootstrap created:true→false, directors row active; `/admin`→307 sign-in, `POST /api/admin/refresh`→401 (no pipeline run), `/`→200, `/api/auth/signin`→200. typecheck/lint/build 0. Authenticated click-through not exercised (build/health-only — no live Google creds).
- **07 Scheduler & jobs — ✅ pass.** Added `croner@10`. `registerJobs()` (module-level `registered` singleton guard, idempotent across HMR/double-invoke) creates two `Cron` jobs with `{timezone: config.APP_TIMEZONE}`, both handlers calling `runRefresh({trigger:'scheduled', seasonYear:2026})` (no parallel path, no second lock — relies on the pipeline single-flight). **Key correction by the sub-agent:** croner ORs day-of-month + day-of-week by default, so `0 9 8-14 * 2` needs explicit `domAndDow:true` to mean "2nd Tuesday" (verified empirically). Wired as boot step 6; each job's `.nextRun()` logged as `scheduler.registered`. Independently verified: real boot logged both jobs (thu → 7/9/2026 21:00 ET, monthly → 7/14/2026 09:00 ET) with no errors; direct croner check confirmed the next 6 monthly fires are all genuine 2nd Tuesdays (Jul–Dec 2026) and Thursday fires are all Thursdays. **Incident:** caught+killed a stray `next-server` dev process (leaked from sub-plan 01's smoke test) squatting on :3000; from here boots use `PORT=3999` + `pkill` cleanup. typecheck/lint/build 0.
- **06 Ingestion pipeline — ✅ pass.** `PdgaSource` interface + no-network `stub-source.ts` + `getPdgaSource()` factory (real Playwright fetcher deferred). `normalize`/`match` are empty-in/empty-out stubs with documented §3.5 TODOs. `runRefresh({trigger, seasonYear})` is the single shared entry for manual + scheduled: module-level in-flight **promise** single-flight (a second concurrent caller coalesces onto the running promise → exactly one `refresh_runs` row), per-source try/catch isolation (§3.8), raw JSON cached to `config.rawDir` per source, ends in `buildAndPublish`, always records a terminal `refresh_runs` row. `__resetSingleFlightForTests()` exported for sub-plan 10. Deviations: (1) no `partial` status in schema — a run that publishes is `succeeded`, partial-failure carried in `perSource`/`counts.failedCount`/`error`; (2) no `PDGA_SOURCE` env flag yet (documented inline). Independently verified: manual run → 3 sources ok, version →1, 3 raw files (incl. 104527), 1 run row; `Promise.all` of two calls → completed+skipped, one new row. typecheck/lint/build 0.
- **05 Read model — ✅ pass.** `build.ts` loads holders → runs pure `computeStandings` → shapes `{rows, updatedAt}` view rows for `championship/pool-a` + `pool-b` (`updatedAt` stamped at this edge, engine stays clock-free). `publish.ts` writes all `read_model` rows for `nextVersion` + upserts `published_pointer` inside ONE raw `sqlite.transaction()` — any throw rolls back both, so the pointer never advances on failure. `buildAndPublish` composes the two; boot's ensure-published slot calls it when the pointer is unset. Independently verified with an absolute `DATA_DIR`: v1 pointer=1; `getPublished` returns 3 rows all 0 pts ranks 1–3 with `updatedAt`; forced mid-transaction `SQLITE_CONSTRAINT_UNIQUE` left pointer at 1 (rollback); clean republish bumped 1→2. Season year `2026` inlined (no shared constant yet). typecheck/lint/build 0.
- **04 Pure engine — ✅ pass.** `olpScore` (`src/server/engine/olp.ts`) returns the raw score; display rounding lives in `roundToOneDecimal` in `src/lib/` (applied at the read-model/UI edge, not in the engine). `computeStandings` (`standings.ts`) splits holders by pool, all at 0 points, ranked ascending tag number (§2.6 tie-break). Shared `Pool`/`StandingRow`/`OlpInput` types live in `src/lib/` (no `server-only`) so the UI shares them without importing server code — `Pool` is deliberately redeclared there rather than imported from the DB schema. Engine takes NO `server-only` import by design. Independently verified via `tsx`: OLP ex1 raw `81.30000000000001`→`81.3`, ex2 `81.4`→`81.4`; standings tag-ascending & all-zero; purity grep found only comment text, no forbidden imports; typecheck/lint/build 0.
- **03 Data layer — ✅ pass.** Added `drizzle-orm@0.45`, `better-sqlite3@12` (deps); `drizzle-kit@0.31`, `@types/better-sqlite3`, `tsx@4` (dev). Schema §12.5 with all domain tables carrying `seasonYear`; **timestamps = UTC ISO-8601 text** (documented). `serverExternalPackages: ['better-sqlite3']` added to keep the native module unbundled (the `.node` binary is traced into `.next/standalone/`). Boot steps 2–3 wired: open WAL DB → apply migrations → idempotent seed. Deviations (documented inline): (1) `schema.ts` omits `import 'server-only'` because `drizzle-kit generate` requires it outside Next's bundler and crashes on the guard — the file has no I/O to protect; (2) `db:migrate`/`db:seed` scripts run with `NODE_OPTIONS=--conditions=react-server` so `server-only` resolves to its no-op outside Next; (3) `tsx` added as the standalone script runner. **Ops note (flagged for sub-plan 11):** Next standalone `server.js` does `process.chdir(__dirname)`, so a *relative* `DATA_DIR` resolves under `.next/standalone/` — production must use an **absolute** `DATA_DIR`. Independently verified with an absolute `DATA_DIR`: fresh boot → `db.migrate`+`db.seed` (1/6/3), 7 tables, EARLY/104527 + MID/LATE placeholders, holders split Pool A=3/B=3 with 3 PDGA#s; second boot idempotent (stable 6/3/1).

## Explicitly out of scope (deferred per §12.14)

Real PDGA scraping / the 403 signature; full domain schema & scoring engine; the four feature views; player profiles; financial engine & ledger; the full admin surface (matching queue, overrides, financial inputs); preview-before-publish; multi-season data; alerting.
