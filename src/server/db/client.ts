// Server-only boundary convention.
//
// Everything under `src/server/` runs only in the Node process and must
// never reach the client bundle (secrets, DB access, PDGA fetching). Every
// module added under `src/server/` (with the deliberate exception of
// `src/server/engine/`, which stays plain-inputs/plain-outputs pure — see
// `src/server/engine/index.ts`) should start with this same import so an
// accidental client-side import fails the build loudly instead of quietly
// leaking server internals to the browser.
//
// See CLAUDE.md and specs/12-Architecture.md §12.1 / §12.5.
import "server-only";

import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { config } from "@server/config";
import * as schema from "@server/db/schema";

/**
 * Open (or create) the SQLite database at `config.dbPath`, ensuring
 * `DATA_DIR` and `DATA_DIR/raw` exist first (mkdir -p) since a fresh
 * deployment/VM won't have them yet.
 */
function openDatabase(): Database.Database {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  fs.mkdirSync(config.rawDir, { recursive: true });

  const sqlite = new Database(config.dbPath);

  // WAL mode: readers don't block the writer, ideal for a single-process
  // server handling concurrent public-page reads alongside admin writes.
  sqlite.pragma("journal_mode = WAL");
  // Enforce FK constraints (off by default in SQLite).
  sqlite.pragma("foreign_keys = ON");
  // Wait up to 5s for a locked DB instead of failing immediately — smooths
  // over brief writer contention (e.g. a refresh publish) under WAL.
  sqlite.pragma("busy_timeout = 5000");

  return sqlite;
}

/**
 * The raw `better-sqlite3` handle, exported alongside `db` because some
 * operations fall outside Drizzle's query builder: `VACUUM INTO` for
 * `scripts/backup.sh` (sub-plan 11), and hand-rolled transactions.
 */
export const sqlite: Database.Database = openDatabase();

/** The singleton Drizzle client — import this everywhere data access happens. */
export const db = drizzle(sqlite, { schema });

export type Db = typeof db;
