/**
 * Standalone CLI runner for `seedRealRoster()` — opt-in real-data
 * validation seed (loads the league's actual 2026 roster from the Google
 * Sheet, names + pool only). NOT part of `db:seed`/boot.
 *
 * Run with `npm run db:seed:real-roster`, pointed at a fresh `DATA_DIR`
 * with `SEED_SYNTHETIC=false` — see the doc comment on `seedRealRoster`
 * (src/server/db/seed-real-roster.ts) for the full rationale.
 *
 * Must be invoked with `NODE_OPTIONS=--conditions=react-server` (baked into
 * the `db:seed:real-roster` npm script) — every module under `src/server/`
 * imports the `server-only` marker package, which throws unless the
 * "react-server" export condition is active; see scripts/db-migrate.ts.
 */
import { seedRealRoster } from "@server/db/seed-real-roster";

const counts = seedRealRoster();
console.log("[db:seed:real-roster] real-2026 roster seed complete", counts);
