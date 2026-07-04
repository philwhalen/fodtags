"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { markCompleteAction, registerSourceAction, updateSourceAction } from "../actions";

type Source = {
  id: number;
  type: string;
  label: string;
  pdgaEventId: string;
  startDate: string | null;
  endDate: string | null;
  complete: boolean;
  active: boolean;
  divisions: unknown;
};

function divisionsString(divisions: unknown): string {
  return Array.isArray(divisions) ? divisions.join(", ") : "";
}

export function RegisterSourceForm() {
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
    <form action={handleSubmit}>
      <label>
        Type{" "}
        <select name="type" defaultValue="TOURNAMENT">
          <option value="EARLY">EARLY</option>
          <option value="MID">MID</option>
          <option value="LATE">LATE</option>
          <option value="TOURNAMENT">TOURNAMENT</option>
          <option value="FOD_OPEN">FOD_OPEN</option>
        </select>
      </label>{" "}
      <label>
        Label <input name="label" required />
      </label>{" "}
      <label>
        PDGA event ID <input name="pdgaEventId" required />
      </label>{" "}
      <label>
        Start date <input name="startDate" type="date" />
      </label>{" "}
      <label>
        End date <input name="endDate" type="date" />
      </label>{" "}
      <label>
        Divisions <input name="divisions" placeholder="MPO, MA1" />
      </label>{" "}
      <label>
        <input name="active" type="checkbox" defaultChecked /> Active
      </label>{" "}
      <button type="submit">Register</button>
      {message ? <p>{message}</p> : null}
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

  if (editing) {
    return (
      <tr>
        <td colSpan={9}>
          <form action={handleUpdate}>
            <input type="hidden" name="id" value={source.id} />
            <label>
              Label <input name="label" defaultValue={source.label} required />
            </label>{" "}
            <label>
              PDGA event ID <input name="pdgaEventId" defaultValue={source.pdgaEventId} required />
            </label>{" "}
            <label>
              Start <input name="startDate" type="date" defaultValue={source.startDate ?? ""} />
            </label>{" "}
            <label>
              End <input name="endDate" type="date" defaultValue={source.endDate ?? ""} />
            </label>{" "}
            <label>
              Divisions{" "}
              <input name="divisions" defaultValue={divisionsString(source.divisions)} />
            </label>{" "}
            <label>
              <input name="active" type="checkbox" defaultChecked={source.active} /> Active
            </label>{" "}
            <button type="submit">Save</button>{" "}
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </form>
          {message ? <p>{message}</p> : null}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{source.id}</td>
      <td>{source.type}</td>
      <td>{source.label}</td>
      <td>{source.pdgaEventId}</td>
      <td>{source.startDate ?? "—"}</td>
      <td>{source.endDate ?? "—"}</td>
      <td>{source.complete ? "yes" : "no"}</td>
      <td>{source.active ? "yes" : "no"}</td>
      <td>
        <button type="button" onClick={() => setEditing(true)}>
          Edit
        </button>{" "}
        {isSubLeague && !source.complete ? (
          <form action={handleMarkComplete} style={{ display: "inline" }}>
            <input type="hidden" name="id" value={source.id} />
            <button type="submit">Mark complete</button>
          </form>
        ) : null}
        {message ? <p>{message}</p> : null}
      </td>
    </tr>
  );
}
