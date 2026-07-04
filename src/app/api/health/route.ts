import { NextResponse } from "next/server";

import { getSeason } from "@server/db/repositories/seasons";
import { getCurrentVersion } from "@server/db/repositories/readModel";

/**
 * Deploy health probe (specs/12-Architecture.md §12.10;
 * plans/scaffold/09-public-and-health.md). Deliberately unauthenticated —
 * `src/middleware.ts`'s matcher only covers `/admin/:path*` and
 * `/api/admin/:path*`, so this route is reachable without a session.
 *
 * `getSeason(2026)` is the trivial DB connectivity check; a thrown error
 * (e.g. the DB file is missing/locked) is reported as a non-200 error
 * response rather than crashing, so an external probe gets a clean
 * up/down signal.
 */

// Never statically cache this route — it must reflect live DB/read-model
// state on every request.
export const dynamic = "force-dynamic";

const SEASON_YEAR = 2026;

export async function GET() {
  try {
    getSeason(SEASON_YEAR);
    const readModelVersion = getCurrentVersion(SEASON_YEAR);

    return NextResponse.json({
      status: "ok",
      db: "ok",
      readModelVersion: readModelVersion ?? null,
      time: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        db: "error",
        error: error instanceof Error ? error.message : String(error),
        time: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
