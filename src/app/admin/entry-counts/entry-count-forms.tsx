"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { setAceCountAction, setEntryCountAction } from "../actions";

export function AceCountForm({ eventId, current }: { eventId: number; current: number }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setMessage(null);
    try {
      const result = await setAceCountAction(formData);
      setMessage(`v${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form action={handleSubmit} className="admin-form--inline">
      <input type="hidden" name="eventId" value={eventId} />
      <input
        name="aceEntries"
        type="number"
        min={0}
        defaultValue={current}
        className="admin-input admin-input--narrow"
      />
      <button type="submit" className="admin-button admin-button--primary">
        Save
      </button>
      {message ? <span className="admin-feedback-inline">{message}</span> : null}
    </form>
  );
}

export function EntryCountForm({ eventId, current }: { eventId: number; current: number }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setMessage(null);
    try {
      const result = await setEntryCountAction(formData);
      setMessage(`v${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form action={handleSubmit} className="admin-form--inline">
      <input type="hidden" name="eventId" value={eventId} />
      <input
        name="paidEntries"
        type="number"
        min={0}
        defaultValue={current}
        className="admin-input admin-input--narrow"
      />
      <button type="submit" className="admin-button admin-button--primary">
        Save
      </button>
      {message ? <span className="admin-feedback-inline">{message}</span> : null}
    </form>
  );
}
