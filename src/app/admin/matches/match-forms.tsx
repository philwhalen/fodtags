"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  createHolderForEntrantAction,
  linkEntrantAction,
  markNonHolderAction,
} from "../actions";

type SuggestedHolder = {
  id: number;
  name: string;
  tagNumber: number;
};

type PendingEntry = {
  pdgaNumber: number;
  displayName: string;
  appearanceCount: number;
  suggestedHolders: SuggestedHolder[];
};

type Holder = {
  id: number;
  name: string;
  tagNumber: number;
  pool: "A" | "B";
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

export function PendingEntrantRow({
  entry,
  holders,
}: {
  entry: PendingEntry;
  holders: Holder[];
}) {
  const router = useRouter();
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [createWarning, setCreateWarning] = useState<string | undefined>();
  const [nonHolderMessage, setNonHolderMessage] = useState<string | null>(null);

  async function handleLink(formData: FormData) {
    setLinkMessage(null);
    try {
      const result = await linkEntrantAction(formData);
      setLinkMessage(`Linked — published version ${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setLinkMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCreate(formData: FormData) {
    setCreateMessage(null);
    setCreateWarning(undefined);
    try {
      const result = await createHolderForEntrantAction(formData);
      setCreateMessage(`Created and linked — version ${result.publishedVersion}`);
      setCreateWarning(result.warning);
      setCreateOpen(false);
      router.refresh();
    } catch (err) {
      setCreateMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleNonHolder(formData: FormData) {
    setNonHolderMessage(null);
    try {
      const result = await markNonHolderAction(formData);
      setNonHolderMessage(`Marked non-holder — version ${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setNonHolderMessage(err instanceof Error ? err.message : String(err));
    }
  }

  const suggestionText =
    entry.suggestedHolders.length === 0
      ? "—"
      : entry.suggestedHolders.map((h) => `#${h.tagNumber} ${h.name}`).join(", ");

  return (
    <tr>
      <td className="admin-num">{entry.pdgaNumber}</td>
      <td>{entry.displayName}</td>
      <td className="admin-num">{entry.appearanceCount}</td>
      <td>{suggestionText}</td>
      <td>
        <div className="admin-actions">
          <form action={handleLink} className="admin-form--inline">
            <input type="hidden" name="pdgaNumber" value={entry.pdgaNumber} />
            <label className="admin-field">
              Link to{" "}
              <select
                name="holderId"
                required
                defaultValue={entry.suggestedHolders[0]?.id ?? ""}
                className="admin-select"
              >
                <option value="" disabled>
                  Select holder…
                </option>
                {holders.map((h) => (
                  <option key={h.id} value={h.id}>
                    #{h.tagNumber} {h.name} (Pool {h.pool})
                  </option>
                ))}
              </select>
            </label>{" "}
            <button type="submit" className="admin-button admin-button--primary">
              Link
            </button>
          </form>
          <button
            type="button"
            className="admin-button"
            onClick={() => setCreateOpen((v) => !v)}
          >
            {createOpen ? "Cancel create" : "Create holder"}
          </button>
          <form action={handleNonHolder} className="admin-form--inline">
            <input type="hidden" name="pdgaNumber" value={entry.pdgaNumber} />
            <button type="submit" className="admin-button admin-button--danger">
              Mark non-holder
            </button>
          </form>
        </div>
        <Feedback message={linkMessage} />
        <Feedback message={nonHolderMessage} />
        {createOpen ? (
          <form action={handleCreate} className="admin-form">
            <input type="hidden" name="pdgaNumber" value={entry.pdgaNumber} />
            <label className="admin-field">
              Name <input name="name" defaultValue={entry.displayName} required className="admin-input" />
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
              Rating at entry <input name="ratingAtEntry" type="number" className="admin-input" />
            </label>
            <label className="admin-field admin-field--check">
              <input name="active" type="checkbox" defaultChecked className="admin-checkbox" /> Active
            </label>
            <label className="admin-field admin-field--check">
              <input name="pdgaMembership" type="checkbox" defaultChecked className="admin-checkbox" /> PDGA member
            </label>
            <button type="submit" className="admin-button admin-button--primary">
              Create &amp; link
            </button>
            <Feedback message={createMessage} warning={createWarning} />
          </form>
        ) : null}
      </td>
    </tr>
  );
}
