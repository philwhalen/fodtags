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
// See CLAUDE.md and specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import path from "node:path";
import { z } from "zod";

/**
 * Single Zod-validated `config` module (specs/12-Architecture.md §12.9).
 *
 * Parsed once, at module load, directly from `process.env` — no parallel
 * config path — so integration tests can point `DATA_DIR` (and any other
 * var) at a temp dir simply by setting `process.env` before this module is
 * first imported. On invalid/missing required env, the process refuses to
 * start: the flattened Zod error is logged and we `process.exit(1)`.
 */
const envSchema = z.object({
  /** Path to the persistent data directory (SQLite file + raw PDGA cache). */
  DATA_DIR: z
    .string({ message: "DATA_DIR is required (path to the persistent data directory)" })
    .trim()
    .min(1, "DATA_DIR must not be empty"),

  /** Port the Node process listens on. */
  PORT: z.coerce
    .number({ message: "PORT must be a number" })
    .int("PORT must be an integer")
    .positive("PORT must be positive")
    .default(3000),

  /** Auth.js signing secret. */
  AUTH_SECRET: z
    .string({ message: "AUTH_SECRET is required" })
    .min(32, "AUTH_SECRET must be at least 32 characters"),

  /** Google OAuth client id (Auth.js Google provider). */
  GOOGLE_CLIENT_ID: z
    .string({ message: "GOOGLE_CLIENT_ID is required" })
    .min(1, "GOOGLE_CLIENT_ID must not be empty"),

  /** Google OAuth client secret (Auth.js Google provider). */
  GOOGLE_CLIENT_SECRET: z
    .string({ message: "GOOGLE_CLIENT_SECRET is required" })
    .min(1, "GOOGLE_CLIENT_SECRET must not be empty"),

  /** Seeds the first row of the `directors` table on boot (idempotent). */
  BOOTSTRAP_DIRECTOR_EMAIL: z
    .string({ message: "BOOTSTRAP_DIRECTOR_EMAIL is required" })
    .email("BOOTSTRAP_DIRECTOR_EMAIL must be a valid email address"),

  /** IANA timezone used for display and the scheduler. */
  APP_TIMEZONE: z.string().trim().min(1).default("America/New_York"),

  /** Standard Node environment. */
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

type Env = z.infer<typeof envSchema>;

interface Config extends Env {
  /** `${DATA_DIR}/fodtags.db` — the SQLite database file. */
  readonly dbPath: string;
  /** `${DATA_DIR}/raw` — raw PDGA response cache. */
  readonly rawDir: string;
}

function loadConfig(): Config {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const flattened = z.flattenError(parsed.error);
    console.error("[config] Invalid environment configuration — refusing to start.");
    console.error(JSON.stringify(flattened, null, 2));
    process.exit(1);
  }

  const env = parsed.data;

  return Object.freeze({
    ...env,
    dbPath: path.join(env.DATA_DIR, "fodtags.db"),
    rawDir: path.join(env.DATA_DIR, "raw"),
  });
}

/**
 * The validated, frozen application config. Parsed once at module load —
 * import this rather than reading `process.env` directly anywhere else in
 * `src/server/`.
 */
export const config: Config = loadConfig();

export type { Config };
