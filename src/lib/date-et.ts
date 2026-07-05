/**
 * Pure, client-safe "today in ET" date-only helper (Spec 04 §4.3's
 * "America/New_York" clock). Mirrors the `Intl.DateTimeFormat` date-parts
 * approach in `src/server/ingestion/ratings-pipeline.ts`'s
 * `secondTuesdayEffectiveDate`, but lives here (no server imports) so both
 * client components and server code can call it.
 */
export function todayEt(timeZone: string = "America/New_York", now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${year}-${month}-${day}`;
}
