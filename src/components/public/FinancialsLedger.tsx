import type { Route } from "next";
import Link from "next/link";

import type { LedgerRowView, LedgerView } from "@/lib";

/** The row's title, linked when a public destination exists (league-night
 * → sub-league board, olp-payout → OLP page, skins-payout → score sheet),
 * plain text otherwise (tag-sale/expense/ace-win/adjustment/opening —
 * Spec 09 §9.3.3). */
function LedgerTitle({ row }: { row: LedgerRowView }) {
  if (row.href) {
    return (
      <Link href={row.href as Route} className="financials-ledger-link">
        {row.title}
      </Link>
    );
  }
  return <>{row.title}</>;
}

/** A League-Night row: the always-visible row content doubles as the
 * `<details><summary>` trigger, collapsed by default, expanding to its
 * per-fund splits (Spec 09 §9.3.3 "one row per League Night, collapsed"). */
function LedgerNightRow({ row }: { row: LedgerRowView }) {
  return (
    <tr className="financials-ledger-row financials-ledger-row-night">
      <td colSpan={4} className="financials-ledger-night-cell">
        <details className="financials-ledger-night-details">
          <summary className="financials-ledger-night-summary">
            <span data-label="Date" className="financials-ledger-summary-cell">
              {row.date}
            </span>
            <span data-label="Entry" className="financials-ledger-summary-cell">
              <LedgerTitle row={row} />
            </span>
            <span
              data-label="Amount"
              className="financials-ledger-summary-cell financials-ledger-amount"
            >
              {row.netAmount}
            </span>
            <span
              data-label="Running total"
              className="financials-ledger-summary-cell financials-ledger-amount"
            >
              {row.runningTotal}
            </span>
          </summary>
          <ul className="financials-ledger-splits">
            {(row.splitChildren ?? []).map((child) => (
              <li key={child.label} className="financials-ledger-split">
                <span className="financials-ledger-split-label">{child.label}</span>
                <span className="financials-ledger-split-amount">{child.amount}</span>
              </li>
            ))}
          </ul>
        </details>
      </td>
    </tr>
  );
}

/** A single-line non-night row: inline `detail` text alongside the title. */
function LedgerPlainRow({ row }: { row: LedgerRowView }) {
  return (
    <tr className="financials-ledger-row">
      <td data-label="Date">{row.date}</td>
      <td data-label="Entry">
        <LedgerTitle row={row} />
        {row.detail ? <span className="financials-ledger-detail-inline"> — {row.detail}</span> : null}
      </td>
      <td data-label="Amount" className="financials-ledger-amount">
        {row.netAmount}
      </td>
      <td data-label="Running total" className="financials-ledger-amount">
        {row.runningTotal}
      </td>
    </tr>
  );
}

/**
 * `#ledger` (Spec 09 §9.3.3): the full chronological ledger in a table that
 * scrolls horizontally inside its own container (never the page body).
 * League-night rows (carrying `splitChildren`) render as a collapsed
 * `<details>` that expands in place to the night's splits; every other row
 * is a single line with its `detail` text inline. Purely presentational —
 * `ledger.rows` arrives already in the engine's chronological order.
 */
export function FinancialsLedger({ ledger }: { ledger: LedgerView }) {
  if (ledger.rows.length === 0) {
    return (
      <section id="ledger" className="financials-ledger-section">
        <h2 className="financials-section-heading">Full ledger</h2>
        <div className="financials-ledger-empty" role="status">
          <p>No ledger entries yet.</p>
        </div>
      </section>
    );
  }

  return (
    <section id="ledger" className="financials-ledger-section">
      <h2 className="financials-section-heading">Full ledger</h2>
      <div className="financials-ledger-table-wrap">
        <table className="financials-ledger-table">
          <caption className="financials-ledger-caption">Season financial ledger</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Entry</th>
              <th scope="col">Amount</th>
              <th scope="col">Running total</th>
            </tr>
          </thead>
          <tbody>
            {ledger.rows.map((row, index) =>
              row.splitChildren ? (
                <LedgerNightRow key={`${row.kind}-${row.date}-${index}`} row={row} />
              ) : (
                <LedgerPlainRow key={`${row.kind}-${row.date}-${index}`} row={row} />
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
