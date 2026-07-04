#!/usr/bin/env bash
#
# scripts/backup.sh — snapshot the FOD Tags SQLite database.
#
# Takes a consistent, timestamped snapshot of the WAL-mode SQLite database
# using SQLite's own online backup (`VACUUM INTO`) rather than a raw file
# `cp`. A plain `cp` of a WAL-mode database can catch the main DB file
# mid-write while the WAL still holds uncommitted/unmerged frames, producing
# a torn, unrestorable copy. `VACUUM INTO` asks SQLite itself to write a
# fully consistent, checkpointed copy, safe to run while the app is live.
#
# Only `$DATA_DIR/fodtags.db` is snapshotted. `$DATA_DIR/raw/` (the cached
# raw PDGA scrape responses) is INTENTIONALLY EXCLUDED: it is a reproducible
# cache, not source-of-truth state — a fresh refresh repopulates it, and it
# is not needed to restore the app to a working state from a snapshot. If
# that ever changes (e.g. raw responses become the only record of a
# since-removed PDGA page), revisit this decision.
#
# Retention: keeps the N most recent snapshots (by count, not age) and
# deletes older ones. N defaults to 14, overridable via the
# BACKUP_RETENTION env var or a positional argument (arg wins).
#
# Safe to invoke repeatedly from cron or a systemd timer (see
# docs/fodtags-backup.timer.sample / docs/fodtags-backup.service.sample):
# each run is independent, produces one new snapshot, and prunes down to
# the retention count. Exits non-zero on any failure (missing DB, missing
# sqlite3, a failed VACUUM INTO, etc.) so the caller/timer surfaces it.
#
# Usage:
#   scripts/backup.sh [retention-count]
#
# Env:
#   DATA_DIR          Path to the persistent data directory (default: ./data).
#                      Must be an ABSOLUTE path in production — see README.
#   BACKUP_DEST        Directory snapshots are written to (default: $DATA_DIR/backups).
#   BACKUP_RETENTION  Number of snapshots to retain (default: 14).

set -euo pipefail

DATA_DIR="${DATA_DIR:-./data}"
DB="${DATA_DIR%/}/fodtags.db"
DEST="${BACKUP_DEST:-${DATA_DIR%/}/backups}"
RETENTION="${1:-${BACKUP_RETENTION:-14}}"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "backup.sh: 'sqlite3' CLI not found on PATH — install it (VM provisioning dependency, see README)." >&2
  exit 1
fi

if [[ ! "$RETENTION" =~ ^[0-9]+$ ]] || [[ "$RETENTION" -lt 1 ]]; then
  echo "backup.sh: retention count must be a positive integer, got '$RETENTION'" >&2
  exit 1
fi

if [[ ! -f "$DB" ]]; then
  echo "backup.sh: database not found at '$DB' (check DATA_DIR)" >&2
  exit 1
fi

mkdir -p "$DEST"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
snapshot="${DEST%/}/fodtags-${timestamp}.db"

if [[ -e "$snapshot" ]]; then
  echo "backup.sh: snapshot '$snapshot' already exists — refusing to overwrite" >&2
  exit 1
fi

tmp_snapshot="${snapshot}.tmp"
trap 'rm -f "$tmp_snapshot"' EXIT

sqlite3 "$DB" "VACUUM INTO '${tmp_snapshot}';"
mv "$tmp_snapshot" "$snapshot"
trap - EXIT

echo "backup.sh: wrote snapshot ${snapshot}"

# Retention: keep the $RETENTION most recent fodtags-*.db snapshots in
# $DEST, delete the rest. Sort lexicographically — the UTC timestamp format
# (YYYYMMDDTHHMMSSZ) sorts correctly as a string — newest last.
mapfile -t snapshots < <(find "$DEST" -maxdepth 1 -type f -name 'fodtags-*.db' | sort)

count="${#snapshots[@]}"
if (( count > RETENTION )); then
  to_delete=$(( count - RETENTION ))
  for ((i = 0; i < to_delete; i++)); do
    echo "backup.sh: pruning old snapshot ${snapshots[$i]}"
    rm -f "${snapshots[$i]}"
  done
fi

echo "backup.sh: retention ${RETENTION}, $(find "$DEST" -maxdepth 1 -type f -name 'fodtags-*.db' | wc -l) snapshot(s) remain"
