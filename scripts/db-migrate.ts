/**
 * Standalone CLI runner for `applyMigrations()` — used by CI and ops
 * (`npm run db:migrate`) to apply pending Drizzle migrations without
 * booting the whole Next.js server. Boot (`src/instrumentation.ts`) calls
 * the same `applyMigrations()` function directly.
 *
 * Must be invoked with `NODE_OPTIONS=--conditions=react-server` (baked into
 * the `db:migrate` npm script) — every module under `src/server/` (per
 * CLAUDE.md) imports the `server-only` marker package, which throws unless
 * the "react-server" export condition is active. Next's own build/runtime
 * sets that condition automatically; a plain `tsx`/Node CLI run does not,
 * so we set it explicitly to reach `server-only`'s `empty.js` no-op instead
 * of its throwing `index.js`.
 */
import { applyMigrations } from "@server/db/migrate";

applyMigrations();
console.log("[db:migrate] migrations applied");
