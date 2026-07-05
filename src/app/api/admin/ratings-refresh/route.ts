import { NextResponse } from "next/server";

import { auth } from "@server/auth";
import { runRatingsRefresh } from "@server/ingestion";

/**
 * "Pull official ratings now" (specs/10-Admin-Console.md §10.7).
 *
 * Director-gated — same defense-in-depth pattern as `/api/admin/refresh`.
 * Calls the same `runRatingsRefresh` pipeline the monthly scheduler job
 * invokes, with `trigger: "manual"`.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.isDirector) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await runRatingsRefresh({ trigger: "manual", seasonYear: 2026 });
  return NextResponse.json(summary);
}
