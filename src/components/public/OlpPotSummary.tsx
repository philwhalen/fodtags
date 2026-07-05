/**
 * Total OLP pot for a sub-league (Spec 06 §6.3), shown alongside the
 * per-rank payout columns in `OlpTable` so viewers see the whole pool and
 * how it splits. Labeled "projected" while the sub-league is in progress,
 * "final" once complete — plain text, not color-only, per Spec 11's
 * accessibility conventions.
 */
export function OlpPotSummary({
  pot,
  projected,
}: {
  pot: number;
  projected: boolean;
}) {
  return (
    <p className="olp-pot-summary">
      OLP pot: ${pot} · {projected ? "projected" : "final"}
    </p>
  );
}
