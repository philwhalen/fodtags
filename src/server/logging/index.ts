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
// See CLAUDE.md and specs/12-Architecture.md §12.1 / §12.10.
import "server-only";

import pino from "pino";

/**
 * Structured logging (specs/12-Architecture.md §12.10): JSON to stdout in
 * every environment (→ journald under systemd in production), with a
 * human-readable pretty transport swapped in only for local dev.
 *
 * Deliberately reads `NODE_ENV` straight from `process.env` rather than
 * importing `@server/config` — logging has no dependency on config parsing
 * succeeding, so a config validation failure can still be logged clearly
 * (see `src/server/config/index.ts`) without a circular import.
 */
const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
});

/**
 * Create a child logger carrying fixed bindings (e.g. `{ job: "refresh" }`
 * or `{ requestId }`) so every line it emits is automatically tagged.
 * Standard event shapes this supports (per §12.10): request logs, job
 * start/finish, ingestion outcomes, and the boot summary.
 *
 * @example
 * const jobLogger = child({ job: "refresh-run", runId });
 * jobLogger.info({ event: "job.start" }, "refresh run starting");
 * jobLogger.info({ event: "job.finish", durationMs }, "refresh run finished");
 */
export function child(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
