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

// Barrel export for the data layer (sub-plan 03). See
// plans/scaffold/03-data-layer.md and specs/12-Architecture.md §12.5.
export { db, sqlite } from "@server/db/client";
export type { Db } from "@server/db/client";
export { applyMigrations } from "@server/db/migrate";
export { seed } from "@server/db/seed";
export type { SeedCounts } from "@server/db/seed";
export * as schema from "@server/db/schema";
