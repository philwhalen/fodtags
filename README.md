# FOD Tags Aggregator

A read-only web app for a season-long, tag-holder disc golf league (Field of
Dreams Club Championship). It replaces a hand-maintained Google Sheet with a
computation engine: it ingests raw round data scraped from PDGA Live, applies
the league's published scoring rules, and serves always-current standings,
ratings, OLP pot leaders, and financials on a mobile-first public site. A
Google-auth-gated admin console supplies the data PDGA can't (roster, tag
numbers, pots, adjustments) and triggers refreshes. The app computes results;
it does not mirror the Sheet. See [`CLAUDE.md`](./CLAUDE.md) and
[`specs/00-Master-Spec.md`](./specs/00-Master-Spec.md) for the full product
and architecture definition.

## Local dev quickstart

```bash
cp .env.example .env   # fill in real values — see below
npm install
npm run dev            # http://localhost:3000
```

Filling in `.env`:

- `DATA_DIR`, `PORT`, `BOOTSTRAP_DIRECTOR_EMAIL`, `APP_TIMEZONE`, `NODE_ENV`
  can keep the `.env.example` defaults for local dev.
- `AUTH_SECRET` needs a real random value — generate one with
  `npx auth secret`.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: the dummy placeholder values
  in `.env.example` are fine for `npm run build` / `npm test` (the config
  loader only checks that they're non-empty strings) — but an actual Google
  sign-in against `/admin` requires real OAuth credentials from the Google
  Cloud console.

Migrations and seed data run automatically on boot (`npm run dev` /
`npm run build && npm start`). To run them standalone:

```bash
npm run db:migrate
npm run db:seed
```

Other useful scripts:

```bash
npm test         # vitest run
npm run test:watch
npm run typecheck # tsc --noEmit
npm run lint
npm run build     # next build, output: 'standalone'
```

CI (`.github/workflows/`) runs the same sequence: install → typecheck →
lint → test → build.

## Deploy contract

Deployment mechanics (build/push/restart, the actual VM provisioning) live
in a separate deploy repo. This repo's contract with that repo is
intentionally small (specs/12-Architecture.md §12.12):

- **One Node process**, started as `node .next/standalone/server.js` (the
  `output: 'standalone'` build in `next.config.ts`).
- **One writable, ABSOLUTE `DATA_DIR`.** The standalone server calls
  `process.chdir(__dirname)` on startup (a Next.js standalone-mode quirk),
  so a *relative* `DATA_DIR` (fine for local dev, where it resolves against
  the repo root) would resolve under `.next/standalone/` in production
  instead of the intended persistent directory. **Always set an absolute
  path in production**, e.g. `DATA_DIR=/opt/fodtags/data`. The SQLite
  database lives at `$DATA_DIR/fodtags.db` (WAL mode — also produces
  `fodtags.db-wal` / `fodtags.db-shm`), and the raw PDGA response cache at
  `$DATA_DIR/raw/`.
- **The env vars in `.env.example`** (specs/12-Architecture.md §12.9):
  `DATA_DIR`, `PORT`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `BOOTSTRAP_DIRECTOR_EMAIL`, `APP_TIMEZONE`,
  `NODE_ENV`.
- **The existing VM nginx** terminates TLS and reverse-proxies to
  `http://127.0.0.1:$PORT` (default `3000`), forwarding `X-Forwarded-*` /
  `Host` — the app trusts those headers (`trustHost` in the Auth.js config)
  and owns no TLS/proxy config of its own. Sample block:
  [`docs/nginx.sample.conf`](./docs/nginx.sample.conf).
- **`GET /api/health`** — checks DB connectivity and reports the current
  read-model version; use it as the deploy repo's health/readiness probe.

### Process supervision

The default supervisor is **systemd**: auto-restart, `WorkingDirectory` on
the VM, an `EnvironmentFile` for the vars above, stdout/stderr → journald
(matching the app's pino-to-stdout structured logging). Sample unit:
[`docs/fodtags.service.sample`](./docs/fodtags.service.sample). An external
deploy repo may substitute its own supervisor as long as it honors the same
contract (one process, one `DATA_DIR`, the env vars, `/api/health`).

### Backups

[`scripts/backup.sh`](./scripts/backup.sh) snapshots `$DATA_DIR/fodtags.db`
into a timestamped archive using SQLite's online backup (`VACUUM INTO`) —
safe to run against a live, WAL-mode database, unlike a raw `cp`. It prunes
older snapshots down to a retention count (`BACKUP_RETENTION`, default 14).
The raw PDGA response cache (`$DATA_DIR/raw/`) is intentionally excluded —
it's a reproducible cache, not state needed to restore the app. Requires
the `sqlite3` CLI to be installed on the VM (a provisioning dependency, like
`npm install`/Node itself). Sample systemd timer + service to run it on a
schedule: [`docs/fodtags-backup.timer.sample`](./docs/fodtags-backup.timer.sample),
[`docs/fodtags-backup.service.sample`](./docs/fodtags-backup.service.sample)
(a plain cron entry works just as well).

### Playwright (deferred)

The real PDGA scraper (deferred past this walking skeleton — see
`specs/12-Architecture.md` §12.14) will use Playwright as a fallback when
plain HTTP-with-headers requests are blocked. Installing Playwright's
browser binaries on the VM is a provisioning step for the deploy repo to
pick up once that scraper lands; the walking skeleton ships no Playwright
dependency.
