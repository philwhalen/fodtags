/** Tag sale unit price in cents (Spec 09 §9.1 — $20 per tag). */
export const TAG_SALE_CENTS = 2000;

/** Convert a dollar amount (string or number) to integer cents for server actions. */
export function dollarsToCents(dollars: string | number): number {
  const value = typeof dollars === "string" ? Number.parseFloat(dollars.trim()) : dollars;
  if (!Number.isFinite(value)) {
    throw new Error("Invalid dollar amount.");
  }
  return Math.round(value * 100);
}

/** Format integer cents as a dollar string for form defaults (e.g. `"12.50"`). */
export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Format integer cents for display (e.g. `"$12.50"`, `"−$3.00"`). */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}
