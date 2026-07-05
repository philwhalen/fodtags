import { redirect } from "next/navigation";

import { getCurrentSubLeagueSlug } from "@server/readmodel/currentSubLeague";

/**
 * `/olp` redirect alias (Spec 06 §6.5): always resolves to the current
 * sub-league. Reads only the published `sub-leagues` meta view via
 * `getCurrentSubLeagueSlug` — never recomputes, never touches
 * `event_sources` directly (CLAUDE.md). Mirrors `sub-league/page.tsx`.
 */
export const dynamic = "force-dynamic";

export default async function OlpAliasPage({
  params,
}: {
  params: Promise<{ season: string }>;
}) {
  const { season } = await params;
  const seasonYear = Number(season);

  // Pre-publish safety net: fall back to a static default slug rather than
  // 404ing before the season's first read model exists.
  const current = getCurrentSubLeagueSlug(seasonYear) ?? "early";

  redirect(`/${season}/olp/${current}`);
}
