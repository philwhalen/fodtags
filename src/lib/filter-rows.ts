import { normalizeName } from "./normalize-name";

/**
 * Client-side name filter (Spec 04 §4.7): narrows `rows` to those whose
 * `name` matches `query` as a case-insensitive, accent-insensitive
 * substring (reusing the roster name-normalization from player matching).
 *
 * - Empty/whitespace query is the identity — returns `rows` unchanged.
 * - Otherwise returns a filtered **subset of the same row objects**, so
 *   `rank`/`points` (and every other field) are never mutated or
 *   recomputed — filtering never re-ranks.
 */
export function filterRowsByName<T extends { name: string }>(
  rows: T[],
  query: string,
): T[] {
  if (query.trim() === "") {
    return rows;
  }
  const normalizedQuery = normalizeName(query);
  return rows.filter((row) => normalizeName(row.name).includes(normalizedQuery));
}
