"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatTagNumber } from "@/lib";

import {
  confirmHolderAction,
  createHolderForEntrantAction,
  linkEntrantAction,
  markNonHolderAction,
  mergeProvisionalIntoHolderAction,
} from "../actions";

type SuggestedHolder = {
  id: number;
  name: string;
  tagNumber: number | null;
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
  tagNumber: number | null;
  pool: "A" | "B";
};

type ProvisionalHolder = {
  id: number;
  name: string;
  pdgaNumber: number | null;
  entryDate: string;
  ratingAtEntry: number | null;
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
      : entry.suggestedHolders
          .map((h) => `#${formatTagNumber(h.tagNumber)} ${h.name}`)
          .join(", ");

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
                    #{formatTagNumber(h.tagNumber)} {h.name} (Pool {h.pool})
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

/**
 * A single auto-added provisional holder awaiting a director's confirm /
 * merge / exclude decision (Spec 10 §10.4 section A). Shows the
 * scrape-seeded summary (name, PDGA #, entry date, seeded rating, PDGA
 * membership, round count so far) plus the three resolution actions.
 */
export function ProvisionalHolderRow({
  holder,
  roundCount,
  targetHolders,
}: {
  holder: ProvisionalHolder;
  roundCount: number;
  /** Active, confirmed holders eligible as a merge target. */
  targetHolders: Holder[];
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [confirmWarning, setConfirmWarning] = useState<string | undefined>();
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeMessage, setMergeMessage] = useState<string | null>(null);
  const [excludeMessage, setExcludeMessage] = useState<string | null>(null);

  async function handleConfirm(formData: FormData) {
    setConfirmMessage(null);
    setConfirmWarning(undefined);
    try {
      const result = await confirmHolderAction(formData);
      setConfirmMessage(`Confirmed — published version ${result.publishedVersion}`);
      setConfirmWarning(result.warning);
      setConfirmOpen(false);
      router.refresh();
    } catch (err) {
      setConfirmMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleMerge(formData: FormData) {
    setMergeMessage(null);
    try {
      const result = await mergeProvisionalIntoHolderAction(formData);
      setMergeMessage(`Merged — published version ${result.publishedVersion}`);
      setMergeOpen(false);
      router.refresh();
    } catch (err) {
      setMergeMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleExclude(formData: FormData) {
    setExcludeMessage(null);
    try {
      const result = await markNonHolderAction(formData);
      setExcludeMessage(`Marked non-holder — version ${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setExcludeMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <tr>
      <td>{holder.name}</td>
      <td className="admin-num">{holder.pdgaNumber ?? "—"}</td>
      <td>{holder.entryDate}</td>
      <td className="admin-num">{holder.ratingAtEntry ?? "—"}</td>
      <td>
        <span className="admin-status" data-status={holder.pdgaMembership ? "yes" : "no"}>
          {holder.pdgaMembership ? "yes" : "no"}
        </span>
      </td>
      <td className="admin-num">{roundCount}</td>
      <td>
        <div className="admin-actions">
          <button
            type="button"
            className="admin-button admin-button--primary"
            onClick={() => {
              setConfirmOpen((v) => !v);
              setMergeOpen(false);
            }}
          >
            {confirmOpen ? "Cancel confirm" : "Confirm"}
          </button>
          <button
            type="button"
            className="admin-button"
            onClick={() => {
              setMergeOpen((v) => !v);
              setConfirmOpen(false);
            }}
          >
            {mergeOpen ? "Cancel merge" : "Merge into existing holder"}
          </button>
          <form action={handleExclude} className="admin-form--inline">
            <input type="hidden" name="pdgaNumber" value={holder.pdgaNumber ?? ""} />
            <button type="submit" className="admin-button admin-button--danger">
              Exclude (non-holder)
            </button>
          </form>
        </div>
        <Feedback message={confirmMessage} warning={confirmWarning} />
        <Feedback message={mergeMessage} />
        <Feedback message={excludeMessage} />
        {confirmOpen ? (
          <form action={handleConfirm} className="admin-form">
            <input type="hidden" name="id" value={holder.id} />
            <label className="admin-field">
              Pool{" "}
              <select name="pool" defaultValue="A" className="admin-select">
                <option value="A">A</option>
                <option value="B">B</option>
              </select>
            </label>
            <label className="admin-field">
              Tag # (optional)
              <input name="tagNumber" type="number" min={1} className="admin-input" />
            </label>
            <label className="admin-field">
              Name <input name="name" defaultValue={holder.name} required className="admin-input" />
            </label>
            <label className="admin-field">
              Entry date{" "}
              <input name="entryDate" defaultValue={holder.entryDate} required className="admin-input" />
            </label>
            <label className="admin-field">
              Rating at entry{" "}
              <input
                name="ratingAtEntry"
                type="number"
                defaultValue={holder.ratingAtEntry ?? ""}
                className="admin-input"
              />
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
              Confirm
            </button>
          </form>
        ) : null}
        {mergeOpen ? (
          <form action={handleMerge} className="admin-form">
            <input type="hidden" name="provisionalId" value={holder.id} />
            <label className="admin-field">
              Merge into{" "}
              <select name="targetHolderId" required defaultValue="" className="admin-select">
                <option value="" disabled>
                  Select holder…
                </option>
                {targetHolders.map((h) => (
                  <option key={h.id} value={h.id}>
                    #{formatTagNumber(h.tagNumber)} {h.name} (Pool {h.pool})
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="admin-button admin-button--primary">
              Merge
            </button>
          </form>
        ) : null}
      </td>
    </tr>
  );
}
