"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  createHolderAction,
  poolSwitchAction,
  updateHolderAction,
} from "../actions";

type Holder = {
  id: number;
  name: string;
  tagNumber: number;
  pool: "A" | "B";
  entryDate: string;
  pdgaNumber: number | null;
  ratingAtEntry: number | null;
  active: boolean;
  pdgaMembership: boolean;
};

function Feedback({ message, warning }: { message: string | null; warning?: string }) {
  if (!message && !warning) return null;
  return (
    <div>
      {message ? <p className="admin-feedback admin-feedback--success">{message}</p> : null}
      {warning ? <p className="admin-feedback admin-feedback--warning">{warning}</p> : null}
    </div>
  );
}

export function CreateHolderForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | undefined>();

  async function handleSubmit(formData: FormData) {
    setMessage(null);
    setWarning(undefined);
    try {
      const result = await createHolderAction(formData);
      setMessage(`Created — published version ${result.publishedVersion}`);
      setWarning(result.warning);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form action={handleSubmit} className="admin-form">
      <label className="admin-field">
        Name <input name="name" required className="admin-input" />
      </label>
      <label className="admin-field">
        Tag # <input name="tagNumber" type="number" min={1} required className="admin-input" />
      </label>
      <label className="admin-field">
        Pool{" "}
        <select name="pool" defaultValue="A" className="admin-select">
          <option value="A">A</option>
          <option value="B">B</option>
        </select>
      </label>
      <label className="admin-field">
        Entry date <input name="entryDate" type="datetime-local" required className="admin-input" />
      </label>
      <label className="admin-field">
        PDGA # <input name="pdgaNumber" type="number" className="admin-input" />
      </label>
      <label className="admin-field">
        Rating at entry <input name="ratingAtEntry" type="number" className="admin-input" />
      </label>
      <label className="admin-field admin-field--check">
        <input name="active" type="checkbox" defaultChecked className="admin-checkbox" /> Active
      </label>
      <label className="admin-field admin-field--check">
        <input name="pdgaMembership" type="checkbox" className="admin-checkbox" /> PDGA member
      </label>
      <button type="submit" className="admin-button admin-button--primary">
        Add holder
      </button>
      <Feedback message={message} warning={warning} />
    </form>
  );
}

export function HolderRow({ holder }: { holder: Holder }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | undefined>();

  async function handleUpdate(formData: FormData) {
    setMessage(null);
    setWarning(undefined);
    try {
      const result = await updateHolderAction(formData);
      setMessage(`Saved — version ${result.publishedVersion}`);
      setWarning(result.warning);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  if (editing) {
    return (
      <tr>
        <td colSpan={10}>
          <form action={handleUpdate} className="admin-edit-form">
            <input type="hidden" name="id" value={holder.id} />
            <label className="admin-field">
              Name <input name="name" defaultValue={holder.name} required className="admin-input" />
            </label>
            <label className="admin-field">
              Tag #{" "}
              <input
                name="tagNumber"
                type="number"
                defaultValue={holder.tagNumber}
                required
                className="admin-input"
              />
            </label>
            <label className="admin-field">
              Pool{" "}
              <select name="pool" defaultValue={holder.pool} className="admin-select">
                <option value="A">A</option>
                <option value="B">B</option>
              </select>
            </label>
            <label className="admin-field">
              Entry date{" "}
              <input name="entryDate" defaultValue={holder.entryDate} required className="admin-input" />
            </label>
            <label className="admin-field">
              PDGA #{" "}
              <input
                name="pdgaNumber"
                type="number"
                defaultValue={holder.pdgaNumber ?? ""}
                className="admin-input"
              />
            </label>
            <label className="admin-field">
              Rating{" "}
              <input
                name="ratingAtEntry"
                type="number"
                defaultValue={holder.ratingAtEntry ?? ""}
                className="admin-input"
              />
            </label>
            <label className="admin-field admin-field--check">
              <input
                name="active"
                type="checkbox"
                defaultChecked={holder.active}
                className="admin-checkbox"
              />{" "}
              Active
            </label>
            <label className="admin-field admin-field--check">
              <input
                name="pdgaMembership"
                type="checkbox"
                defaultChecked={holder.pdgaMembership}
                className="admin-checkbox"
              />{" "}
              PDGA member
            </label>
            <button type="submit" className="admin-button admin-button--primary">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="admin-button">
              Cancel
            </button>
            <Feedback message={message} warning={warning} />
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{holder.id}</td>
      <td>{holder.name}</td>
      <td className="admin-num">{holder.tagNumber}</td>
      <td>{holder.pool}</td>
      <td>{holder.entryDate}</td>
      <td className="admin-num">{holder.pdgaNumber ?? "—"}</td>
      <td className="admin-num">{holder.ratingAtEntry ?? "—"}</td>
      <td>
        <span className="admin-status" data-status={holder.active ? "yes" : "no"}>
          {holder.active ? "yes" : "no"}
        </span>
      </td>
      <td>
        <span className="admin-status" data-status={holder.pdgaMembership ? "yes" : "no"}>
          {holder.pdgaMembership ? "yes" : "no"}
        </span>
      </td>
      <td>
        <button type="button" onClick={() => setEditing(true)} className="admin-button">
          Edit
        </button>
      </td>
    </tr>
  );
}

export function PoolSwitchForm({ holders }: { holders: Holder[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setMessage(null);
    try {
      const result = await poolSwitchAction(formData);
      setMessage(`Pool switch recorded — version ${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form action={handleSubmit} className="admin-form">
      <label className="admin-field">
        Holder{" "}
        <select name="holderId" required className="admin-select">
          {holders.map((h) => (
            <option key={h.id} value={h.id}>
              #{h.tagNumber} {h.name} (Pool {h.pool})
            </option>
          ))}
        </select>
      </label>
      <label className="admin-field">
        To pool{" "}
        <select name="toPool" className="admin-select">
          <option value="A">A</option>
          <option value="B">B</option>
        </select>
      </label>
      <label className="admin-field">
        Effective date <input name="effectiveDate" type="date" required className="admin-input" />
      </label>
      <button type="submit" className="admin-button admin-button--primary">
        Record switch
      </button>
      <Feedback message={message} />
    </form>
  );
}
