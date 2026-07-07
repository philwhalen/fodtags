import { roundToOneDecimal } from "./index";
import { poolLabel } from "./public-routes";
import type { PoolSlug, SubLeagueSlug } from "./public-routes";
import { subLeagueLabel, VALID_SUB_LEAGUES } from "./public-routes";
import type { Pool } from "./pool";
import type { EventType, SubLeagueType } from "./season-snapshot";
import type { OlpRow } from "./season-results";
import { filterHolderRounds, roundTrendSeries } from "./rounds-projection";
import type { RoundRow, RoundsFilter } from "./rounds-types";

/** One row on the `/players` roster index (Spec 08 §8.3). `tagNumber` is
 * null and `provisional` is true for an auto-added holder still awaiting
 * director confirmation (Spec 03 §3.5/§3.6) — the roster row renders a
 * "Pending confirmation" badge and "—" for the tag. */
export interface PlayersIndexRow {
  holderId: number;
  name: string;
  slug: string;
  tagNumber: number | null;
  pool: Pool;
  pdgaNumber: number | null;
  presentRating: number | null;
  championshipRank: number;
  championshipPoints: number;
  roundCount: number;
  provisional: boolean;
}

export interface PublicPlayersIndexPayload {
  holders: PlayersIndexRow[];
  updatedAt: string;
  stale: boolean;
  pendingReview: number;
}

export interface ProfileStandingSnapshot {
  rank: number;
  points: number;
  tieBrokenByTag: boolean;
  /** Sub-league views only — Podium folded in when true. */
  finalized?: boolean;
}

export interface ProfilePointsByType {
  leagueNight: number;
  podium: number;
  tournament: number;
  fodOpen: number;
  countedCount: number;
  droppedCount: number;
}

export interface ProfileOlpSubLeagueRow {
  subLeague: SubLeagueType;
  rank: number | null;
  score: number | null;
  ratingComponent: number | null;
  avgToPar: number | null;
  rounds: number;
  poolWins: number;
  payout: number | null;
  eligible: boolean;
  ineligibleReason: string | null;
  projected: boolean;
  tieBrokenByTag: boolean;
}

export interface ProfileMoneySkins {
  rank: number;
  totalPoints: number;
  eligible: boolean;
  qualified: boolean;
  projectedPayoutCents: number | null;
  purseCents: number;
  projected: boolean;
  ineligibilityReason: string | null;
}

/** One holder row in a published `skins/pool-*` view. */
export interface PublicSkinsRow {
  holderId: number;
  name: string;
  slug: string;
  tagNumber: number | null;
  rank: number;
  totalPoints: number;
  eligible: boolean;
  qualified: boolean;
  projectedPayoutCents: number | null;
}

export interface PublicSkinsPayload {
  pool: Pool;
  rows: PublicSkinsRow[];
  purseCents: number;
  projected: boolean;
  updatedAt: string;
  stale: boolean;
  pendingReview: number;
}

export interface ProfileMoneyOlp {
  subLeague: SubLeagueType;
  payout: number | null;
  projected: boolean;
}

/** Published payload for one `players/{slug}` view. `tagNumber` is null and
 * `provisional` is true for an auto-added holder awaiting director
 * confirmation (Spec 03 §3.5/§3.6). */
export interface PublicProfilePayload {
  holderId: number;
  name: string;
  slug: string;
  tagNumber: number | null;
  pool: Pool;
  pdgaNumber: number | null;
  pdgaMembership: boolean;
  presentRating: number | null;
  poolBAccrual: "active" | "inactive" | null;
  olpEligibleCurrent: boolean;
  olpIneligibleReasonCurrent: string | null;
  skinsQualified: boolean;
  skinsIneligibilityReason: string | null;
  championship: ProfileStandingSnapshot;
  subLeagueStandings: Record<SubLeagueType, ProfileStandingSnapshot>;
  points: ProfilePointsByType;
  rounds: RoundRow[];
  olpBySubLeague: Record<SubLeagueType, ProfileOlpSubLeagueRow | null>;
  moneySkins: ProfileMoneySkins;
  moneyOlp: ProfileMoneyOlp[];
  provisional: boolean;
  updatedAt: string;
  stale: boolean;
  pendingReview: number;
}

export interface ProfileLinks {
  championship: string;
  subLeague: string;
  scoreSheet: string;
  rounds: string;
  olp: string;
  financialsSkins: string;
  financialsOlp: string;
}

