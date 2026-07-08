"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatTagNumber } from "@/lib";

import { setTagNightOverridesAction } from "../actions";

interface Participant {
  holderId: number;
  name: string;
  tagIn: number;
  tagOut: number;
}

/**
 * A director's override editor for one League Night's combined-field tag
 * handout (Spec 02 §2.10, Spec 10 §10.9). Prefilled with the currently
 * resolved tag-out (computed, or a prior override) for every pile
 * participant; submits the full night mapping in one action, which the
 * mutation validates as a permutation of the night's tag-ins before
 * writing anything.
 */
export function TagNightForm({ eventId, participants }: { eventId: number; participants: Participant[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setMessage(null);
    try {
      const result = await setTagNightOverridesAction(formData);
      setMessage(`Saved — published version ${result.publishedVersion}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  if (participants.length === 0) {
    return <p className="admin-empty">No tagged participants this night — nothing to override.</p>;
  }

  return (
    <form action={handleSubmit} className="admin-form">
      <input type="hidden" name="eventId" value={eventId} />
      {participants.map((p) => (
        <label key={p.holderId} className="admin-field">
          {p.name} (tag {formatTagNumber(p.tagIn)} in){" "}
          <input
            name={`tagOut-${p.holderId}`}
            type="number"
            min={1}
            defaultValue={p.tagOut}
            required
            className="admin-input admin-input--narrow"
          />
        </label>
      ))}
      <button type="submit" className="admin-button admin-button--primary">
        Save night&apos;s tag-outs
      </button>
      {message ? <span className="admin-feedback-inline">{message}</span> : null}
    </form>
  );
}
