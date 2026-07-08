// PURE MODULE — see src/server/engine/index.ts for the purity contract.
// No DB, no clock, no fetch, no Next.js, no `server-only`.
//
// Implements `computeSeason`, the season-wide scoring engine (Spec 02):
// pools/eligibility as-of-date, per-pool ranking, Table 2.1 points, the
// computed League Podium, top-N caps, tie-breaks, cancellations,
// pool-switch forfeiture, OLP score/eligibility/payout, and skins
// qualification (Spec 02 §2.8/§2.9 — sub-plan 03).
import type {
  EventType,
  OlpRow,
  Pool,
  PodiumStanding,
  PoolSkins,
  PoolStandings,
  ScoreSheetEntry,
  ScoreSheetLineItem,
  SeasonResults,
  SeasonSnapshot,
  SeasonSnapshotHolder,
  SeasonSnapshotPoolSwitch,
  SeasonSnapshotRating,
  SeasonStandingRow,
  SkinsRow,
  SubLeagueType,
} from "@/lib";
import { tagSortKey } from "@/lib";

import { entriesToOlpPot, largestRemainderPayout, olpScore } from "./olp";
import { computeFinancials } from "./financial";
import { computeTagTimeline } from "./tags";

const SUB_LEAGUE_TYPES: SubLeagueType[] = ["EARLY", "MID", "LATE"];
const POOLS: Pool[] = ["A", "B"];

/** Table 2.1 (Spec 02 §2.4) — index 0 = 1st place; missing/beyond-table
 * places pay 0. */
const LEAGUE_NIGHT_POINTS = [100, 60, 35, 20, 10];
const PODIUM_POINTS = [150, 100, 50];
const TOURNAMENT_POINTS = [150, 100, 70, 50, 35, 25, 20, 15, 10, 5];
const FOD_OPEN_POINTS = [250, 180, 150, 120, 100, 80, 65, 50, 40, 30, 25, 20, 15, 10, 5];

function pointsForRank(table: number[], rank: number): number {
  return table[rank - 1] ?? 0;
}

/**
 * Normalizes any ISO date or date-time string to its `YYYY-MM-DD`
 * calendar portion so comparisons between a full-precision timestamp
 * (e.g. a tag's `entryDate`, which may be stored as a UTC ISO date-time)
 * and a bare calendar-date field (event/effective dates) are apples-to-
 * apples. Without this, a tag bought "on" a League Night's date could
 * lexicographically sort as *after* that night (its time suffix makes the
 * string longer/"greater"), wrongly forfeiting an on-date finish (Spec 02
 * §2.3: "a finish on the purchase date counts").
 */
function datePart(iso: string): string {
  return iso.slice(0, 10);
}

function isSubLeagueType(x: string): x is SubLeagueType {
  return x === "EARLY" || x === "MID" || x === "LATE";
}

/** Holder's pool in effect on `date` — base pool plus any switch whose
 * `effectiveDate` is on or before `date` (Spec 02 §2.2). */
function poolAsOf(
  holder: SeasonSnapshotHolder,
  switches: SeasonSnapshotPoolSwitch[],
  date: string,
): Pool {
  const asOf = datePart(date);
  let pool = holder.basePool;
  const applicable = switches
    .filter((s) => s.holderId === holder.id && datePart(s.effectiveDate) <= asOf)
    .sort((a, b) => datePart(a.effectiveDate).localeCompare(datePart(b.effectiveDate)));
  for (const s of applicable) pool = s.toPool;
  return pool;
}

/** Holder's official PDGA rating in effect on `date` (Spec 02 §2.2) —
 * latest `official` row with `effectiveDate <= date`, falling back to
 * `ratingAtEntry` if no history row qualifies. */
