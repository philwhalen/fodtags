import type { Route } from "next";
import Link from "next/link";

/**
 * Total OLP pot for a sub-league (Spec 06 §6.3), shown alongside the
 * per-rank payout columns in `OlpTable` so viewers see the whole pool and
 * how it splits. Labeled "projected" while the sub-league is in progress,
 * "final" once complete — plain text, not color-only, per Spec 11's
 * accessibility conventions. Cross-links to the OLP pot detail on the
 * financials page (`#pots-olp`, Spec 06 §6.3 / Spec 09 §9.3).
 */
export function OlpPotSummary({
  pot,
  projected,
  seasonYear,
}: {
  pot: number;
  projected: boolean;
  seasonYear: number;
}) {
  return (
    <p className="olp-pot-summary">
      OLP pot: ${pot} · {projected ? "projected" : "final"} ·{" "}
      <Link href={`/${seasonYear}/financials#pots-olp` as Route} className="olp-pot-summary-link">
        see financials
      </Link>
    </p>
  );
}
