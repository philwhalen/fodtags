import { NextResponse } from "next/server";

import { auth } from "@server/auth";
import { runRefresh } from "@server/ingestion";

/**
 * "Refresh now" (specs/10-Admin-Console.md §10.7; plans/scaffold/08-auth-admin.md).
 *
 * Director-gated: `src/middleware.ts` already blocks unauthenticated/
 * non-director requests to `/api/admin/:path*`, but this handler re-checks
 * `auth()` itself (defense in depth — CLAUDE.md boundary: admin writes must
 * never rely solely on middleware).
 *
 * Calls the exact same `runRefresh` pipeline the scheduler calls (sub-plan
 * 07) with `trigger: "manual"` — its module-level single-flight guard means
 * a concurrent scheduled run coalesces onto this one rather than racing it.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.isDirector) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await runRefresh({ trigger: "manual", seasonYear: 2026 });
  return NextResponse.json(summary);
}
