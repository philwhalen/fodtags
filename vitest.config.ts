import path from "node:path";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Vitest configuration (sub-plan 10 — Testing & CI).
 *
 * Two things every test that touches `src/server/` needs, both handled
 * here rather than per-test:
 *
 * 1. `server-only` resolution — every module under `src/server/` (except
 *    the pure engine) starts with `import "server-only"`, which resolves
 *    via that package's `exports` map to a THROWING `index.js` unless the
 *    `"react-server"` condition is active, in which case it resolves to a
 *    no-op `empty.js`. Next's own bundler sets that condition for us; a
 *    plain Vite/Vitest run does not, so we set it explicitly below
 *    (mirrors the `NODE_OPTIONS=--conditions=react-server` used by the
 *    `db:migrate`/`db:seed` CLI scripts — see scripts/db-migrate.ts).
 * 2. Dummy but *valid* env for `@server/config`'s Zod schema, which
 *    `process.exit(1)`s at import time if required vars are missing. Set
 *    via `test.env` so it lands in `process.env` before any test file's
 *    own imports run. `DATA_DIR` here is a placeholder — no unit test
 *    touches the DB; the integration test (`pipeline.test.ts`) points
 *    `DATA_DIR` at its own fresh `fs.mkdtemp` dir before dynamically
 *    importing anything that opens the database (see that file for why
 *    the import has to be dynamic).
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    // Applies to both the "ssr"/node module graph and the default graph —
    // Vitest's node environment runs everything through vite-node, which
    // is effectively always in "ssr" mode, but we set both to be safe.
    conditions: ["react-server"],
  },
  ssr: {
    resolve: {
      conditions: ["react-server"],
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      DATA_DIR: path.join(__dirname, ".vitest-data-unused"),
      PORT: "3000",
      AUTH_SECRET: "vitest-dummy-auth-secret-32-chars-minimum-000",
      GOOGLE_CLIENT_ID: "vitest-dummy-google-client-id",
      GOOGLE_CLIENT_SECRET: "vitest-dummy-google-client-secret",
      BOOTSTRAP_DIRECTOR_EMAIL: "director@example.com",
      APP_TIMEZONE: "America/New_York",
      NODE_ENV: "test",
    },
  },
});
