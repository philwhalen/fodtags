/**
 * Standalone CLI runner for `seed()` — used by CI/ops (`npm run db:seed`)
 * to seed without booting the whole Next.js server. Boot
 * (`src/instrumentation.ts`) calls the same `seed()` function directly,
 * after migrations. Idempotent either way — see src/server/db/seed.ts.
 *
 * Must be invoked with `NODE_OPTIONS=--conditions=react-server` (baked into
 * the `db:seed` npm script) — see the comment in scripts/db-migrate.ts for
 * why the `server-only` guard needs that condition outside of Next's own
 * build/runtime.
 */
import { seed } from "@server/db/seed";

const counts = seed();
console.log("[db:seed] seed complete", counts);
