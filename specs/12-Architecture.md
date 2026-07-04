# 12 — Architecture & Scaffold

← [Master Spec](./00-Master-Spec.md)

## Purpose

This is the **architecture spec**: the core technical decisions needed to stand the app up to a running "hello world" (a *walking skeleton*) and the shape everything else grows into. It turns the non-binding "recommended technical shape" in [Spec 11 §11.7](./11-UX-and-Nonfunctional.md#117-recommended-technical-shape-non-binding) into concrete choices.

It deliberately does **not** implement features. It defines the runtime, the layering, the data layer, the job model, and the project structure so that the four core features ([04](./04-Feature-Leaderboards.md)–[07](./07-Feature-Pool-Score-Sheets.md)), profiles, financials, and the admin console can be built on a proven foundation.

## 12.0 Decisions at a glance

| Concern | Decision | Why |
|---|---|---|
| **Runtime** | Node.js LTS + TypeScript (strict) | Single language across UI, ingestion, and engine. |
| **Web framework** | **Next.js (App Router)**, one full-stack app | SSR for fast mobile first paint + shareable deep links; route handlers for admin/API; ingestion, jobs, and engine co-located as server-only modules. One thing to deploy. |
| **Hosting** | **Single long-running Node process on a Google Cloud VM** | Full control of the box; a persistent process fits scheduled scraping + a headless-browser fallback, which serverless does not. Deploy handled by an external repo (provided later). |
| **Database** | **SQLite** (single file), accessed via **Drizzle ORM** with `better-sqlite3` | Trivial ops at this scale (~50 holders, ~29 nights/season): no external service, backup = copy the file. Repository layer keeps a Postgres move open later. |
| **Scheduler** | **In-process, timezone-aware cron** (`croner`) | The Thursday 9 PM ET and monthly 2nd-Tuesday jobs live in the same process as the app. No external scheduler to operate. |
| **PDGA ingestion** | Server-only fetcher behind an interface: **HTTP-with-browser-headers first, Playwright headless fallback** | Meets [Spec 03 §3.1](./03-Data-Ingestion-and-PDGA.md#31-known-constraint-pdga-blocks-naive-clients-and-has-no-open-api). Interface lets the skeleton ship a stub and swap the real fetcher in later. |
| **Auth** | **Auth.js (NextAuth)** with Google OAuth + a director **email allowlist** | Matches [Spec 10 §10.1](./10-Admin-Console.md#101-access--audit); no custom credential handling. |
| **Config** | Env vars parsed and validated with **Zod** at boot | Fail fast on misconfiguration; one typed `config` module. |
| **Testing** | **Vitest** | Fast unit tests for the pure engine (the 81.3 / 81.4 OLP fixtures) plus integration tests. |
| **Process supervision** | **systemd** unit (default recommendation) | Native to the VM, auto-restart, journald logs — no extra runtime dependency. The external deploy repo may substitute its own supervisor. |

## 12.1 Guiding principles

1. **Simple deployment & operations first.** One process, one file-backed database, one supervisor. Every added moving part must earn its place. This is the top-priority architecture principle for launch.
2. **The engine is pure.** Scoring, OLP, and financial math ([Spec 02](./02-Domain-Model-and-Scoring.md), [Spec 09](./09-Financials.md)) are functions of plain inputs → plain outputs, with **no I/O, no clock, no DB**. That is what makes the hand-calculation acceptance criteria testable.
3. **Public reads never touch PDGA or recompute.** Requests serve a **precomputed, atomically published read model** ([Spec 03 §3.7](./03-Data-Ingestion-and-PDGA.md#37-ingestion-pipeline), [Spec 11 §11.3](./11-UX-and-Nonfunctional.md#113-performance)).
4. **Season-scoped from day one.** Everything keys on `season/year` so past seasons can be added later without reshaping the schema ([Spec 11 §11.6](./11-UX-and-Nonfunctional.md#116-data--history)).
5. **Server-only means server-only.** PDGA access, secrets, and the DB never reach the client bundle (enforced with the `server-only` import guard).

## 12.2 Runtime topology

A single VM runs one Node process. Everything is in-process; nothing else needs to be operated.

```
                       Google Cloud VM (Linux)
 ┌─────────────────────────────────────────────────────────────┐
 │  nginx (already on the VM)  ──►  Next.js Node process        │
 │   terminates TLS, proxies        (systemd)                   │
 │   to PORT                        ├─ SSR public site          │
 │                                  ├─ /admin (Auth.js gated)   │
 │                                  ├─ route handlers (/api)     │
 │                                  ├─ in-process scheduler ──┐  │
 │                                  └─ ingestion + engine ◄───┘  │
 │                                        │                      │
 │                                        ▼                      │
 │        data/  (persistent dir on the VM)                     │
 │          ├─ fodtags.db        (SQLite, WAL mode)             │
 │          └─ raw/              (cached raw PDGA responses)     │
 └─────────────────────────────────────────────────────────────┘
                     │  server-side only  ▲
                     ▼                    │
                 PDGA Live  (HTTP-with-headers → Playwright fallback)
```

- **TLS / reverse proxy:** the VM **already runs nginx** for other apps; it terminates TLS and proxies to the Node process on `PORT`. The app owns no proxy config — it just listens on `PORT` and trusts `X-Forwarded-*`. Adding the nginx `server` block for this app is an ops/deploy step (a sample block ships in the repo docs for reference).
- **Persistence:** the SQLite file and the raw-response cache live under a single `data/` directory on the VM (path from env). SQLite runs in **WAL mode** so public reads proceed while a refresh writes. A **backup script in the repo** (§12.12) snapshots this directory on a schedule.
- **No external services** at launch: no separate DB server, cache, queue, or scheduler.

## 12.3 Application layering

The pipeline from [Spec 03 §3.7](./03-Data-Ingestion-and-PDGA.md#37-ingestion-pipeline) maps directly onto module boundaries. Data flows one way; the web tier only ever reads the published read model.

```
 PDGA ──► Ingestion ──► Normalized store ──► Engine (pure) ──► Read model ──► Web UI
          (I/O)         (Drizzle/SQLite)     (no I/O)          (published)    (SSR)
                              ▲                                     │
                     Admin inputs (roster, financials, overrides)  │
                              └──────────── recompute + atomic publish
```

| Layer | Responsibility | Purity |
|---|---|---|
| **Ingestion** | Fetch per event source, normalize, match players to holders, cache raw, persist snapshots. Records a **refresh run**. | I/O, server-only |
| **Normalized store** | Source of truth: roster, event sources, raw + normalized results, ratings history, financial inputs, audit log, refresh runs. | I/O (Drizzle) |
| **Engine** | Championship totals, per-pool ranks, tie-breaks, top-N caps, OLP scores, skins qualification, financial splits. Deterministic functions. | **Pure** |
| **Read model** | Materialize the exact shapes each view needs; publish atomically as a new version. | I/O |
| **Web UI** | SSR public pages + admin console. Reads only the published read model (+ admin reads/writes the store). | I/O |

**Recompute + atomic publish.** A refresh or an admin change runs: normalize/persist → load inputs → run the pure engine → write the results into a **new read-model version** → flip the "current version" pointer in a **single SQLite transaction**. Readers see the old version until the commit, so a partial or failed refresh never corrupts public views ([Spec 03 §3.8](./03-Data-Ingestion-and-PDGA.md#38-resilience--failure-handling), [Spec 11 §11.4](./11-UX-and-Nonfunctional.md#114-reliability--correctness)). Recompute is idempotent.

## 12.4 Project structure

One Next.js app. Server-only concerns live under `src/server`; the pure engine is isolated so it can be tested and reasoned about on its own.

```
fodtags/
  specs/
  src/
    app/                      # Next.js App Router
      (public)/[season]/…     # leaderboards, rounds, olp, score-sheets, financials, player
      admin/                  # director console (gated by middleware)
      api/                    # route handlers: refresh trigger, health, auth
      layout.tsx
    server/                   # server-only (guarded by `import 'server-only'`)
      ingestion/
        pdga/                 # fetcher: http-with-headers + playwright fallback (behind an interface)
        normalize.ts
        match.ts              # PDGA entrant → tag holder
      engine/                 # PURE: scoring, OLP, financials. No DB, no clock, no fetch.
      readmodel/              # build + publish precomputed views
      jobs/                   # scheduler registration + job definitions
      db/                     # drizzle client, schema, repositories, seed
      auth/                   # Auth.js config + director allowlist
      config/                 # Zod-validated env
      logging/
    lib/                      # shared pure types/utils used by UI and server
  drizzle/                    # generated SQL migrations
  data/                       # SQLite file + raw/ cache (gitignored; lives on the VM)
  next.config.ts              # output: 'standalone'
  drizzle.config.ts
  .env.example
```

Boundary rules: `server/engine` imports nothing from `db`, `ingestion`, or Next.js. `app/(public)` reads only via `readmodel`. Secrets and PDGA access exist only under `server/`.

## 12.5 Data layer

- **Access:** Drizzle ORM over `better-sqlite3` (synchronous, fast, ideal for a single-process server). Schema is defined in TypeScript; migrations are generated into `drizzle/` and applied on boot (and in CI).
- **Season scoping:** every domain table carries a `seasonYear` (or FK to `seasons`). No table assumes a single season.
- **Raw retention:** each refresh writes the raw PDGA payloads to `data/raw/` (and/or a `raw_snapshots` table) so results can be reprocessed without re-fetching ([Spec 03 §3.8](./03-Data-Ingestion-and-PDGA.md#38-resilience--failure-handling)).
- **Read model as published snapshot:** view-shaped rows written under a monotonically increasing `version`; a single `published_pointer` row names the live version. The flip is one transaction (see §12.3).
- **Time:** all timestamps stored in **UTC**; formatted to **ET** at the edge ([Spec 03 §3.6](./03-Data-Ingestion-and-PDGA.md#36-refresh-cadence)).

**Skeleton schema (minimum to exercise every layer — full domain schema arrives with the feature specs):**

| Table | Purpose |
|---|---|
| `seasons` | `{ year, … }` — the top scope. Seeded with 2026. |
| `tag_holders` | Roster subset: name, tag number, pool, entry date, PDGA #, active. |
| `event_sources` | Registered PDGA events: `pdgaEventId`, `type`, `active`, `label` ([Spec 03 §3.4](./03-Data-Ingestion-and-PDGA.md#34-event-registration-model)). |
| `directors` | Admin allowlist: email, added-by, added-at, active. Managed from the admin console; seeded with a bootstrap director. |
| `refresh_runs` | Per-run record: trigger, start/end, per-source status, counts, errors ([Spec 03 §3.6](./03-Data-Ingestion-and-PDGA.md#36-refresh-cadence)). |
| `read_model` | Versioned published view rows + a current-version pointer. |
| `audit_log` | Who/what/when/before/after for admin changes ([Spec 10 §10.1](./10-Admin-Console.md#101-access--audit)). |

## 12.6 Scheduling & jobs

- **In-process, timezone-aware** scheduler (`croner`), started once on boot. Two jobs at launch:
  - **Thursday 21:00 America/New_York** — full refresh of active sources ([Spec 03 §3.6](./03-Data-Ingestion-and-PDGA.md#36-refresh-cadence)).
  - **Monthly, 2nd Tuesday, America/New_York** — official player-ratings pull ([Spec 02 §2.2](./02-Domain-Model-and-Scoring.md#22-pools--eligibility), [Spec 03 §3.1](./03-Data-Ingestion-and-PDGA.md#31-known-constraint-pdga-blocks-naive-clients-and-has-no-open-api)).
- **Manual trigger:** the admin "Refresh now" button posts to a route handler that runs the **same** pipeline function as the schedule (identical results — [Spec 03 §3.6](./03-Data-Ingestion-and-PDGA.md#36-refresh-cadence)).
- **Single-flight:** a run guard prevents overlapping refreshes; each run is recorded in `refresh_runs`, so a restart mid-window is visible and the next trigger recovers.
- On boot, the app logs the next fire time of each job.

## 12.7 Ingestion boundary

Defined as an interface so the skeleton ships without the real scraper:

```ts
interface PdgaSource {
  fetchEvent(eventId: string, opts): Promise<RawEventPayload>;
}
```

- Real implementation: HTTP with realistic `User-Agent`/`Accept`/`Referer`, polite rate limiting and backoff; **Playwright headless fallback** when headers alone still 403. The exact 403-avoiding request signature is a known implementation spike ([Spec 03 §3.1](./03-Data-Ingestion-and-PDGA.md#31-known-constraint-pdga-blocks-naive-clients-and-has-no-open-api)) and is **not** solved in the scaffold.
- Skeleton implementation: a stub returning an empty payload, so the pipeline runs end-to-end and records a run without contacting PDGA.
- All of this is server-only; the client bundle never imports it.

## 12.8 Auth & admin

- **Auth.js** with the Google provider. On sign-in, the verified email is checked against the **`directors` table** (see §12.5). Non-allowlisted accounts are rejected. Directors are added/removed from the admin console — no redeploy to change the roster — with each change audited.
- **Bootstrap:** the first director can't be added through the gated UI, so on boot the app upserts the email in `BOOTSTRAP_DIRECTOR_EMAIL` into `directors` (idempotent). After that, the table is the source of truth.
- Next.js **middleware** gates all `/admin/*` routes and admin route handlers.
- The signed-in director's identity is attached to every write for the audit log ([Spec 10 §10.1](./10-Admin-Console.md#101-access--audit)).
- The public site requires no auth and performs no writes.

## 12.9 Configuration & secrets

Single Zod-validated `config` module, loaded at boot; the process refuses to start if required values are missing.

| Env | Purpose |
|---|---|
| `DATA_DIR` | Path to the persistent `data/` directory (SQLite + raw cache). |
| `PORT` | Port the Node process listens on. |
| `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Auth.js / Google OAuth. |
| `BOOTSTRAP_DIRECTOR_EMAIL` | Seeds the first row of the `directors` table on boot; thereafter the table is authoritative. |
| `APP_TIMEZONE` | `America/New_York` (display + scheduler). |
| `NODE_ENV` | standard. |

`.env.example` documents them all; real secrets are provided by the deploy environment, never committed.

## 12.10 Observability

- **Structured logging** (e.g. `pino`) to stdout → journald under systemd. Request logs, job start/finish, ingestion outcomes.
- **`GET /api/health`** — returns OK plus a DB connectivity check and the current read-model version; suitable for the deploy repo's health checks.
- **Run history** is first-class data (`refresh_runs`), surfaced in the admin console ([Spec 10 §10.7](./10-Admin-Console.md#107-ingestion-control)).

## 12.11 Testing strategy

- **Vitest** across the board.
- **Engine unit tests** are the priority: fixture in → expected out, reproducing hand calculations, including the OLP worked examples computing to **81.3** and **81.4** exactly ([Spec 02 acceptance](./02-Domain-Model-and-Scoring.md#acceptance-criteria)). Enabled by engine purity (§12.1).
- **Integration tests** for the pipeline (stub source → run → published read model → page renders empty roster).
- **CI** runs: install → typecheck → lint → test → `next build`.

## 12.12 Build & deployment

- **Build:** `next build` with `output: 'standalone'` → a self-contained server bundle run as `node .next/standalone/server.js`.
- **Node:** pinned LTS (`.nvmrc` / `engines`).
- **Migrations:** applied on startup (and verified in CI).
- **Supervision:** a **systemd** unit (auto-restart, `WorkingDirectory` on the VM, env file, journald logs) is the default. Your external deploy repo owns the actual rollout; the app only assumes a persistent process, a writable `DATA_DIR`, the existing nginx proxying to `PORT`, and the env vars above.
- **Backups:** a **backup script in the repo** (`scripts/backup.sh`) produces a consistent snapshot of `DATA_DIR` — using SQLite's online backup / `VACUUM INTO` so a copy taken mid-write is valid — into a timestamped archive, pruning older ones by a retention count. Scheduled via a systemd timer (or cron) provisioned alongside the app; destination/offsite copy is an ops choice.
- **Playwright:** its browser binaries are installed on the VM as part of provisioning (documented for the deploy repo).

> Deployment mechanics (build/push/restart) come from a separate repo you'll provide. This spec's contract with that repo is intentionally small: **one Node process, one `DATA_DIR`, the env in §12.9, and a `/api/health` check.**

## 12.13 The walking skeleton (first deliverable)

"Hello world" here means every layer is wired and provably runs — no features implemented.

- [ ] Next.js app boots; TypeScript strict; lint clean.
- [ ] SQLite via Drizzle with an initial migration for the §12.5 skeleton tables; migrations apply on boot.
- [ ] Seed script: 2026 season + a handful of tag holders + the 3 sub-league event sources.
- [ ] One public page — `/2026/championship/pool-a` — renders the roster at **0 points** (the pre-season empty state, [Spec 04 §4.4](./04-Feature-Leaderboards.md#44-states)) by reading the **published read model**.
- [ ] Admin: Google sign-in via Auth.js; `/admin` gated by the `directors` table (bootstrapped from `BOOTSTRAP_DIRECTOR_EMAIL`); a stub dashboard.
- [ ] "Refresh now" button → runs the pipeline with the **stub** PDGA source, records a `refresh_runs` row, and republishes.
- [ ] Scheduler registered (Thursday 21:00 ET + monthly 2nd-Tuesday), calling the same pipeline; next-fire times logged on boot.
- [ ] `GET /api/health` green (DB reachable, read-model version reported).
- [ ] Vitest set up with one passing engine test (assert the OLP formula on the two worked examples once the engine signature exists) and one pipeline integration test.
- [ ] `.env.example`, Zod config validation, `server-only` guards in place.
- [ ] `scripts/backup.sh` snapshots `DATA_DIR` (via `VACUUM INTO`) with retention; sample nginx `server` block in the repo docs.
- [ ] CI green: typecheck, lint, test, build.

**Acceptance:** the app starts on the VM, a director signs in and clicks "Refresh now," a run is recorded, the public page renders the empty roster with an "Updated {time} ET" stamp, and `/api/health` is green — with PDGA scraping, the scoring engine, and all feature views still to be built.

## 12.14 Explicitly deferred

Real PDGA scraping / the 403 signature; the full domain schema and scoring engine; all four feature views; player profiles; the financial engine and ledger; the full admin surface (matching queue, overrides, financial inputs); preview-before-publish; multi-season data; alerting. Each arrives with its owning feature spec, on top of this scaffold.

← Prev: [11 — UX & Non-Functional](./11-UX-and-Nonfunctional.md) · [Master Spec](./00-Master-Spec.md)
