/**
 * Standalone CLI runner for `seedRealFinancials()` — opt-in real-data seed
 * that loads the league's actual 2026 financial figures (the committed
 * real-2026 fixture, from the Google Sheet "Financials" tab) onto the real
 * events already present in this DATA_DIR from a live PDGA refresh.
 *
 * This is the financials companion to `db:seed:real-roster`. Use it (NOT
 * `db:seed:real`, which is for a fresh/dedicated DATA_DIR) when the real
 * roster/rounds are already scraped in — see the doc comment on
 * `seedRealFinancials` (src/server/db/seed-real-financials.ts).
 *
 * Run with `npm run db:seed:real-financials`. NOT invoked by boot or the
 * default `npm run db:seed`.
 *
 * Must be invoked with `NODE_OPTIONS=--conditions=react-server` (baked into
 * the `db:seed:real-financials` npm script) — every module under
 * `src/server/` imports the `server-only` marker package, which throws
 * unless the "react-server" export condition is active; see the comment in
 * scripts/db-migrate.ts for the full explanation.
 */
import { seedRealFinancials } from "@server/db/seed-real-financials";

const counts = seedRealFinancials();
console.log("[db:seed:real-financials] real-2026 financials seed complete", counts);
