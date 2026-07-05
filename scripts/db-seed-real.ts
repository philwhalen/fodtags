/**
 * Standalone CLI runner for `seedReal()` — opt-in validation-aid seed
 * (plans/financials/06-real-data-seed.md, NOT part of `db:seed`/boot).
 * Writes the committed real-2026 fixture through the real financial-input
 * repositories so the computed financials page/read model can be checked
 * against the league's own hand-maintained numbers.
 *
 * Run with `npm run db:seed:real`, pointed at a fresh/dedicated `DATA_DIR`
 * — see the doc comment on `seedReal` (src/server/db/seed-real.ts) for why.
 * Never invoked by boot or by the default `npm run db:seed`.
 *
 * Must be invoked with `NODE_OPTIONS=--conditions=react-server` (baked into
 * the `db:seed:real` npm script) — every module under `src/server/`
 * imports the `server-only` marker package, which throws unless the
 * "react-server" export condition is active; see the comment in
 * scripts/db-migrate.ts for the full explanation.
 */
import { seedReal } from "@server/db/seed-real";

const counts = seedReal();
console.log("[db:seed:real] real-2026 seed complete", counts);
