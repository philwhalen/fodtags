/**
 * Normalize a display name for unique-name auto-matching (Spec 03 §3.5).
 * Client-safe — no server imports.
 */
export function normalizeName(s: string): string {
  const withoutDiacritics = s.normalize("NFD").replace(/\p{M}/gu, "");
  return withoutDiacritics
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
