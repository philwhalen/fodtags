import type { FinancialsSummaryView, FundStatus } from "@/lib";

/** Plain-text projected/final label — never color-only (Spec 11). */
function StatusBadge({ status }: { status: FundStatus }) {
  return (
    <span className="financials-status" data-status={status}>
      {status}
    </span>
  );
}

/**
 * `#summary` (Spec 09 §9.3.1): the headline fund balances (reserves, ace,
 * per-sub-league OLP, per-pool skins), the emphasized total-club-cash row,
 * the season totals line, and a static "how this is calculated" disclosure.
 * Purely presentational over the already-projected `summary` view model —
 * no formatting, sorting, or status derivation happens here.
 */
export function FinancialsSummary({ summary }: { summary: FinancialsSummaryView }) {
  return (
    <section id="summary" className="financials-summary">
      <h2 className="financials-section-heading">Season summary</h2>

      <ul className="financials-fund-list">
        {summary.fundRows.map((row) => (
          <li key={row.fund} className="financials-fund-row">
            <span className="financials-fund-label">{row.label}</span>
            <span className="financials-fund-amount">{row.amount}</span>
            <StatusBadge status={row.status} />
          </li>
        ))}
      </ul>

      <div className="financials-total-row">
        <span className="financials-fund-label">Total club cash</span>
        <span className="financials-total-amount">{summary.totalCash.amount}</span>
        <StatusBadge status={summary.totalCash.status} />
      </div>

      <p className="financials-totals-line">
        Tag sales: {summary.totals.tagSales} · Paid entries: {summary.totals.paidEntries} · Ace
        entries: {summary.totals.aceEntries}
      </p>

      <details className="financials-explainer">
        <summary>How this is calculated</summary>
        <p>
          Every $6 League Night entry splits into <strong>$2.80 to the skins purse</strong>{" "}
          (66.67% Pool A / 33.33% Pool B), <strong>$1.00 to the OLP pot</strong>, and{" "}
          <strong>$2.20 to Expense Reserves</strong>. Each $1 ace-pot buy-in goes entirely to the
          Ace pot, and each $20 tag purchase goes entirely to Expense Reserves.{" "}
          <strong>Total club cash is the sum of every fund balance above.</strong>
        </p>
      </details>
    </section>
  );
}