function ratingAsOf(
  holder: SeasonSnapshotHolder,
  ratings: SeasonSnapshotRating[],
  date: string,
): number | undefined {
  const asOf = datePart(date);
  const official = ratings
    .filter((r) => r.holderId === holder.id && r.official && datePart(r.effectiveDate) <= asOf)
    .sort((a, b) => datePart(b.effectiveDate).localeCompare(datePart(a.effectiveDate)));
  const latest = official[0];
  if (latest) return latest.rating;
  return holder.ratingAtEntry ?? undefined;
}

/** The most recent date appearing anywhere in the snapshot — the "final"
 * as-of point for Championship pool bucketing when a sub-league has no
 * explicit `endDate`. Defaults far in the future when the snapshot has no
 * dated events yet, so any registered pool switch is already in effect
 * (pre-season empty state). */
function resolveSeasonEndDate(snapshot: SeasonSnapshot): string {
  let max: string | undefined;
  for (const e of snapshot.events) {
    if (max === undefined || e.eventDate > max) max = e.eventDate;
  }
  for (const sl of snapshot.subLeagues) {
    if (sl.endDate && (max === undefined || sl.endDate > max)) max = sl.endDate;
  }
  return max ?? "9999-12-31";
}

interface RankedByScore {
  holderId: number;
  rank: number;
  tieBrokenByTag: boolean;
}

/** Ranks entries best-first by `rawScoreToPar` (lower is better), tie-
 * broken by ascending tag number, itself broken by holder ID for two
 * tagless (provisional) holders (Spec 02 §2.6). Always yields a strict
 * order — ties never share a rank, and every tied entry is flagged. */
function rankByScore(
  entries: { holderId: number; tagNumber: number | null; rawScoreToPar: number }[],
): RankedByScore[] {
  const sorted = entries
    .slice()
    .sort(
      (a, b) =>
        a.rawScoreToPar - b.rawScoreToPar ||
        tagSortKey(a.tagNumber) - tagSortKey(b.tagNumber) ||
        a.holderId - b.holderId,
    );
  return sorted.map((e, index) => ({
    holderId: e.holderId,
    rank: index + 1,
    tieBrokenByTag: sorted.some(
      (o) => o.holderId !== e.holderId && o.rawScoreToPar === e.rawScoreToPar,
    ),
  }));
}

/** Ranks entries best-first by descending points, tie-broken by ascending
 * tag number, itself broken by holder ID for two tagless (provisional)
 * holders (Spec 02 §2.6) — used for the Championship, sub-league, and
 * Podium standings. */
function rankByPoints(
  entries: { holderId: number; tagNumber: number | null; pool: Pool; totalPoints: number }[],
): SeasonStandingRow[] {
  const sorted = entries
    .slice()
    .sort(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        tagSortKey(a.tagNumber) - tagSortKey(b.tagNumber) ||
        a.holderId - b.holderId,
    );
  return sorted.map((e, index) => ({
    rank: index + 1,
    holderId: e.holderId,
    tagNumber: e.tagNumber,
    pool: e.pool,
    totalPoints: e.totalPoints,
    tieBrokenByTag: sorted.some(
      (o) => o.holderId !== e.holderId && o.totalPoints === e.totalPoints,
    ),
  }));
}

/** A scored appearance before top-N cap / forfeiture bookkeeping is
 * applied — the engine's working unit, one per (holder, LeagueNight |
 * Tournament | FODOpen event). Computed-Podium items skip this shape
 * entirely (built directly as `ScoreSheetLineItem`s — see Stage C). */
interface RawLineItem {
  eventId: number;
  type: EventType;
  subLeague?: SubLeagueType;
  eventDate: string;
  pool: Pool;
  rank: number;
  points: number;
  tieBrokenByTag: boolean;
  forfeited: boolean;
}

function toLineItem(item: RawLineItem, droppedReason?: "cap" | "forfeited"): ScoreSheetLineItem {
  return {
    eventId: item.eventId,
    type: item.type,
    subLeague: item.subLeague,
    eventDate: item.eventDate,
    pool: item.pool,
    rank: item.rank,
    points: item.points,
    tieBrokenByTag: item.tieBrokenByTag,
    ...(droppedReason ? { droppedReason } : {}),
  };
}

