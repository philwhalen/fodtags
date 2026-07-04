// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@server/db/client";
import { publishedPointer, readModel } from "@server/db/schema";

/**
 * Thin, typed data access — READ side only. The write/publish path (writing
 * a new version and flipping `published_pointer` in one transaction) is
 * sub-plan 05 and deliberately NOT built here.
 */

/** The currently-live version for a season, or `undefined` if never published. */
export function getCurrentVersion(seasonYear: number): number | undefined {
  const row = db
    .select({ currentVersion: publishedPointer.currentVersion })
    .from(publishedPointer)
    .where(eq(publishedPointer.seasonYear, seasonYear))
    .get();
  return row?.currentVersion;
}

/**
 * The published row for a given view, read at whatever version is
 * currently live. `undefined` if nothing has been published yet, or if this
 * `viewKey` isn't part of the published version.
 */
export function getPublished(seasonYear: number, viewKey: string) {
  const version = getCurrentVersion(seasonYear);
  if (version === undefined) {
    return undefined;
  }

  return db
    .select()
    .from(readModel)
    .where(
      and(
        eq(readModel.seasonYear, seasonYear),
        eq(readModel.version, version),
        eq(readModel.viewKey, viewKey),
      ),
    )
    .get();
}
