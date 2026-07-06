import { formatCents } from "@/lib/money";
import { SEASON_YEAR } from "@server/admin/context";
import { listAdjustments } from "@server/db/repositories/financialAdjustments";
import { getOpenings } from "@server/db/repositories/financialOpenings";
import { listExpenses } from "@server/db/repositories/expenses";
import { listPayouts } from "@server/db/repositories/payouts";
import { loadSeasonSnapshot } from "@server/db/repositories/seasonSnapshot";
import { listTagSales } from "@server/db/repositories/tagSales";
import { listHolders } from "@server/db/repositories/tagHolders";
import { computeSeason } from "@server/engine";

import {
  AddAdjustmentForm,
  AddExpenseForm,
  AddPayoutForm,
  AddTagSaleForm,
  AdjustmentRow,
  ExpenseRow,
  OpeningsForm,
  PayoutRow,
  TagSaleRow,
} from "./financials-forms";

export const dynamic = "force-dynamic";

function sortByDateDesc<T extends { id: number }>(rows: T[], dateKey: keyof T): T[] {
  return [...rows].sort((a, b) => {
    const dateCmp = String(b[dateKey]).localeCompare(String(a[dateKey]));
    return dateCmp !== 0 ? dateCmp : b.id - a.id;
  });
}

export default async function AdminFinancialsPage() {
  const openings = getOpenings(SEASON_YEAR);
  const tagSales = sortByDateDesc(listTagSales(SEASON_YEAR), "saleDate");
  const payouts = sortByDateDesc(listPayouts(SEASON_YEAR), "paidDate");
  const expenses = sortByDateDesc(listExpenses(SEASON_YEAR), "spentDate");
  const adjustments = sortByDateDesc(listAdjustments(SEASON_YEAR), "adjustedDate");
  const holders = listHolders(SEASON_YEAR);
  const holderNames = new Map(holders.map((h) => [h.id, `#${h.tagNumber} ${h.name}`]));

  const { funds, totalCashCents } = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).financials;

  return (
    <>
      <h1 className="admin-page-title">Financials</h1>
      <p className="admin-page-intro">
        Record cash facts; fund balances below are computed from these inputs (Spec 09 §9.2).
      </p>

      <section className="admin-section">
        <h2 className="admin-section-heading">Fund balances (computed)</h2>
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--keyvalue">
            <tbody>
              <tr>
                <th>Reserves</th>
                <td>{formatCents(funds.reserves)}</td>
              </tr>
              <tr>
                <th>Ace</th>
                <td>{formatCents(funds.ace)}</td>
              </tr>
              <tr>
                <th>OLP Early</th>
                <td>{formatCents(funds.olp.EARLY)}</td>
              </tr>
              <tr>
                <th>OLP Mid</th>
                <td>{formatCents(funds.olp.MID)}</td>
              </tr>
              <tr>
                <th>OLP Late</th>
                <td>{formatCents(funds.olp.LATE)}</td>
              </tr>
              <tr>
                <th>Skins A</th>
                <td>{formatCents(funds.skins.A)}</td>
              </tr>
              <tr>
                <th>Skins B</th>
                <td>{formatCents(funds.skins.B)}</td>
              </tr>
              <tr>
                <th>Total club cash</th>
                <td>
                  <strong>{formatCents(totalCashCents)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-heading">Opening balances</h2>
        <p className="admin-page-intro">Carried-over ace pot and expense reserves at season start (2026).</p>
        <OpeningsForm
          aceOpeningCents={openings?.aceOpeningCents ?? 0}
          reservesOpeningCents={openings?.reservesOpeningCents ?? 0}
        />
      </section>

      <section className="admin-section">
        <h2 className="admin-section-heading">Tag sales</h2>
        {tagSales.length === 0 ? (
          <p className="admin-empty">No tag sales recorded.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Count</th>
                  <th>Amount</th>
                  <th>Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tagSales.map((sale) => (
                  <TagSaleRow key={sale.id} sale={sale} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h3 className="admin-subsection-heading">Add tag sale</h3>
        <AddTagSaleForm />
      </section>

      <section className="admin-section">
        <h2 className="admin-section-heading">Payouts</h2>
        {payouts.length === 0 ? (
          <p className="admin-empty">No payouts recorded.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Date</th>
                  <th>Target</th>
                  <th>Amount</th>
                  <th>Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((payout) => (
                  <PayoutRow key={payout.id} payout={payout} holderNames={holderNames} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h3 className="admin-subsection-heading">Record payout</h3>
        <AddPayoutForm holders={holders} />
      </section>

      <section className="admin-section">
        <h2 className="admin-section-heading">Expenses</h2>
        {expenses.length === 0 ? (
          <p className="admin-empty">No expenses recorded.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <ExpenseRow key={expense.id} expense={expense} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h3 className="admin-subsection-heading">Add expense</h3>
        <AddExpenseForm />
      </section>

      <section className="admin-section">
        <h2 className="admin-section-heading">Adjustments (overrides)</h2>
        {adjustments.length === 0 ? (
          <p className="admin-empty">No adjustments recorded.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Fund</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Reason</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((adjustment) => (
                  <AdjustmentRow key={adjustment.id} adjustment={adjustment} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h3 className="admin-subsection-heading">Add adjustment</h3>
        <AddAdjustmentForm />
      </section>
    </>
  );
}