/** Splits `items` (already forfeiture-filtered — forfeited items never
 * reach here) into the best `cap` by points (counted) and the remainder
 * (dropped, "cap") — Spec 02 §2.5. Ties at the cap boundary are broken by
 * earliest event date; since tied points contribute identically to the
 * total, this only affects which specific item is *labeled* counted. */
function applyCap(
  items: RawLineItem[],
  cap: number,
): { counted: RawLineItem[]; dropped: RawLineItem[] } {
  if (items.length <= cap) return { counted: items, dropped: [] };
  const sorted = items
    .slice()
    .sort((a, b) => b.points - a.points || a.eventDate.localeCompare(b.eventDate));
  return { counted: sorted.slice(0, cap), dropped: sorted.slice(cap) };
}

function emptyPoolStandings(): PoolStandings {
  return { A: [], B: [] };
}

function emptyPodiumStanding(): PodiumStanding {
  return { complete: false, A: [], B: [] };
}

/**
 * Computes Championship totals, per-pool standings, the score sheet, and
 * the computed League Podium from a plain `SeasonSnapshot` (Spec 02). A
 * pure function: the same input always yields the same output, no I/O.
 *
 * Also computes OLP score/eligibility/payout and skins qualification
 * (§2.8/§2.9, Stages F/G below).
 */
