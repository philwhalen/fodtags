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
// See CLAUDE.md and specs/12-Architecture.md §12.1 / §12.5 / §12.12.
import "server-only";

import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { db } from "@server/db/client";

/**
 * Applies any pending SQL migrations from `drizzle/` to the already-open
 * `db` singleton. Idempotent — Drizzle tracks applied migrations in its own
 * `__drizzle_migrations` bookkeeping table, so re-running is a no-op once
 * the DB is current.
 *
 * Called from boot (`src/instrumentation.ts`, step 2) and from the
 * standalone `db:migrate` script (CI / ops).
 */
export function applyMigrations(): void {
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
}
