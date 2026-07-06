// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import {
  countLeagueNightRounds,
  olpIneligibilityReason,
  poolBAccrualActive,
  profilePointsFromByType,
  splitSkinsPayoutCents,
  type PlayersIndexRow,
  type ProfileOlpSubLeagueRow,
  type ProfileStandingSnapshot,
  type PublicPlayersIndexPayload,
  type PublicProfilePayload,
  type PublicRoundsPayload,
  type SeasonResults,
  type SeasonSnapshot,
  type SubLeagueType,
} from "@/lib";
import type { tagHolders } from "@server/db/schema";

import type { ViewRow } from "./build";

const SUB_LEAGUE_TYPES: SubLeagueType[] = ["EARLY", "MID", "LATE"];

type HolderRow = typeof tagHolders.$inferSelect;

function standingSnapshot(
  results: SeasonResults,
  pool: HolderRow["pool"],
  holderId: number,
  kind: "championship" | SubLeagueType,
): ProfileStandingSnapshot {
  const rows =
    kind === "championship"
      ? results.championship[pool]
      : results.subLeagues[kind][pool];
  const row = rows.find((entry) => entry.holderId === holderId);
  if (!row) {
    return { rank: 0, points: 0, tieBrokenByTag: false };
  }
  return {
    rank: row.rank,
    points: row.totalPoints,
    tieBrokenByTag: row.tieBrokenByTag,
    ...(kind !== "championship"
      ? { finalized: results.podium[kind].complete }
      : {}),
  };
}

function olpRowForHolder(
  results: SeasonResults,
  type: SubLeagueType,
  holderId: number,
): ProfileOlpSubLeagueRow | null {
  const row = results.olp[type].find((entry) => entry.holderId === holderId);
  if (!row) {
    return null;
  }
  return {
    subLeague: type,
    rank: row.eligible ? row.rank : null,
    score: row.score,
    ratingComponent: row.ratingComponent,
    avgToPar: row.avgToPar,
    rounds: row.rounds,
    poolWins: row.poolWins,
    payout: row.payout,
    eligible: row.eligible,
    ineligibleReason: olpIneligibilityReason(row),
    projected: row.projected,
    tieBrokenByTag: row.tieBrokenByTag,
  };
}

function compareIndexRows(a: PlayersIndexRow, b: PlayersIndexRow): number {
  const aRating = a.presentRating;
  const bRating = b.presentRating;
  if (aRating === null && bRating === null) {
    return a.tagNumber - b.tagNumber;
  }
  if (aRating === null) {
    return 1;
  }
  if (bRating === null) {
    return -1;
  }
  if (bRating !== aRating) {
    return bRating - aRating;
  }
  return a.tagNumber - b.tagNumber;
}

