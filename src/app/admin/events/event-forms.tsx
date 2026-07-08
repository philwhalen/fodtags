"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { markCompleteAction, registerSourceAction, setSourceStaleAction, updateSourceAction } from "../actions";

type Source = {
  id: number;
  type: string;
  label: string;
  pdgaEventId: string;
  startDate: string | null;
  endDate: string | null;
  complete: boolean;
  active: boolean;
  stale: boolean;
  lastGoodAt: string | null;
  divisions: unknown;
};

function divisionsString(divisions: unknown): string {
  return Array.isArray(divisions) ? divisions.join(", ") : "";
}

export function RegisterSourceForm({ defaultType }: { defaultType: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setMessage(null);
    try {
      const result = await registerSourceAction(formData);
      setMessage(`Registered — version ${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form action={handleSubmit} className="admin-form">
      <label className="admin-field">
        Type
        <select name="type" defaultValue={defaultType} className="admin-select">
          <option value="EARLY">EARLY</option>
          <option value="MID">MID</option>
          <option value="LATE">LATE</option>
          <option value="TOURNAMENT">TOURNAMENT</option>
          <option value="FOD_OPEN">FOD_OPEN</option>
        </select>
      </label>
      <label className="admin-field">
        Label <input name="label" required className="admin-input" />
      </label>
      <label className="admin-field">
        PDGA event ID <input name="pdgaEventId" required className="admin-input" />
      </label>
      <label className="admin-field">
        Start date <input name="startDate" type="date" className="admin-input" />
      </label>
      <label className="admin-field">
        End date <input name="endDate" type="date" className="admin-input" />
      </label>
      <label className="admin-field">
        Divisions <input name="divisions" placeholder="MPO, MA1" className="admin-input" />
      </label>
      <label className="admin-field admin-field--check">
        <input name="active" type="checkbox" defaultChecked className="admin-checkbox" /> Active
      </label>
      <button type="submit" className="admin-button admin-button--primary">
        Register
      </button>
      {message ? <p className="admin-feedback admin-feedback--success">{message}</p> : null}
    </form>
  );
}

export function SourceRow({ source }: { source: Source }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isSubLeague = source.type === "EARLY" || source.type === "MID" || source.type === "LATE";

  async function handleUpdate(formData: FormData) {
    setMessage(null);
    try {
      const result = await updateSourceAction(formData);
      setMessage(`Saved — version ${result.publishedVersion}`);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleMarkComplete(formData: FormData) {
    setMessage(null);
    try {
      const result = await markCompleteAction(formData);
      setMessage(`Marked complete — version ${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleMarkStale(formData: FormData) {
    setMessage(null);
    try {
      const result = await setSourceStaleAction(formData);
      setMessage(`Marked stale — version ${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleClearStale(formData: FormData) {
    setMessage(null);
    try {
      const result = await setSourceStaleAction(formData);
      setMessage(`Cleared stale — version ${result.publishedVersion}`);
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
            <input type="hidden" name="id" value={source.id} />
            <label className="admin-field">
              Label <input name="label" defaultValue={source.label} required className="admin-input" />
            </label>
            <label className="admin-field">
              PDGA event ID{" "}
              <input name="pdgaEventId" defaultValue={source.pdgaEventId} required className="admin-input" />
            </label>
            <label className="admin-field">
              Start <input name="startDate" type="date" defaultValue={source.startDate ?? ""} className="admin-input" />
            </label>
            <label className="admin-field">
              End <input name="endDate" type="date" defaultValue={source.endDate ?? ""} className="admin-input" />
            </label>
            <label className="admin-field">
              Divisions{" "}
              <input name="divisions" defaultValue={divisionsString(source.divisions)} className="admin-input" />
            </label>
            <label className="admin-field admin-field--check">
              <input name="active" type="checkbox" defaultChecked={source.active} className="admin-checkbox" /> Active
            </label>
            <button type="submit" className="admin-button admin-button--primary">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="admin-button">
              Cancel
            </button>
          </form>
          {message ? <p className="admin-feedback admin-feedback--success">{message}</p> : null}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="admin-num">{source.id}</td>
      <td>{source.type}</td>
      <td>{source.label}</td>
      <td>{source.pdgaEventId}</td>
      <td>{source.startDate ?? "—"}</td>
      <td>{source.endDate ?? "—"}</td>
      <td>
        <span className="admin-status" data-status={source.complete ? "yes" : "no"}>
          {source.complete ? "yes" : "no"}
        </span>
      </td>
      <td>
        <span className="admin-status" data-status={source.active ? "yes" : "no"}>
          {source.active ? "yes" : "no"}
        </span>
      </td>
      <td>
        {source.stale ? (
          <span
            className="admin-status"
            data-status="stale"
            title={source.lastGoodAt ? `Last good: ${source.lastGoodAt}` : undefined}
          >
            stale
          </span>
        ) : (
          <span className="admin-status" data-status="fresh">
            fresh
          </span>
        )}
      </td>
      <td>
        <div className="admin-actions">
          <button type="button" onClick={() => setEditing(true)} className="admin-button">
            Edit
          </button>
          {source.stale ? (
            <form action={handleClearStale} className="admin-form--inline">
              <input type="hidden" name="id" value={source.id} />
              <input type="hidden" name="stale" value="false" />
              <button type="submit" className="admin-button">
                Clear stale
              </button>
            </form>
          ) : (
            <form action={handleMarkStale} className="admin-form--inline">
              <input type="hidden" name="id" value={source.id} />
              <input type="hidden" name="stale" value="true" />
              <button type="submit" className="admin-button">
                Mark stale
              </button>
            </form>
          )}
          {isSubLeague && !source.complete ? (
            <form action={handleMarkComplete} className="admin-form--inline">
              <input type="hidden" name="id" value={source.id} />
              <button type="submit" className="admin-button">
                Mark complete
              </button>
            </form>
          ) : null}
        </div>
        {message ? <p className="admin-feedback admin-feedback--success">{message}</p> : null}
      </td>
    </tr>
  );
}