export function computeSeason(snapshot: SeasonSnapshot): SeasonResults {
  const holderById = new Map(snapshot.holders.map((h) => [h.id, h]));
  const seasonEndDate = resolveSeasonEndDate(snapshot);

  // Tag reassignment timeline (Spec 02 §2.10) — must run before any
  // ranking below, since a League Night's finish tie-break needs THAT
  // night's tag-in and every other tie-break (Podium/Overall/Tournament/
  // OLP, Spec 02 §2.6) needs the tag as-of a given date.
  const { assignments: tagAssignments, tagAsOf, currentTagByHolder, tagInForNight } =
    computeTagTimeline({
      holders: snapshot.holders,
      events: snapshot.events,
      tagOverrides: snapshot.tagOverrides,
    });

  // Per-holder forfeiture cutoff: the latest pool-switch effective date,
  // if any — all points earned strictly before it are forfeited (Spec 02
  // §2.2). With multiple switches only the most recent cutoff matters,
  // since a later switch forfeits everything before it, superseding any
  // earlier switch's cutoff.
  const forfeitCutoffByHolder = new Map<number, string>();
  for (const s of snapshot.poolSwitches) {
    const d = datePart(s.effectiveDate);
    const existing = forfeitCutoffByHolder.get(s.holderId);
    if (existing === undefined || d > existing) forfeitCutoffByHolder.set(s.holderId, d);
  }

  // Stage A — build raw line items per holder from every non-canceled
  // event (Spec 02 §2.7: a canceled event is skipped entirely, i.e. zero
  // points everywhere).
  const rawItemsByHolder = new Map<number, RawLineItem[]>();
  const pushItem = (holderId: number, item: RawLineItem) => {
    const list = rawItemsByHolder.get(holderId) ?? [];
    list.push(item);
    rawItemsByHolder.set(holderId, list);
  };

  // OLP round data (Spec 02 §2.8), accumulated alongside the same
  // canceled/tag-present/post-entry-date/pool-as-of filtering Stage A
  // already applies for Championship points — OLP round counts, averages,
  // and pool-win counts must agree with what actually appeared on the
  // field, independent of pool-switch forfeiture (which only zeroes
  // *Championship points*, not attendance or finish position) and
  // independent of the Pool-B >=920 points gate (a player can still win
  // their pool outright, and be counted for OLP purposes, even in an
  // instance where their own points were gated to zero). Keyed by
  // `${holderId}:${subLeague}`.
  const olpAccumByHolder = new Map<string, { scores: number[]; wins: number }>();
  const olpKey = (holderId: number, subLeague: SubLeagueType) => `${holderId}:${subLeague}`;

  for (const event of snapshot.events) {
    if (event.canceled) continue;

    const subLeague = isSubLeagueType(event.sourceType) ? event.sourceType : undefined;
    const table =
      event.type === "LeagueNight"
        ? LEAGUE_NIGHT_POINTS
        : event.type === "Tournament"
          ? TOURNAMENT_POINTS
          : FOD_OPEN_POINTS;

    const eligibleByPool: Record<
      Pool,
      { holderId: number; tagNumber: number | null; rawScoreToPar: number }[]
    > = { A: [], B: [] };

    for (const result of event.results) {
      if (result.holderId == null || !result.tagPresent) continue;
      const holder = holderById.get(result.holderId);
      if (!holder) continue;
      // Entry timing (Spec 02 §2.3): no finish before the tag's purchase
      // date; on-date finishes count.
      if (datePart(event.eventDate) < datePart(holder.entryDate)) continue;
      const pool = poolAsOf(holder, snapshot.poolSwitches, event.eventDate);
      // League Night ranking is tie-broken by the tag held going INTO that
      // night (Spec 02 §2.6); Tournament/FODOpen results use the tag as of
      // the event date instead, since those events don't participate in
      // the nightly reassignment.
      const tagNumber =
        event.type === "LeagueNight"
          ? tagInForNight(holder.id, event.id)
          : tagAsOf(holder.id, event.eventDate);
      eligibleByPool[pool].push({
        holderId: holder.id,
        tagNumber,
        rawScoreToPar: result.rawScoreToPar,
      });
    }

    for (const pool of POOLS) {
      const ranked = rankByScore(eligibleByPool[pool]);
      const rawScoreByHolder = new Map(
        eligibleByPool[pool].map((e) => [e.holderId, e.rawScoreToPar]),
      );
      for (const row of ranked) {
        const holder = holderById.get(row.holderId);
        if (!holder) continue;
        let points = pointsForRank(table, row.rank);
        // Pool B accrual gate (Spec 02 §2.2): once rated >=920, a Pool B
        // holder stops earning Pool B points. They remain ranked/present
        // in the field (so they don't distort others' finish positions);
        // only their own points for this instance are zeroed.
        if (pool === "B") {
          const rating = ratingAsOf(holder, snapshot.ratings, event.eventDate);
          if (rating !== undefined && rating >= 920) points = 0;
        }
        const cutoff = forfeitCutoffByHolder.get(row.holderId);
        const forfeited = cutoff !== undefined && datePart(event.eventDate) < cutoff;
        pushItem(row.holderId, {
          eventId: event.id,
          type: event.type,
          subLeague,
          eventDate: event.eventDate,
          pool,
          rank: row.rank,
          points,
          tieBrokenByTag: row.tieBrokenByTag,
          forfeited,
        });

        if (subLeague && event.type === "LeagueNight") {
          const key = olpKey(row.holderId, subLeague);
          const acc = olpAccumByHolder.get(key) ?? { scores: [], wins: 0 };
          acc.scores.push(rawScoreByHolder.get(row.holderId) ?? 0);
          if (row.rank === 1) acc.wins += 1;
          olpAccumByHolder.set(key, acc);
        }
      }
    }
  }

  // Stage B — per-holder score sheet: split out forfeited items, then
  // apply the season-wide top-N cap per event-type category (Spec 02
  // §2.5). Podium items are folded in afterward (Stage C/D), uncapped.
  const tournamentCap = snapshot.tournamentSourceCount <= 3 ? 2 : 3;
  const scoreSheet: Record<number, ScoreSheetEntry> = {};

  for (const holder of snapshot.holders) {
    const raw = rawItemsByHolder.get(holder.id) ?? [];
    const forfeited = raw.filter((i) => i.forfeited);
    const live = raw.filter((i) => !i.forfeited);

    const leagueNights = live.filter((i) => i.type === "LeagueNight");
    const tournaments = live.filter((i) => i.type === "Tournament");
    const fodOpens = live.filter((i) => i.type === "FODOpen");

    const lnCapped = applyCap(leagueNights, 15);
    const tCapped = applyCap(tournaments, tournamentCap);
    const fCapped = applyCap(fodOpens, 1);

    const counted = [...lnCapped.counted, ...tCapped.counted, ...fCapped.counted];
    const droppedByCap = [...lnCapped.dropped, ...tCapped.dropped, ...fCapped.dropped];

    scoreSheet[holder.id] = {
      byType: { LeagueNight: 0, Tournament: 0, FODOpen: 0, Podium: 0 },
      countedLineItems: counted.map((i) => toLineItem(i)),
      droppedLineItems: [
        ...droppedByCap.map((i) => toLineItem(i, "cap")),
        ...forfeited.map((i) => toLineItem(i, "forfeited")),
      ],
      total: 0, // filled in below (Stage D), after Podium items are folded in
    };
  }

  // Stage C — computed League Podium (Spec 02 §2.4.1): per sub-league,
  // rank each pool by ALL of that sub-league's (non-forfeited) League-
  // Night points — uncapped, independent of the Championship's best-15
  // cap — and award top-3 podium points. Also the basis for that sub-
  // league's own standing (§4.3): LN sum, with the Podium bonus folded in
  // once the sub-league is marked complete.
  const podium: Record<SubLeagueType, PodiumStanding> = {
    EARLY: emptyPodiumStanding(),
    MID: emptyPodiumStanding(),
    LATE: emptyPodiumStanding(),
  };
  const subLeagues: Record<SubLeagueType, PoolStandings> = {
    EARLY: emptyPoolStandings(),
    MID: emptyPoolStandings(),
    LATE: emptyPoolStandings(),
  };
  const podiumLineItemsByHolder = new Map<number, ScoreSheetLineItem[]>();

  for (const type of SUB_LEAGUE_TYPES) {
    const subLeague = snapshot.subLeagues.find((s) => s.type === type);
    if (!subLeague) continue;
    const asOf = subLeague.endDate ?? seasonEndDate;

    const participants: {
      holderId: number;
      tagNumber: number | null;
      pool: Pool;
      totalPoints: number;
    }[] = [];
    for (const holder of snapshot.holders) {
      const items = (rawItemsByHolder.get(holder.id) ?? []).filter(
        (i) => !i.forfeited && i.subLeague === type && i.type === "LeagueNight",
      );
      if (items.length === 0) continue;
      const totalPoints = items.reduce((acc, i) => acc + i.points, 0);
      const pool = poolAsOf(holder, snapshot.poolSwitches, asOf);
      const tagNumber = tagAsOf(holder.id, asOf);
      participants.push({ holderId: holder.id, tagNumber, pool, totalPoints });
    }

    const podiumStanding: PodiumStanding = { complete: subLeague.complete, A: [], B: [] };
    const subLeagueStanding: PoolStandings = { A: [], B: [] };

    for (const pool of POOLS) {
      const poolParticipants = participants.filter((p) => p.pool === pool);
      const rankedByLnSum = rankByPoints(poolParticipants);
      const top3 = rankedByLnSum.slice(0, 3);
      const bonusByHolder = new Map(
        top3.map((row) => [row.holderId, pointsForRank(PODIUM_POINTS, row.rank)]),
      );

      podiumStanding[pool] = top3.map((row) => ({
        ...row,
        totalPoints: pointsForRank(PODIUM_POINTS, row.rank),
      }));

      const withBonus = poolParticipants.map((p) => ({
        ...p,
        totalPoints: p.totalPoints + (subLeague.complete ? (bonusByHolder.get(p.holderId) ?? 0) : 0),
      }));
      subLeagueStanding[pool] = rankByPoints(withBonus);

      if (subLeague.complete) {
        for (const row of top3) {
          const item: ScoreSheetLineItem = {
            eventId: -1,
            type: "Podium",
            subLeague: type,
            eventDate: asOf,
            pool,
            rank: row.rank,
            points: pointsForRank(PODIUM_POINTS, row.rank),
            tieBrokenByTag: row.tieBrokenByTag,
          };
          const list = podiumLineItemsByHolder.get(row.holderId) ?? [];
          list.push(item);
          podiumLineItemsByHolder.set(row.holderId, list);
        }
      }
    }

    podium[type] = podiumStanding;
    subLeagues[type] = subLeagueStanding;
  }

  // Stage D — fold counted Podium items into each holder's score sheet,
  // then compute the per-type breakdown and Championship-contributing
  // total (Spec 02 §2.5: Championship total = sum of counted items).
  for (const holder of snapshot.holders) {
    const entry = scoreSheet[holder.id];
    if (!entry) continue;
    const podiumItems = podiumLineItemsByHolder.get(holder.id) ?? [];
    entry.countedLineItems = [...entry.countedLineItems, ...podiumItems];
    for (const li of entry.countedLineItems) {
      entry.byType[li.type] += li.points;
    }
    entry.total = entry.countedLineItems.reduce((acc, li) => acc + li.points, 0);
  }

  // Stage E — Championship standings: each holder's *current* pool (as of
  // the latest date in the snapshot), ranked by their score-sheet total.
  const championship: PoolStandings = emptyPoolStandings();
  for (const pool of POOLS) {
    const entries = snapshot.holders
      .filter((h) => poolAsOf(h, snapshot.poolSwitches, seasonEndDate) === pool)
      .map((h) => ({
        holderId: h.id,
        tagNumber: currentTagByHolder.get(h.id) ?? null,
        pool,
        totalPoints: scoreSheet[h.id]?.total ?? 0,
      }));
    championship[pool] = rankByPoints(entries);
  }

  // Stage F — OLP (Spec 02 §2.8): per sub-league, score every holder who
  // played at least one league round there, rank across BOTH pools
  // together, gate eligibility at >=4 rounds + PDGA membership, and split
  // the sub-league's $1-per-entry pot 50/30/20 by largest remainder among
  // the top-3 ELIGIBLE holders (ineligible holders are skipped over, not
  // counted against the top 3, though they still occupy their true rank
  // for display — Spec 06 §6.2).
  const olpPot: Record<SubLeagueType, number> = { EARLY: 0, MID: 0, LATE: 0 };
  const olp: Record<SubLeagueType, OlpRow[]> = { EARLY: [], MID: [], LATE: [] };

  for (const type of SUB_LEAGUE_TYPES) {
    const paidEntries = snapshot.entryCounts
      .filter((e) => e.subLeagueType === type)
      .reduce((acc, e) => acc + e.paidEntries, 0);
    olpPot[type] = entriesToOlpPot(paidEntries);

    const subLeague = snapshot.subLeagues.find((s) => s.type === type);
    if (!subLeague) continue;
    const asOf = subLeague.endDate ?? seasonEndDate;
    const projected = !subLeague.complete;

    interface OlpCandidate {
      holderId: number;
      tagNumber: number | null;
      score: number;
      ratingComponent: number;
      avgToPar: number;
      rounds: number;
      poolWins: number;
      eligible: boolean;
    }

    const candidates: OlpCandidate[] = [];
    for (const holder of snapshot.holders) {
      const acc = olpAccumByHolder.get(olpKey(holder.id, type));
      if (!acc || acc.scores.length === 0) continue;
      const rounds = acc.scores.length;
      const avgToPar = acc.scores.reduce((a, b) => a + b, 0) / rounds;
      // No official rating on record at all (never happens once a holder
      // has entered results in practice, but guarded defensively): treat
      // the rating component as 0 rather than fail — documented engine
      // simplification, flagged for follow-up once real data exists.
      const rating = ratingAsOf(holder, snapshot.ratings, asOf) ?? 0;
      const ratingComponent = 0.1 * rating;
      const score = olpScore({
        ratingOnLastDay: rating,
        avgScoreToPar: avgToPar,
        roundsPlayed: rounds,
        leagueNightPoolWins: acc.wins,
      });
      candidates.push({
        holderId: holder.id,
        tagNumber: tagAsOf(holder.id, asOf),
        score,
        ratingComponent,
        avgToPar,
        rounds,
        poolWins: acc.wins,
        eligible: rounds >= 4 && holder.pdgaMembership,
      });
    }

    const sorted = candidates
      .slice()
      .sort(
        (a, b) =>
          a.score - b.score ||
          tagSortKey(a.tagNumber) - tagSortKey(b.tagNumber) ||
          a.holderId - b.holderId,
      );

    const payouts = largestRemainderPayout(olpPot[type]);
    const payoutByHolder = new Map<number, number>();
    sorted
      .filter((c) => c.eligible)
      .slice(0, 3)
      .forEach((c, index) => payoutByHolder.set(c.holderId, payouts[index] ?? 0));

    olp[type] = sorted.map((c, index) => ({
      rank: index + 1,
      holderId: c.holderId,
      tagNumber: c.tagNumber,
      score: c.score,
      ratingComponent: c.ratingComponent,
      avgToPar: c.avgToPar,
      rounds: c.rounds,
      poolWins: c.poolWins,
      eligible: c.eligible,
      payout: payoutByHolder.get(c.holderId) ?? null,
      projected,
      tieBrokenByTag: sorted.some((o) => o.holderId !== c.holderId && o.score === c.score),
    }));
  }

  // Stage G — skins qualification (Spec 02 §2.9): the pool's own
  // Championship standing IS the qualification order (top-4 point
  // earners), so re-use it directly; Pool B additionally requires a
  // season-end rating <=920 — ineligible rows are skipped over (not
  // counted against the top 4) so the "next available" holder is simply
  // the next `eligible` row after a passed-over qualifier.
  const skins: PoolSkins = { A: [], B: [] };
  for (const pool of POOLS) {
    let qualifiedCount = 0;
    skins[pool] = championship[pool].map((row): SkinsRow => {
      const holder = holderById.get(row.holderId);
      const rating =
        pool === "B" && holder ? ratingAsOf(holder, snapshot.ratings, seasonEndDate) : undefined;
      // Pool A has no rating gate; Pool B requires rating <=920 — a holder
      // with no rating on record is treated as eligible, consistent with
      // this engine's other rating-gate fallbacks (e.g. the Pool B points
      // gate above only excludes when a rating is actually known).
      const eligible = pool === "A" || rating === undefined || rating <= 920;
      const qualified = eligible && qualifiedCount < 4;
      if (qualified) qualifiedCount += 1;
      return {
        rank: row.rank,
        holderId: row.holderId,
        tagNumber: row.tagNumber,
        totalPoints: row.totalPoints,
        eligible,
        qualified,
      };
    });
  }

  const subLeagueComplete: Record<SubLeagueType, boolean> = {
    EARLY: snapshot.subLeagues.find((s) => s.type === "EARLY")?.complete ?? false,
    MID: snapshot.subLeagues.find((s) => s.type === "MID")?.complete ?? false,
    LATE: snapshot.subLeagues.find((s) => s.type === "LATE")?.complete ?? false,
  };

  const financials = computeFinancials({
    seasonYear: snapshot.seasonYear,
    financial: snapshot.financial,
    subLeagueComplete,
  });

  const currentTagByHolderRecord: Record<number, number | null> = {};
  for (const [holderId, tag] of currentTagByHolder) currentTagByHolderRecord[holderId] = tag;

  return {
    seasonYear: snapshot.seasonYear,
    championship,
    subLeagues,
    scoreSheet,
    podium,
    olpPot,
    olp,
    skins,
    financials,
    tagAssignments,
    currentTagByHolder: currentTagByHolderRecord,
  };
}
