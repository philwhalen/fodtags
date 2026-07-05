import Link from "next/link";

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

import { AdminNav } from "../admin-nav";
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
    <main>
      <h1>Financials</h1>
      <AdminNav />
      <p>
        <Link href="/admin">← Dashboard</Link>
      </p>
      <p>Record cash facts; fund balances below are computed from these inputs (Spec 09 §9.2).</p>

      <h2>Fund balances (computed)</h2>
      <table>
        <tbody>
          <tr>
            <th align="left">Reserves</th>
            <td>{formatCents(funds.reserves)}</td>
          </tr>
          <tr>
            <th align="left">Ace</th>
            <td>{formatCents(funds.ace)}</td>
          </tr>
          <tr>
            <th align="left">OLP Early</th>
            <td>{formatCents(funds.olp.EARLY)}</td>
          </tr>
          <tr>
            <th align="left">OLP Mid</th>
            <td>{formatCents(funds.olp.MID)}</td>
          </tr>
          <tr>
            <th align="left">OLP Late</th>
            <td>{formatCents(funds.olp.LATE)}</td>
          </tr>
          <tr>
            <th align="left">Skins A</th>
            <td>{formatCents(funds.skins.A)}</td>
          </tr>
          <tr>
            <th align="left">Skins B</th>
            <td>{formatCents(funds.skins.B)}</td>
          </tr>
          <tr>
            <th align="left">Total club cash</th>
            <td>
              <strong>{formatCents(totalCashCents)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Opening balances</h2>
      <p>Carried-over ace pot and expense reserves at season start (2026).</p>
      <OpeningsForm
        aceOpeningCents={openings?.aceOpeningCents ?? 0}
        reservesOpeningCents={openings?.reservesOpeningCents ?? 0}
      />

      <h2>Tag sales</h2>
      {tagSales.length === 0 ? (
        <p>No tag sales recorded.</p>
      ) : (
        <table>
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
      )}
      <h3>Add tag sale</h3>
      <AddTagSaleForm />

      <h2>Payouts</h2>
      {payouts.length === 0 ? (
        <p>No payouts recorded.</p>
      ) : (
        <table>
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
      )}
      <h3>Record payout</h3>
      <AddPayoutForm holders={holders} />

      <h2>Expenses</h2>
      {expenses.length === 0 ? (
        <p>No expenses recorded.</p>
      ) : (
        <table>
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
      )}
      <h3>Add expense</h3>
      <AddExpenseForm />

      <h2>Adjustments (overrides)</h2>
      {adjustments.length === 0 ? (
        <p>No adjustments recorded.</p>
      ) : (
        <table>
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
      )}
      <h3>Add adjustment</h3>
      <AddAdjustmentForm />
    </main>
  );
}
