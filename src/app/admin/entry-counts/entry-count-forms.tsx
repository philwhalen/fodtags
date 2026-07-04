"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { setEntryCountAction } from "../actions";

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
    <form action={handleSubmit} style={{ display: "inline" }}>
      <input type="hidden" name="eventId" value={eventId} />
      <input name="paidEntries" type="number" min={0} defaultValue={current} style={{ width: "4rem" }} />
      <button type="submit">Save</button>
      {message ? <span> {message}</span> : null}
    </form>
  );
}