export function buildPlayersViews(
  seasonYear: number,
  results: SeasonResults,
  snapshot: SeasonSnapshot,
  holders: HolderRow[],
  roundsPayload: PublicRoundsPayload,
  slugById: Map<number, string>,
  updatedAt: string,
  stale: boolean,
  pendingReview: number,
): ViewRow[] {
  const roundsByHolderId = new Map(
    roundsPayload.holders.map((entry) => [entry.holderId, entry]),
  );

  const indexRows: PlayersIndexRow[] = holders.map((holder) => {
    const roundsEntry = roundsByHolderId.get(holder.id);
    const championship = standingSnapshot(results, holder.pool, holder.id, "championship");
    return {
      holderId: holder.id,
      name: holder.name,
      slug: slugById.get(holder.id) ?? String(holder.id),
      tagNumber: holder.tagNumber,
      pool: holder.pool,
      pdgaNumber: holder.pdgaNumber,
      presentRating: roundsEntry?.presentRating ?? null,
      championshipRank: championship.rank,
      championshipPoints: championship.points,
      roundCount: countLeagueNightRounds(roundsEntry?.rounds ?? []),
    };
  });
  indexRows.sort(compareIndexRows);

  const views: ViewRow[] = [
    {
      seasonYear,
      viewKey: "players",
      payload: {
        holders: indexRows,
        updatedAt,
        stale,
        pendingReview,
      } satisfies PublicPlayersIndexPayload,
    },
  ];

  for (const holder of holders) {
    const slug = slugById.get(holder.id) ?? String(holder.id);
    const roundsEntry = roundsByHolderId.get(holder.id);
    const presentRating = roundsEntry?.presentRating ?? null;
    const scoreSheet = results.scoreSheet[holder.id];
    const skinsRow = results.skins[holder.pool].find((row) => row.holderId === holder.id);
    const qualifiedRows = results.skins[holder.pool].filter((row) => row.qualified);
    const rankAmongQualified = skinsRow?.qualified
      ? qualifiedRows.findIndex((row) => row.holderId === holder.id) + 1
      : null;
    const purseCents = results.financials.funds.skins[holder.pool];
    const currentSubLeague =
      snapshot.subLeagues.find((sl) => !sl.complete)?.type ?? "EARLY";
    const currentOlp = results.olp[currentSubLeague].find(
      (row) => row.holderId === holder.id,
    );

    const payload: PublicProfilePayload = {
      holderId: holder.id,
      name: holder.name,
      slug,
      tagNumber: holder.tagNumber,
      pool: holder.pool,
      pdgaNumber: holder.pdgaNumber,
      pdgaMembership: holder.pdgaMembership,
      presentRating,
      poolBAccrual: poolBAccrualActive(holder.pool, presentRating),
      olpEligibleCurrent: currentOlp?.eligible ?? false,
      olpIneligibleReasonCurrent: currentOlp
        ? olpIneligibilityReason(currentOlp)
        : null,
      skinsQualified: skinsRow?.qualified ?? false,
      skinsIneligibilityReason:
        skinsRow && !skinsRow.eligible && holder.pool === "B"
          ? "rating >920"
          : null,
      championship: standingSnapshot(results, holder.pool, holder.id, "championship"),
      subLeagueStandings: {
        EARLY: standingSnapshot(results, holder.pool, holder.id, "EARLY"),
        MID: standingSnapshot(results, holder.pool, holder.id, "MID"),
        LATE: standingSnapshot(results, holder.pool, holder.id, "LATE"),
      },
      points: scoreSheet
        ? profilePointsFromByType(
            scoreSheet.byType,
            scoreSheet.countedLineItems.length,
            scoreSheet.droppedLineItems.length,
          )
        : profilePointsFromByType(
            { LeagueNight: 0, Tournament: 0, FODOpen: 0, Podium: 0 },
            0,
            0,
          ),
      rounds: roundsEntry?.rounds ?? [],
      olpBySubLeague: {
        EARLY: olpRowForHolder(results, "EARLY", holder.id),
        MID: olpRowForHolder(results, "MID", holder.id),
        LATE: olpRowForHolder(results, "LATE", holder.id),
      },
      moneySkins: {
        rank: skinsRow?.rank ?? 0,
        totalPoints: skinsRow?.totalPoints ?? 0,
        eligible: skinsRow?.eligible ?? false,
        qualified: skinsRow?.qualified ?? false,
        projectedPayoutCents:
          rankAmongQualified !== null
            ? splitSkinsPayoutCents(
                purseCents,
                qualifiedRows.length,
                rankAmongQualified,
              )
            : null,
        purseCents,
        projected: !results.financials.skinsPaidOut[holder.pool],
        ineligibilityReason:
          skinsRow && !skinsRow.eligible && holder.pool === "B"
            ? "rating >920"
            : null,
      },
      moneyOlp: SUB_LEAGUE_TYPES.map((type) => {
        const row = results.olp[type].find((entry) => entry.holderId === holder.id);
        return {
          subLeague: type,
          payout: row?.payout ?? null,
          projected: !results.podium[type].complete,
        };
      }),
      updatedAt,
      stale,
      pendingReview,
    };

    views.push({
      seasonYear,
      viewKey: `players/${slug}`,
      payload,
    });
  }

  return views;
}
