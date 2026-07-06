import { slugifyName } from "./slugify-name";

export interface SlugHolderInput {
  id: number;
  name: string;
  tagNumber: number;
}

/** Map holderId → canonical slug (Spec 08 §8.2). */
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
      group.length > 1 ? `${base}-${holder.tagNumber}` : base,
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
