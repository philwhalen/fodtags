"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { cancelEventAction, tagNotPresentAction } from "../actions";

export function CancelEventButton({ eventId }: { eventId: number }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setMessage(null);
    try {
      const result = await cancelEventAction(formData);
      setMessage(`Canceled — v${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form action={handleSubmit} style={{ display: "inline" }}>
      <input type="hidden" name="eventId" value={eventId} />
      <button type="submit">Cancel</button>
      {message ? <span> {message}</span> : null}
    </form>
  );
}

export function TagNotPresentButton({ resultId }: { resultId: number }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setMessage(null);
    try {
      const result = await tagNotPresentAction(formData);
      setMessage(`Updated — v${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form action={handleSubmit} style={{ display: "inline" }}>
      <input type="hidden" name="resultId" value={resultId} />
      <button type="submit">Mark tag not present</button>
      {message ? <span> {message}</span> : null}
    </form>
  );
}
