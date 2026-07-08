// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { eq } from "drizzle-orm";

import { db, sqlite } from "@server/db/client";
import { publishedPointer, readModel, tagHolders } from "@server/db/schema";
import { getCurrentVersion } from "@server/db/repositories/readModel";
import type { ViewRow } from "@server/readmodel/build";

/**
 * Write a new `read_model` version, flip `published_pointer` to it, AND
 * write each holder's engine-computed current tag back to
 * `tag_holders.currentTagNumber` (Spec 02 §2.10; tag-reassignment sub-plan
 * 04) — all in ONE SQLite transaction (specs/12-Architecture.md §12.3
 * "recompute + atomic publish"; CLAUDE.md "flips one pointer in a single
 * SQLite transaction"). Readers using `getPublished` see the OLD version
 * until this transaction commits; if anything inside throws, better-
 * sqlite3 rolls the whole transaction back, so a failed build/insert NEVER
 * moves the pointer and NEVER leaves a stale/partial current tag.
 * Idempotent: re-publishing identical views produces a new version with an
 * equivalent payload, which is an acceptable no-op state.
 *
 * Uses the raw `better-sqlite3` handle's `.transaction()` (not Drizzle's
 * own transaction wrapper) per the plan, since `sqlite` is the shared
 * connection both the Drizzle insert calls and the pointer upsert run
 * through — see src/server/db/client.ts.
 */
export function publish(
  seasonYear: number,
  views: ViewRow[],
  currentTags: Record<number, number | null>,
): number {
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

    // Write-back: a night's tag-outs are always a permutation of its
    // tag-ins (Spec 02 §2.10 architecture decision 6), so the FINAL set of
    // current tags is conflict-free — but writing them one-by-one in
    // arbitrary order can transiently collide with `tag_holders`'
    // `(seasonYear, currentTagNumber)` unique index (e.g. holder A moving
    // onto the tag holder B is simultaneously moving off of). SQLite
    // checks UNIQUE constraints per-statement, not deferred to commit, so
    // null every holder's current tag first (nulls never collide — see
    // schema.ts), then set final values in a second pass.
    const holderIds = Object.keys(currentTags).map(Number);
    for (const holderId of holderIds) {
      db.update(tagHolders)
        .set({ currentTagNumber: null })
        .where(eq(tagHolders.id, holderId))
        .run();
    }
    for (const holderId of holderIds) {
      db.update(tagHolders)
        .set({ currentTagNumber: currentTags[holderId] ?? null })
        .where(eq(tagHolders.id, holderId))
        .run();
    }
  });

  runPublish();

  return nextVersion;
}
