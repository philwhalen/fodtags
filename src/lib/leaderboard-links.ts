import type { PoolSlug, SubLeagueSlug } from "./public-routes";
import { VALID_SUB_LEAGUES } from "./public-routes";

/**
 * Describes the leaderboard view currently on screen — the inputs the
 * toggle/picker controls need to compute the §4.5 deep link for every other
 * view reachable from here (Spec 04 §4.1/§4.6; plans/leaderboards/03-toggle-controls.md).
 */
export interface LeaderboardView {
  seasonYear: number;
  scope: "championship" | "sub-league";
  pool: PoolSlug;
  /** Set iff `scope === "sub-league"` — the explicit sub-league being viewed. */
  subLeague?: SubLeagueSlug;
}

/** The explicit §4.5 deep links every control on the leaderboard page needs. */
export interface LeaderboardLinks {
  /** "Overall Championship" option, preserving `view.pool`. */
  championshipHref: string;
  /** Preserves the current view's sub-league (if any); flips the pool. */
  poolAHref: string;
  poolBHref: string;
  /** One direct link per sub-league (the Early/Mid/Late options in the
   * unified view control), each preserving `view.pool`. */
  subLeaguePickerHrefs: Record<SubLeagueSlug, string>;
}

/**
 * Pure, client-safe link builder for the leaderboard view control
 * (Spec 04 §4.1/§4.6). The control is a single segmented cluster —
 * **Overall Championship · Early · Mid · Late** — plus a pool toggle. Every
 * href is an explicit `/season/scope/.../pool` deep link — no alias
 * redirects — so the controls resolve instantly and a shared link always
 * reproduces the exact view (§4.5).
 *
 * Preservation rules encoded here (not in the component):
 * - Each view option (Overall Championship or a specific sub-league) keeps
 *   `view.pool`.
 * - Pool toggle keeps the current view (Championship, or `view.subLeague`).
 */
export function buildLeaderboardLinks(view: LeaderboardView): LeaderboardLinks {
  const { seasonYear, pool, subLeague } = view;

  const championshipHref = `/${seasonYear}/championship/${pool}`;

  const poolAHref =
    view.scope === "sub-league"
      ? `/${seasonYear}/sub-league/${subLeague}/pool-a`
      : `/${seasonYear}/championship/pool-a`;
  const poolBHref =
    view.scope === "sub-league"
      ? `/${seasonYear}/sub-league/${subLeague}/pool-b`
      : `/${seasonYear}/championship/pool-b`;

  const subLeaguePickerHrefs = Object.fromEntries(
    VALID_SUB_LEAGUES.map((slug) => [slug, `/${seasonYear}/sub-league/${slug}/${pool}`]),
  ) as Record<SubLeagueSlug, string>;

  return {
    championshipHref,
    poolAHref,
    poolBHref,
    subLeaguePickerHrefs,
  };
}