export interface ProfileRoundsSectionView {
  presentRating: number | null;
  trend: number[];
  recentRounds: RoundRow[];
  viewFullHref: string;
}

export interface ProfileOlpSectionView {
  active: ProfileOlpSubLeagueRow;
  summary: Array<{
    subLeague: SubLeagueType;
    label: string;
    rank: number | null;
    score: number | null;
    eligible: boolean;
    ineligibleReason: string | null;
    payout: number | null;
    projected: boolean;
  }>;
  viewFullHref: string;
}

export interface ProfileView {
  header: {
    name: string;
    tagNumber: number | null;
    pool: Pool;
    poolLabel: string;
    presentRating: number | null;
    pdgaNumber: number | null;
    pdgaProfileUrl: string | null;
    poolBAccrual: "active" | "inactive" | null;
    olpEligible: boolean;
    olpIneligibleReason: string | null;
    skinsQualified: boolean;
    skinsIneligibilityReason: string | null;
    /** True for an auto-added holder still awaiting director confirmation
     * (Spec 03 §3.5/§3.6) — the header renders a "Pending confirmation"
     * text badge among the eligibility flags (Spec 08 §8.1). */
    provisional: boolean;
  };
  championship: {
    overall: ProfileStandingSnapshot;
    currentSubLeague: ProfileStandingSnapshot;
    currentSubLeagueLabel: string;
    podiumNotFinalized: boolean;
    viewFullHref: string;
    viewFullSubLeagueHref: string;
  };
  points: ProfilePointsByType & { viewFullHref: string };
  rounds: ProfileRoundsSectionView;
  olp: ProfileOlpSectionView;
  money: {
    skins: ProfileMoneySkins;
    olp: ProfileMoneyOlp[];
    viewFullSkinsHref: string;
    viewFullOlpHref: string;
  };
  links: ProfileLinks;
}

function subLeagueSlugToType(slug: SubLeagueSlug): SubLeagueType {
  return slug.toUpperCase() as SubLeagueType;
}

export function poolBAccrualActive(
  pool: Pool,
  presentRating: number | null,
): "active" | "inactive" | null {
  if (pool !== "B") {
    return null;
  }
  if (presentRating === null) {
    return "active";
  }
  return presentRating >= 920 ? "inactive" : "active";
}

export function olpIneligibilityReason(row: Pick<OlpRow, "rounds" | "eligible">): string | null {
  if (row.eligible) {
    return null;
  }
  if (row.rounds < 4) {
    return `${row.rounds} round${row.rounds === 1 ? "" : "s"}`;
  }
  return "no PDGA membership";
}

/** Equal split of a purse among qualified holders (largest-remainder, cents). */
export function splitSkinsPayoutCents(
  purseCents: number,
  qualifiedCount: number,
  rankAmongQualified: number,
): number | null {
  if (qualifiedCount <= 0 || rankAmongQualified < 1 || rankAmongQualified > qualifiedCount) {
    return null;
  }
  const base = Math.floor(purseCents / qualifiedCount);
  const remainder = purseCents - base * qualifiedCount;
  let share = base;
  if (rankAmongQualified <= remainder) {
    share += 1;
  }
  return share;
}

export function buildProfileLinks(
  seasonYear: number,
  slug: string,
  pool: Pool,
  activeSubLeague: SubLeagueSlug,
): ProfileLinks {
  const season = String(seasonYear);
  const poolSlug: PoolSlug = pool === "A" ? "pool-a" : "pool-b";
  return {
    championship: `/${season}/championship/${poolSlug}`,
    subLeague: `/${season}/sub-league/${activeSubLeague}/${poolSlug}`,
    scoreSheet: `/${season}/score-sheet/${poolSlug}#${slug}`,
    rounds: `/${season}/players/${slug}/rounds?league=${activeSubLeague}`,
    olp: `/${season}/olp/${activeSubLeague}`,
    financialsSkins: `/${season}/financials#pots-skins`,
    financialsOlp: `/${season}/financials#pots-olp`,
  };
}

function recentRounds(rounds: RoundRow[], limit: number): RoundRow[] {
  return [...rounds]
    .sort((a, b) => {
      const byDate = b.date.localeCompare(a.date);
      if (byDate !== 0) {
        return byDate;
      }
      return (b.roundOrdinal ?? 0) - (a.roundOrdinal ?? 0);
    })
    .slice(0, limit);
}

