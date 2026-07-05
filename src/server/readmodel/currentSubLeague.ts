// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { resolveCurrentSubLeague, todayEt } from "@/lib";
import type { SubLeagueSlug } from "@/lib/public-routes";
import { isValidSubLeague } from "@/lib/public-routes";
import type { PublicSubLeagueMetaPayload } from "@/lib/standings-view";
import { getPublished } from "@server/db/repositories/readModel";

/**
 * Resolves "the current sub-league" (Spec 04 §4.3) as a public route slug,
 * reading only the published `sub-leagues` meta view (never `event_sources`
 * directly — CLAUDE.md's read-model boundary rule) and the shared pure
 * `resolveCurrentSubLeague` helper against the ET clock at request time.
 *
 * Returns `null` when the season is unpublished or the meta view has no
 * dated windows at all; callers fall back to a static default slug
 * (`"early"`, matching the pre-publish "roster at zero" empty posture —
 * plans/leaderboards/02-alias-routes.md).
 */
export function getCurrentSubLeagueSlug(seasonYear: number): SubLeagueSlug | null {
  const published = getPublished(seasonYear, "sub-leagues");
  if (!published) {
    return null;
  }

  const payload = published.payload as PublicSubLeagueMetaPayload;
  const current = resolveCurrentSubLeague(payload.subLeagues, todayEt());
  if (current === null) {
    return null;
  }

  const slug = current.toLowerCase();
  return isValidSubLeague(slug) ? slug : null;
}
