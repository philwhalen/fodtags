import { isValidPool, isValidSubLeague } from "./public-routes";
import type { SubLeagueSlug } from "./public-routes";

/**
 * Pure mapping for the `/sub-league` redirect alias family (Spec 04 §4.5).
 * `seg` is the single path segment following `/sub-league` — it is EITHER a
 * pool slug (`pool-a`/`pool-b`, meaning "current sub-league, this pool") OR
 * a sub-league slug (`early`/`mid`/`late`, meaning "this sub-league, default
 * pool A"). Returns the redirect target path, or `null` when `seg` is
 * neither (the caller should `notFound()`).
 *
 * Client-safe and pure — no Next.js imports — so it's unit-testable without
 * a request/route harness (plans/leaderboards/02-alias-routes.md).
 */
export function resolveAliasTarget(
  season: string,
  seg: string,
  currentSlug: SubLeagueSlug,
): string | null {
  if (isValidPool(seg)) {
    return `/${season}/sub-league/${currentSlug}/${seg}`;
  }
  if (isValidSubLeague(seg)) {
    return `/${season}/sub-league/${seg}/pool-a`;
  }
  return null;
}
