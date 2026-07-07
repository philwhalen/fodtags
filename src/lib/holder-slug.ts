import { slugifyName } from "./slugify-name";

export interface SlugHolderInput {
  id: number;
  name: string;
  /** Null for a provisional (auto-added, not-yet-confirmed) holder — Spec
   * 03 §3.5/§3.6 — in which case a base-slug collision falls back to the
   * holder ID instead of the tag number (Spec 08 §8.2). */
  tagNumber: number | null;
}

/** Map holderId → canonical slug (Spec 08 §8.2). On a base-slug collision,
 * appends the tag number to disambiguate — or the holder ID, for a
 * tagless (provisional) holder, so the fallback is still unique and
 * stable. */
export function buildCanonicalSlugs(holders: SlugHolderInput[]): Map<number, string> {
  const baseById = new Map<number, string>();
  const groups = new Map<string, SlugHolderInput[]>();

  for (const holder of holders) {
    const base = slugifyName(holder.name);
    baseById.set(holder.id, base);
    const group = groups.get(base) ?? [];
    group.push(holder);
    groups.set(base, group);
  }

  const slugById = new Map<number, string>();
  for (const holder of holders) {
    const base = baseById.get(holder.id)!;
    const group = groups.get(base)!;
    slugById.set(
      holder.id,
      group.length > 1 ? `${base}-${holder.tagNumber ?? holder.id}` : base,
    );
  }
  return slugById;
}

export type HolderSlugResolution =
  | { kind: "found"; slug: string }
  | { kind: "redirect"; slug: string }
  | { kind: "not_found" };

/** Lookup + redirect target for a requested slug against the index. */
export function resolveHolderSlug(
  requestedSlug: string,
  holders: Array<{ slug: string }>,
): HolderSlugResolution {
  const exact = holders.find((holder) => holder.slug === requestedSlug);
  if (exact) {
    return { kind: "found", slug: exact.slug };
  }

  const candidates = holders.filter(
    (holder) =>
      holder.slug === requestedSlug || holder.slug.startsWith(`${requestedSlug}-`),
  );
  if (candidates.length === 1 && candidates[0]!.slug !== requestedSlug) {
    return { kind: "redirect", slug: candidates[0]!.slug };
  }

  return { kind: "not_found" };
}