export function projectProfile(
  payload: PublicProfilePayload,
  seasonYear: number,
  activeSubLeague: SubLeagueSlug,
): ProfileView {
  const activeType = subLeagueSlugToType(activeSubLeague);
  const links = buildProfileLinks(seasonYear, payload.slug, payload.pool, activeSubLeague);
  const currentStanding = payload.subLeagueStandings[activeType];
  let activeOlp = payload.olpBySubLeague[activeType];

  const roundsFilter: RoundsFilter = {
    league: activeSubLeague,
    types: ["ln"],
  };
  const scopedRounds = filterHolderRounds(payload.rounds, roundsFilter);
  const trend = roundTrendSeries(scopedRounds);

  const olpSummary = (["EARLY", "MID", "LATE"] as SubLeagueType[]).map((type) => {
    const row = payload.olpBySubLeague[type];
    const slug = type.toLowerCase() as SubLeagueSlug;
    return {
      subLeague: type,
      label: subLeagueLabel(slug),
      rank: row?.eligible ? row.rank : null,
      score: row ? roundToOneDecimal(row.score ?? 0) : null,
      eligible: row?.eligible ?? false,
      ineligibleReason: row?.ineligibleReason ?? null,
      payout: row?.payout ?? null,
      projected: row?.projected ?? true,
    };
  });

  if (!activeOlp) {
    activeOlp = {
      subLeague: activeType,
      rank: null,
      score: null,
      ratingComponent: null,
      avgToPar: null,
      rounds: 0,
      poolWins: 0,
      payout: null,
      eligible: false,
      ineligibleReason: "0 rounds",
      projected: true,
      tieBrokenByTag: false,
    };
  }

  return {
    header: {
      name: payload.name,
      tagNumber: payload.tagNumber,
      pool: payload.pool,
      poolLabel: poolLabel(payload.pool === "A" ? "pool-a" : "pool-b"),
      presentRating: payload.presentRating,
      pdgaNumber: payload.pdgaNumber,
      pdgaProfileUrl:
        payload.pdgaNumber !== null
          ? `https://www.pdga.com/player/${payload.pdgaNumber}`
          : null,
      poolBAccrual: payload.poolBAccrual,
      olpEligible: payload.olpEligibleCurrent,
      olpIneligibleReason: payload.olpIneligibleReasonCurrent,
      skinsQualified: payload.skinsQualified,
      skinsIneligibilityReason: payload.skinsIneligibilityReason,
      provisional: payload.provisional,
    },
    championship: {
      overall: payload.championship,
      currentSubLeague: currentStanding,
      currentSubLeagueLabel: subLeagueLabel(activeSubLeague),
      podiumNotFinalized: currentStanding.finalized === false,
      viewFullHref: links.championship,
      viewFullSubLeagueHref: links.subLeague,
    },
    points: {
      ...payload.points,
      viewFullHref: links.scoreSheet,
    },
    rounds: {
      presentRating: payload.presentRating,
      trend,
      recentRounds: recentRounds(scopedRounds, 5),
      viewFullHref: links.rounds,
    },
    olp: {
      active: {
        ...activeOlp,
        score: activeOlp.score === null ? null : roundToOneDecimal(activeOlp.score),
        ratingComponent:
          activeOlp.ratingComponent === null
            ? null
            : roundToOneDecimal(activeOlp.ratingComponent),
        avgToPar:
          activeOlp.avgToPar === null ? null : roundToOneDecimal(activeOlp.avgToPar),
      },
      summary: olpSummary,
      viewFullHref: links.olp,
    },
    money: {
      skins: payload.moneySkins,
      olp: payload.moneyOlp,
      viewFullSkinsHref: links.financialsSkins,
      viewFullOlpHref: links.financialsOlp,
    },
    links,
  };
}

/** Count league-night rounds across all sub-leagues (default roster scope). */
export function countLeagueNightRounds(rounds: RoundRow[]): number {
  return rounds.filter((round) => round.type === "LeagueNight").length;
}

/** Build per-type subtotals from a score-sheet entry shape. */
export function profilePointsFromByType(
  byType: Record<EventType | "Podium", number>,
  countedCount: number,
  droppedCount: number,
): ProfilePointsByType {
  return {
    leagueNight: byType.LeagueNight,
    podium: byType.Podium,
    tournament: byType.Tournament,
    fodOpen: byType.FODOpen,
    countedCount,
    droppedCount,
  };
}

export { VALID_SUB_LEAGUES };
