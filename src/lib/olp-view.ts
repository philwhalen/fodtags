import { roundToOneDecimal } from "./index";
import { VALID_SUB_LEAGUES } from "./public-routes";
import type { SubLeagueSlug } from "./public-routes";
import type { SubLeagueType } from "./season-snapshot";
import type { OlpRow } from "./season-results";

/**
 * One projected OLP row for public display (Spec 06 §6.2). Component
 * fields are already rounded to one decimal (display precision) so the
 * page never re-rounds, and the four components always reconcile to
 * `score` at that same precision: `ratingComponent + avgToPar − rounds −
 * poolWins = score`. `name` mirrors the shape `filterRowsByName` expects
 * so the ranked/not-eligible sections can reuse the shared name filter.
 */
export interface PublicOlpRow {
  holderId: number;
  name: string;
  slug: string;
  tagNumber: number;
  /** Eligible rows: 1..N over the eligible field, best score first. `null`
   * for not-eligible rows (Spec 06 §6.2: not ranked). */
  displayRank: number | null;
  score: number;
  /** The formula's `0.10 ×` rating contribution, e.g. `85.3` for an 853
   * rating — not the raw rating (Spec 06 §6.2). */
  ratingComponent: number;
  avgToPar: number;
  rounds: number;
  poolWins: number;
  eligible: boolean;
  /** Dollars for eligible ranks 1–3; `null` otherwise. Passthrough from
   * the engine's largest-remainder split (Spec 02 §2.8). */
  payout: number | null;
  tieBrokenByTag: boolean;
  /** Present only on not-eligible rows: `"2 rounds"` / `"1 round"` /
   * `"no PDGA"` (Spec 06 §6.2). */
  ineligibleReason?: string;
}

/** Published payload for one `olp/<sub-league>` view. */
export interface PublicOlpPayload {
  subLeague: SubLeagueType;
  /** Engine-shaped rows + resolved holder names, unsplit — the
   * eligible/not-eligible split and display ranking happen at read time
   * in `projectOlp`. */
  rows: (OlpRow & { name: string; slug: string })[];
  pot: number;
  /** True while the sub-league is not yet `complete` — pot/payouts are
   * provisional (Spec 06 §6.3/§6.4). */
  projected: boolean;
  updatedAt: string;
  stale: boolean;
  pendingReview: number;
}

/** The result of projecting a `PublicOlpPayload` for display. */
export interface OlpProjection {
  /** Eligible rows only, `displayRank` 1..N, engine order preserved
   * (already sorted by score / tag-break). */
  ranked: PublicOlpRow[];
  /** Ineligible rows, `displayRank` null, engine order preserved, each
   * carrying an `ineligibleReason`. */
  notEligible: PublicOlpRow[];
  pot: number;
  projected: boolean;
}

function ineligibleReason(row: OlpRow): string {
  if (row.rounds < 4) {
    return `${row.rounds} round${row.rounds === 1 ? "" : "s"}`;
  }
  // Once >=4 rounds are played, the only remaining cause of ineligibility
  // is the lack of PDGA membership (Spec 06 §6.2).
  return "no PDGA";
}

function toPublicRow(
  row: OlpRow & { name: string; slug: string },
  displayRank: number | null,
): PublicOlpRow {
  const base: PublicOlpRow = {
    holderId: row.holderId,
    name: row.name,
    slug: row.slug,
    tagNumber: row.tagNumber,
    displayRank,
    score: roundToOneDecimal(row.score),
    ratingComponent: roundToOneDecimal(row.ratingComponent),
    avgToPar: roundToOneDecimal(row.avgToPar),
    rounds: row.rounds,
    poolWins: row.poolWins,
    eligible: row.eligible,
    payout: row.payout,
    tieBrokenByTag: row.tieBrokenByTag,
  };
  if (!row.eligible) {
    base.ineligibleReason = ineligibleReason(row);
  }
  return base;
}

/**
 * Projects an `olp/<sub-league>` read-model payload into the eligible
 * ranked table + not-eligible section the page renders (Spec 06 §6.2).
 * The engine's `OlpRow.rank` (score-position across all candidates,
 * interleaved) is not used for display — ranks 1..N are derived here over
 * eligible rows only, so rank 1/2/3 line up with the payout columns.
 *
 * `payload.rows` arrive already sorted by score (tag-break applied) from
 * the engine; that order is preserved within each group — this function
 * never re-sorts.
 */
export function projectOlp(payload: PublicOlpPayload): OlpProjection {
  const eligibleRows = payload.rows.filter((row) => row.eligible);
  const ineligibleRows = payload.rows.filter((row) => !row.eligible);

  const ranked = eligibleRows.map((row, index) => toPublicRow(row, index + 1));
  const notEligible = ineligibleRows.map((row) => toPublicRow(row, null));

  return {
    ranked,
    notEligible,
    pot: payload.pot,
    projected: payload.projected,
  };
}

/**
 * Pure link builder for the OLP sub-league segmented control (mirrors
 * `buildLeaderboardLinks`/`buildRoundsLinks`) so `OlpControls` is a thin
 * renderer over explicit, deep-linkable hrefs (Spec 06 §6.5).
 */
export function buildOlpLinks(season: string): Record<SubLeagueSlug, string> {
  return Object.fromEntries(
    VALID_SUB_LEAGUES.map((slug) => [slug, `/${season}/olp/${slug}`]),
  ) as Record<SubLeagueSlug, string>;
}
