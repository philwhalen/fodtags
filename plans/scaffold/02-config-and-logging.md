# 02 — Config & Logging

**Goal:** One typed `config` module validated with Zod at boot (process refuses to start on missing/invalid env), plus structured `pino` logging to stdout.

**Spec refs:** §12.9, §12.10. **Depends on:** 01.

## Config — `src/server/config/`

- `import 'server-only'` at top.
- Zod schema over `process.env` covering §12.9:

  | Env | Rule |
  |---|---|
  | `DATA_DIR` | non-empty path; SQLite + `raw/` live here |
  | `PORT` | coerced int, default sensible |
  | `AUTH_SECRET` | required (min length) |
  | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | required |
  | `BOOTSTRAP_DIRECTOR_EMAIL` | email |
  | `APP_TIMEZONE` | default `America/New_York` |
  | `NODE_ENV` | enum |

- Parse **once** at module load; export a frozen typed `config`. On failure, log the flattened Zod error and `process.exit(1)` (fail fast).
- Derive convenience paths: `dbPath = ${DATA_DIR}/fodtags.db`, `rawDir = ${DATA_DIR}/raw`.
- **Test hook:** allow an override/injection path (or read from `process.env` set by the test harness) so integration tests can point `DATA_DIR` at a temp dir. Keep it env-driven to avoid a parallel config path.

## `.env.example`

Document every var above with placeholder values and a one-line comment each. Never commit real secrets. Note `.env*` is gitignored except this file.

## Logging — `src/server/logging/`

- `pino` logger to stdout (→ journald under systemd). Pretty transport only in dev.
- Export a base logger + a `child(bindings)` helper for per-job / per-request context.
- Standard events to support (used later): request logs, job start/finish, ingestion outcomes, boot summary.

## Done when

- Importing `config` with a missing required var exits non-zero with a clear message.
- With a valid `.env`, `config` is typed and available to server modules.
- `logger.info` emits structured JSON to stdout.
