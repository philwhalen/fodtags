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
      {message ? <p>{message}</p> : null}
      {warning ? <p style={{ color: "darkorange" }}>{warning}</p> : null}
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
    <form action={handleSubmit}>
      <label>
        Name <input name="name" required />
      </label>{" "}
      <label>
        Tag # <input name="tagNumber" type="number" min={1} required />
      </label>{" "}
      <label>
        Pool{" "}
        <select name="pool" defaultValue="A">
          <option value="A">A</option>
          <option value="B">B</option>
        </select>
      </label>{" "}
      <label>
        Entry date <input name="entryDate" type="datetime-local" required />
      </label>{" "}
      <label>
        PDGA # <input name="pdgaNumber" type="number" />
      </label>{" "}
      <label>
        Rating at entry <input name="ratingAtEntry" type="number" />
      </label>{" "}
      <label>
        <input name="active" type="checkbox" defaultChecked /> Active
      </label>{" "}
      <label>
        <input name="pdgaMembership" type="checkbox" /> PDGA member
      </label>{" "}
      <button type="submit">Add holder</button>
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
          <form action={handleUpdate}>
            <input type="hidden" name="id" value={holder.id} />
            <label>
              Name <input name="name" defaultValue={holder.name} required />
            </label>{" "}
            <label>
              Tag # <input name="tagNumber" type="number" defaultValue={holder.tagNumber} required />
            </label>{" "}
            <label>
              Pool{" "}
              <select name="pool" defaultValue={holder.pool}>
                <option value="A">A</option>
                <option value="B">B</option>
              </select>
            </label>{" "}
            <label>
              Entry date <input name="entryDate" defaultValue={holder.entryDate} required />
            </label>{" "}
            <label>
              PDGA # <input name="pdgaNumber" type="number" defaultValue={holder.pdgaNumber ?? ""} />
            </label>{" "}
            <label>
              Rating{" "}
              <input name="ratingAtEntry" type="number" defaultValue={holder.ratingAtEntry ?? ""} />
            </label>{" "}
            <label>
              <input name="active" type="checkbox" defaultChecked={holder.active} /> Active
            </label>{" "}
            <label>
              <input name="pdgaMembership" type="checkbox" defaultChecked={holder.pdgaMembership} /> PDGA
              member
            </label>{" "}
            <button type="submit">Save</button>{" "}
            <button type="button" onClick={() => setEditing(false)}>
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
      <td>{holder.tagNumber}</td>
      <td>{holder.pool}</td>
      <td>{holder.entryDate}</td>
      <td>{holder.pdgaNumber ?? "—"}</td>
      <td>{holder.ratingAtEntry ?? "—"}</td>
      <td>{holder.active ? "yes" : "no"}</td>
      <td>{holder.pdgaMembership ? "yes" : "no"}</td>
      <td>
        <button type="button" onClick={() => setEditing(true)}>
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
    <form action={handleSubmit}>
      <label>
        Holder{" "}
        <select name="holderId" required>
          {holders.map((h) => (
            <option key={h.id} value={h.id}>
              #{h.tagNumber} {h.name} (Pool {h.pool})
            </option>
          ))}
        </select>
      </label>{" "}
      <label>
        To pool{" "}
        <select name="toPool">
          <option value="A">A</option>
          <option value="B">B</option>
        </select>
      </label>{" "}
      <label>
        Effective date <input name="effectiveDate" type="date" required />
      </label>{" "}
      <button type="submit">Record switch</button>
      <Feedback message={message} />
    </form>
  );
}
