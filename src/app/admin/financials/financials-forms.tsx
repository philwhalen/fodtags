"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatTagNumber } from "@/lib";
import { centsToDollars, dollarsToCents, formatCents, TAG_SALE_CENTS } from "@/lib/money";

import {
  addAdjustmentAction,
  addExpenseAction,
  addTagSaleAction,
  deleteAdjustmentAction,
  deleteExpenseAction,
  deletePayoutAction,
  deleteTagSaleAction,
  recordPayoutAction,
  upsertOpeningsAction,
} from "../actions";

function Feedback({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="admin-feedback admin-feedback--success">{message}</p>;
}

type Holder = {
  id: number;
  name: string;
  tagNumber: number | null;
};

type TagSale = {
  id: number;
  saleDate: string;
  count: number;
  note: string | null;
};

type Payout = {
  id: number;
  kind: "OLP" | "SKINS" | "ACE";
  paidDate: string;
  amountCents: number;
  subLeague: "EARLY" | "MID" | "LATE" | null;
  pool: "A" | "B" | null;
  recipientHolderId: number | null;
  note: string | null;
};

type Expense = {
  id: number;
  spentDate: string;
  amountCents: number;
  category: string;
  description: string;
};

type Adjustment = {
  id: number;
  fund: string;
  deltaCents: number;
  adjustedDate: string;
  reason: string;
};

const FUND_OPTIONS = [
  { value: "reserves", label: "Reserves" },
  { value: "ace", label: "Ace" },
  { value: "olp:EARLY", label: "OLP Early" },
  { value: "olp:MID", label: "OLP Mid" },
  { value: "olp:LATE", label: "OLP Late" },
  { value: "skins:A", label: "Skins A" },
  { value: "skins:B", label: "Skins B" },
] as const;

const EXPENSE_CATEGORIES = [
  { value: "pdga_fees", label: "PDGA fees" },
  { value: "trophies", label: "Trophies" },
  { value: "ctp", label: "CTP" },
  { value: "contingency", label: "Contingency" },
  { value: "other", label: "Other" },
] as const;

function payoutTargetLabel(payout: Payout, holderNames: Map<number, string>): string {
  if (payout.kind === "OLP") {
    return payout.subLeague ?? "—";
  }
  if (payout.kind === "SKINS") {
    return payout.pool ? `Pool ${payout.pool}` : "—";
  }
  if (payout.recipientHolderId !== null) {
    return holderNames.get(payout.recipientHolderId) ?? `#${payout.recipientHolderId}`;
  }
  return "Non-holder";
}

export function OpeningsForm({
  aceOpeningCents,
  reservesOpeningCents,
}: {
  aceOpeningCents: number;
  reservesOpeningCents: number;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setMessage(null);
    try {
      const aceDollars = String(formData.get("aceOpeningDollars") ?? "");
      const reservesDollars = String(formData.get("reservesOpeningDollars") ?? "");
      formData.delete("aceOpeningDollars");
      formData.delete("reservesOpeningDollars");
      formData.set("aceOpeningCents", String(dollarsToCents(aceDollars)));
      formData.set("reservesOpeningCents", String(dollarsToCents(reservesDollars)));
      const result = await upsertOpeningsAction(formData);
      setMessage(`Saved — version ${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form action={handleSubmit} className="admin-form">
      <label className="admin-field">
        Ace opening ($)
        <input
          name="aceOpeningDollars"
          type="number"
          min={0}
          step="0.01"
          defaultValue={centsToDollars(aceOpeningCents)}
          className="admin-input admin-input--narrow"
        />
      </label>
      <label className="admin-field">
        Reserves opening ($)
        <input
          name="reservesOpeningDollars"
          type="number"
          min={0}
          step="0.01"
          defaultValue={centsToDollars(reservesOpeningCents)}
          className="admin-input admin-input--narrow"
        />
      </label>
      <button type="submit" className="admin-button admin-button--primary">
        Save openings
      </button>
      <Feedback message={message} />
    </form>
  );
}

export function AddTagSaleForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setMessage(null);
    try {
      const result = await addTagSaleAction(formData);
      setMessage(`Added — version ${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form action={handleSubmit} className="admin-form">
      <label className="admin-field">
        Date <input name="saleDate" type="date" required className="admin-input" />
      </label>
      <label className="admin-field">
        Count <input name="count" type="number" min={1} required className="admin-input admin-input--narrow" />
      </label>
      <label className="admin-field">
        Note <input name="note" className="admin-input" />
      </label>
      <button type="submit" className="admin-button admin-button--primary">
        Add tag sale
      </button>
      <Feedback message={message} />
    </form>
  );
}

export function TagSaleRow({ sale }: { sale: TagSale }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function handleDelete(formData: FormData) {
    setMessage(null);
    try {
      const result = await deleteTagSaleAction(formData);
      setMessage(`Deleted — version ${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <tr>
      <td>{sale.saleDate}</td>
      <td>{sale.count}</td>
      <td className="admin-num">{formatCents(sale.count * TAG_SALE_CENTS)}</td>
      <td>{sale.note ?? "—"}</td>
      <td>
        <div className="admin-actions">
          <form action={handleDelete} className="admin-form--inline">
            <input type="hidden" name="id" value={sale.id} />
            <button type="submit" className="admin-button admin-button--danger">
              Delete
            </button>
          </form>
          {message ? <span className="admin-feedback-inline">{message}</span> : null}
        </div>
      </td>
    </tr>
  );
}

export function AddPayoutForm({ holders }: { holders: Holder[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [kind, setKind] = useState<"OLP" | "SKINS" | "ACE">("OLP");

  async function handleSubmit(formData: FormData) {
    setMessage(null);
    try {
      const amountDollars = String(formData.get("amountDollars") ?? "");
      formData.delete("amountDollars");
      formData.set("amountCents", String(dollarsToCents(amountDollars)));
      const result = await recordPayoutAction(formData);
      setMessage(`Recorded — version ${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form action={handleSubmit} className="admin-form">
      <label className="admin-field">
        Kind
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          className="admin-select"
        >
          <option value="OLP">OLP</option>
          <option value="SKINS">Skins</option>
          <option value="ACE">Ace</option>
        </select>
      </label>
      <label className="admin-field">
        Paid date <input name="paidDate" type="date" required className="admin-input" />
      </label>
      <label className="admin-field">
        Amount ($)
        <input
          name="amountDollars"
          type="number"
          min={0.01}
          step="0.01"
          required
          className="admin-input admin-input--narrow"
        />
      </label>
      {kind === "OLP" ? (
        <label className="admin-field">
          Sub-league
          <select name="subLeague" required className="admin-select">
            <option value="EARLY">EARLY</option>
            <option value="MID">MID</option>
            <option value="LATE">LATE</option>
          </select>
        </label>
      ) : null}
      {kind === "SKINS" ? (
        <label className="admin-field">
          Pool
          <select name="pool" required className="admin-select">
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
        </label>
      ) : null}
      {kind === "ACE" ? (
        <label className="admin-field">
          Recipient
          <select name="recipientHolderId" className="admin-select">
            <option value="">Non-holder</option>
            {holders.map((h) => (
              <option key={h.id} value={h.id}>
                #{formatTagNumber(h.tagNumber)} {h.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="admin-field">
        Note <input name="note" className="admin-input" />
      </label>
      <button type="submit" className="admin-button admin-button--primary">
        Record payout
      </button>
      <Feedback message={message} />
    </form>
  );
}

export function PayoutRow({
  payout,
  holderNames,
}: {
  payout: Payout;
  holderNames: Map<number, string>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function handleDelete(formData: FormData) {
    setMessage(null);
    try {
      const result = await deletePayoutAction(formData);
      setMessage(`Deleted — version ${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <tr>
      <td>{payout.kind}</td>
      <td>{payout.paidDate}</td>
      <td>{payoutTargetLabel(payout, holderNames)}</td>
      <td className="admin-num">{formatCents(payout.amountCents)}</td>
      <td>{payout.note ?? "—"}</td>
      <td>
        <div className="admin-actions">
          <form action={handleDelete} className="admin-form--inline">
            <input type="hidden" name="id" value={payout.id} />
            <button type="submit" className="admin-button admin-button--danger">
              Delete
            </button>
          </form>
          {message ? <span className="admin-feedback-inline">{message}</span> : null}
        </div>
      </td>
    </tr>
  );
}

export function AddExpenseForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setMessage(null);
    try {
      const amountDollars = String(formData.get("amountDollars") ?? "");
      formData.delete("amountDollars");
      formData.set("amountCents", String(dollarsToCents(amountDollars)));
      const result = await addExpenseAction(formData);
      setMessage(`Added — version ${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form action={handleSubmit} className="admin-form">
      <label className="admin-field">
        Date <input name="spentDate" type="date" required className="admin-input" />
      </label>
      <label className="admin-field">
        Amount ($)
        <input
          name="amountDollars"
          type="number"
          min={0.01}
          step="0.01"
          required
          className="admin-input admin-input--narrow"
        />
      </label>
      <label className="admin-field">
        Category
        <select name="category" defaultValue="other" className="admin-select">
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="admin-field">
        Description <input name="description" required className="admin-input" />
      </label>
      <button type="submit" className="admin-button admin-button--primary">
        Add expense
      </button>
      <Feedback message={message} />
    </form>
  );
}

export function ExpenseRow({ expense }: { expense: Expense }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function handleDelete(formData: FormData) {
    setMessage(null);
    try {
      const result = await deleteExpenseAction(formData);
      setMessage(`Deleted — version ${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <tr>
      <td>{expense.spentDate}</td>
      <td className="admin-num">{formatCents(expense.amountCents)}</td>
      <td>{expense.category}</td>
      <td>{expense.description}</td>
      <td>
        <div className="admin-actions">
          <form action={handleDelete} className="admin-form--inline">
            <input type="hidden" name="id" value={expense.id} />
            <button type="submit" className="admin-button admin-button--danger">
              Delete
            </button>
          </form>
          {message ? <span className="admin-feedback-inline">{message}</span> : null}
        </div>
      </td>
    </tr>
  );
}

export function AddAdjustmentForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setMessage(null);
    try {
      const amountDollars = String(formData.get("amountDollars") ?? "");
      formData.delete("amountDollars");
      formData.set("deltaCents", String(dollarsToCents(amountDollars)));
      const result = await addAdjustmentAction(formData);
      setMessage(`Added — version ${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form action={handleSubmit} className="admin-form">
      <label className="admin-field">
        Fund
        <select name="fund" defaultValue="reserves" className="admin-select">
          {FUND_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <label className="admin-field">
        Amount ($, signed)
        <input name="amountDollars" type="number" step="0.01" required className="admin-input admin-input--narrow" />
      </label>
      <label className="admin-field">
        Date <input name="adjustedDate" type="date" required className="admin-input" />
      </label>
      <label className="admin-field">
        Reason <input name="reason" required className="admin-input" />
      </label>
      <button type="submit" className="admin-button admin-button--primary">
        Add adjustment
      </button>
      <Feedback message={message} />
    </form>
  );
}

export function AdjustmentRow({ adjustment }: { adjustment: Adjustment }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function handleDelete(formData: FormData) {
    setMessage(null);
    try {
      const result = await deleteAdjustmentAction(formData);
      setMessage(`Deleted — version ${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  const fundLabel = FUND_OPTIONS.find((f) => f.value === adjustment.fund)?.label ?? adjustment.fund;

  return (
    <tr>
      <td>{fundLabel}</td>
      <td className="admin-num">{formatCents(adjustment.deltaCents)}</td>
      <td>{adjustment.adjustedDate}</td>
      <td>{adjustment.reason}</td>
      <td>
        <div className="admin-actions">
          <form action={handleDelete} className="admin-form--inline">
            <input type="hidden" name="id" value={adjustment.id} />
            <button type="submit" className="admin-button admin-button--danger">
              Delete
            </button>
          </form>
          {message ? <span className="admin-feedback-inline">{message}</span> : null}
        </div>
      </td>
    </tr>
  );
}
