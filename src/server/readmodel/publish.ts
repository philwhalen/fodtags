// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { db, sqlite } from "@server/db/client";
import { publishedPointer, readModel } from "@server/db/schema";
import { getCurrentVersion } from "@server/db/repositories/readModel";
import type { ViewRow } from "@server/readmodel/build";

/**
 * Write a new `read_model` version and flip `published_pointer` to it, in
 * ONE SQLite transaction (specs/12-Architecture.md §12.3 "recompute +
 * atomic publish"; CLAUDE.md "flips one pointer in a single SQLite
 * transaction"). Readers using `getPublished` see the OLD version until
 * this transaction commits; if anything inside throws, better-sqlite3
 * rolls the whole transaction back, so a failed build/insert NEVER moves
 * the pointer. Idempotent: re-publishing identical views produces a new
 * version with an equivalent payload, which is an acceptable no-op state.
 *
 * Uses the raw `better-sqlite3` handle's `.transaction()` (not Drizzle's
 * own transaction wrapper) per the plan, since `sqlite` is the shared
 * connection both the Drizzle insert calls and the pointer upsert run
 * through — see src/server/db/client.ts.
 */
export function publish(seasonYear: number, views: ViewRow[]): number {
  const nextVersion = (getCurrentVersion(seasonYear) ?? 0) + 1;
  const builtAt = new Date().toISOString();

  const runPublish = sqlite.transaction(() => {
    for (const view of views) {
      db.insert(readModel)
        .values({
          seasonYear: view.seasonYear,
          version: nextVersion,
          viewKey: view.viewKey,
          payload: view.payload,
          builtAt,
        })
        .run();
    }

    db.insert(publishedPointer)
      .values({ seasonYear, currentVersion: nextVersion })
      .onConflictDoUpdate({
        target: publishedPointer.seasonYear,
        set: { currentVersion: nextVersion },
      })
      .run();
  });

  runPublish();

  return nextVersion;
}
