import { defineConfig } from "drizzle-kit";

// Reads DATA_DIR directly from process.env (not @server/config) so this
// config file — loaded by the drizzle-kit CLI outside the Next.js/Node
// process — doesn't need the full Zod env validated. Falls back to the same
// default a local `.env` would give, ./data, when unset.
const dataDir = process.env.DATA_DIR ?? "./data";

// See specs/12-Architecture.md §12.5 / §12.12 and src/server/db/schema.ts.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: `${dataDir}/fodtags.db`,
  },
});
