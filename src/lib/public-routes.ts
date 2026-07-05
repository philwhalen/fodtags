/** Deep-link slug constants (Spec 04 §4.5, Spec 05–08 feature specs). */

export const VALID_POOLS = ["pool-a", "pool-b"] as const;
export type PoolSlug = (typeof VALID_POOLS)[number];

export const VALID_SUB_LEAGUES = ["early", "mid", "late"] as const;
export type SubLeagueSlug = (typeof VALID_SUB_LEAGUES)[number];

export function isValidPool(pool: string): pool is PoolSlug {
  return (VALID_POOLS as readonly string[]).includes(pool);
}

export function isValidSubLeague(league: string): league is SubLeagueSlug {
  return (VALID_SUB_LEAGUES as readonly string[]).includes(league);
}

export function poolLabel(pool: PoolSlug): string {
  return pool === "pool-a" ? "Pool A" : "Pool B";
}

export function subLeagueLabel(league: SubLeagueSlug): string {
  switch (league) {
    case "early":
      return "Early";
    case "mid":
      return "Mid";
    case "late":
      return "Late";
  }
}

export interface PublicNavItem {
  label: string;
  href: string;
  /** Short hint for screen readers / mobile overflow menus. */
  description: string;
}

/** Top-level nav targets (Spec 11 §11.1). */
export function publicNavItems(seasonYear: number): PublicNavItem[] {
  const season = String(seasonYear);
  return [
    {
      label: "Leaderboards",
      href: `/${season}/championship/pool-a`,
      description: "Championship and sub-league standings",
    },
    {
      label: "Rounds & Ratings",
      href: `/${season}/rounds`,
      description: "League night rounds and ratings",
    },
    {
      label: "OLP",
      href: `/${season}/olp/mid`,
      description: "Overall League Performance pot",
    },
    {
      label: "Score Sheets",
      href: `/${season}/score-sheet/pool-a`,
      description: "Pool score sheets",
    },
    {
      label: "Financials",
      href: `/${season}/financials`,
      description: "Season financial summary",
    },
    {
      label: "Players",
      href: `/${season}/players/search`,
      description: "Search tag holders",
    },
  ];
}

/** All placeholder routes that must resolve (no 404) for nav smoke tests. */
export function placeholderRouteHrefs(seasonYear: number): string[] {
  const season = String(seasonYear);
  return [
    `/${season}/olp/early`,
    `/${season}/olp/mid`,
    `/${season}/olp/late`,
    `/${season}/score-sheet/pool-a`,
    `/${season}/score-sheet/pool-b`,
    `/${season}/financials`,
    `/${season}/players/search`,
  ];
}
