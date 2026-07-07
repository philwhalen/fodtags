/**
 * A tag number's sort key for the Spec 02 §2.6 tie-break: numbered holders
 * sort by ascending tag number; a tagless (provisional, not-yet-confirmed —
 * Spec 03 §3.5) holder always sorts last. `Number.MAX_SAFE_INTEGER` is
 * larger than any real tag number, so a plain subtraction comparator
 * (`tagSortKey(a) - tagSortKey(b)`) puts every tagless holder after every
 * numbered one.
 *
 * This key alone does not distinguish between two tagless holders (both
 * map to the same constant) — every caller pairs it with a deterministic
 * secondary comparison (holder/player ID) so ties among tagless holders
 * still resolve to a strict order. See spec 02 §2.6 and
 * plans/auto-add-players/00-master.md decision #2.
 */
export function tagSortKey(tagNumber: number | null): number {
  return tagNumber ?? Number.MAX_SAFE_INTEGER;
}

/** Display form of a tag number — "—" when the holder is provisional and
 * has none yet (Spec 08 §8.1/§8.3). */
export function formatTagNumber(tagNumber: number | null): string {
  return tagNumber == null ? "—" : String(tagNumber);
}
