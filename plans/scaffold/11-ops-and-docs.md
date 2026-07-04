# 11 — Ops & Docs

**Goal:** The repo-side operational artifacts §12.12/§12.13 call for: a consistent backup script, a sample nginx block, a systemd unit, and a README that states the deploy contract. Deployment *mechanics* live in a separate repo — this is only what the app repo ships.

**Spec refs:** §12.2, §12.12, §12.13. **Depends on:** 03 (needs `DATA_DIR` / SQLite conventions).

## `scripts/backup.sh`

- Snapshot `DATA_DIR` into a **timestamped archive** using SQLite's online backup so a mid-write copy is valid — `sqlite3 "$DB" "VACUUM INTO '<dest>/fodtags-<ts>.db'"` (not a raw `cp`, which can catch a torn WAL).
- Also capture anything else under `DATA_DIR` needed for restore (the `raw/` cache is reproducible — document whether it's included).
- **Retention:** keep the most recent N archives, prune older by count. N configurable via arg/env.
- Idempotent, safe to run from a systemd timer or cron. Exit non-zero on failure.

## Sample nginx `server` block — `docs/nginx.sample.conf`

- TLS terminated by the **existing** nginx; `proxy_pass` to `http://127.0.0.1:${PORT}`; forward `X-Forwarded-*` (the app trusts these, owns no proxy config — §12.2). Comment that adding this block is an ops/deploy step.

## systemd unit — `docs/fodtags.service.sample`

- `WorkingDirectory` on the VM, `EnvironmentFile` for §12.9 vars, `ExecStart=node .next/standalone/server.js`, auto-restart, journald logging (§12.12). Note the external deploy repo may substitute its own supervisor. Optionally a `fodtags-backup.timer` sample for `scripts/backup.sh`.

## README

- What the app is (one paragraph), local dev quickstart (`.env` from `.env.example`, `npm run dev`), and the **deploy contract** (§12.12): one Node process, one writable `DATA_DIR`, the env in §12.9, existing nginx → `PORT`, `/api/health` probe. Point to `docs/` samples. Note Playwright browser install is a VM-provisioning step (deferred with the real scraper).

## Done when

- `scripts/backup.sh` produces a valid `VACUUM INTO` snapshot and prunes to the retention count (verify against a seeded DB).
- `docs/` contains the nginx + systemd samples; README states the deploy contract.
