// PURE MODULE — see src/server/engine/index.ts for the purity contract.
// No DB, no clock, no fetch, no Next.js, no `server-only`.
//
// Implements `computeTagTimeline` (Spec 02 §2.10): the nightly tag
// reassignment pre-pass. Tags are physical numbered tags pooled across
// BOTH pools and re-handed-out each League Night by combined-field
// finishing order. This module walks the season's League Nights in order
// and computes each holder's tag-in/tag-out per night, folding in any
// director overrides verbatim. It must run BEFORE `computeSeason`'s
// per-pool ranking (sub-plan 03 wires the two together) — a night's
// League-Night finish tie-break needs THAT night's tag-in, and the
// Podium/Overall/Tournament/OLP tie-breaks (Spec 02 §2.6) need the tag
// as-of a given date, both of which only this pre-pass can produce.
import type {
  SeasonSnapshotEvent,
  SeasonSnapshotHolder,
  SeasonSnapshotTagOverride,
  TagAssignmentRow,
} from "@/lib";
import { tagSortKey } from "@/lib";

/**
 * Normalizes any ISO date or date-time string to its `YYYY-MM-DD`
 * calendar portion, mirroring `season.ts`'s `datePart` (not exported from
 * there, so duplicated here to keep this module import-free of its
 * sibling — see the purity header above).
 */
function datePart(iso: string): string {
  return iso.slice(0, 10);
}

/** Plain, sliced-from-`SeasonSnapshot` input — trivially callable from
 * `computeSeason` (sub-plan 03) as
 * `computeTagTimeline({ holders: snapshot.holders, events: snapshot.events, tagOverrides: snapshot.tagOverrides })`. */
export interface TagTimelineInput {
  holders: Pick<SeasonSnapshotHolder, "id" | "tagNumber">[];
  /** Only non-canceled `LeagueNight` events participate in reassignment;
   * everything else (Tournament, FODOpen, canceled nights) is ignored by
   * this module (Spec 02 §2.10 "the physical mechanic" + "cancelled
   * night" edge case). */
  events: SeasonSnapshotEvent[];
  tagOverrides: SeasonSnapshotTagOverride[];
}

export interface TagTimelineResult {
  /** One row per (holder, League Night) the holder actually received a
   * tag-in/tag-out for — computed participants plus any holder a director
   * override inserted into the sequence (see "who gets a row" below). */
  assignments: TagAssignmentRow[];
  /** The holder's tag-out from the latest night on or before `date`, else
   * their initial tag (Spec 02 §2.10 "tag as of date D"). */
  tagAsOf(holderId: number, date: string): number | null;
  /** Every holder's final tag-out after the last night walked (their
   * "current tag" — Spec 02 §2.10), keyed by holder ID. Holders who never
   * participated keep their initial tag. */
  currentTagByHolder: Map<number, number | null>;
  /** The tag-in a holder held going into a specific night — the League
   * Night finish tie-break input (Spec 02 §2.6). `null` when the holder
   * has no assignment row for that night (absent, tag not present, no
   * initial tag yet, or a canceled/non-League-Night event id). */
  tagInForNight(holderId: number, eventId: number): number | null;
}

interface HolderTimelineEntry {
  eventDate: string;
  tagOut: number;
}

/**
 * Computes the season-wide nightly tag reassignment timeline (Spec 02
 * §2.10). A pure function: the same input always yields the same output,
 * no I/O.
 *
 * **Trust boundary:** `tagOverrides` are applied verbatim — this module
 * does not validate that a night's overrides form a valid permutation of
 * that night's tag-ins (Spec 02 §2.10 "Computed, with override"). That
 * validation is the admin input path's job (sub-plan 05); by the time an
 * override reaches here it is trusted.
 *
 * **Who gets a row:** a night's *computed* participants are results with
 * `holderId != null && tagPresent && currentTag != null` — exactly the
 * combined-field pile described in the spec. A director override for a
 * holder who has a result that night (present in `event.results`, whether
 * or not they were a computed participant) also produces a row and seeds
 * `currentTag`, even if the holder had no prior tag — this is the
 * documented mechanism by which a provisional (initially tagless) holder
 * "enters the sequence" once a director assigns them a tag (Spec 02
 * §2.10 "who is in the pile"), without retroactively touching any earlier
 * night's pile.
 */
export function computeTagTimeline(input: TagTimelineInput): TagTimelineResult {
  const currentTag = new Map<number, number | null>();
  for (const holder of input.holders) currentTag.set(holder.id, holder.tagNumber);

  const nights = input.events
    .filter((e) => e.type === "LeagueNight" && !e.canceled)
    .slice()
    .sort(
      (a, b) =>
        datePart(a.eventDate).localeCompare(datePart(b.eventDate)) ||
        (a.roundOrdinal ?? 0) - (b.roundOrdinal ?? 0) ||
        a.id - b.id,
    );

  const overridesByEvent = new Map<number, Map<number, number>>();
  for (const o of input.tagOverrides) {
    const forEvent = overridesByEvent.get(o.eventId) ?? new Map<number, number>();
    forEvent.set(o.holderId, o.tagOut);
    overridesByEvent.set(o.eventId, forEvent);
  }

  const assignments: TagAssignmentRow[] = [];
  const assignmentIndex = new Map<string, TagAssignmentRow>();
  const timelineByHolder = new Map<number, HolderTimelineEntry[]>();

  const recordAssignment = (
    eventId: number,
    eventDate: string,
    holderId: number,
    tagIn: number | null,
    tagOut: number,
    source: "computed" | "override",
  ) => {
    const row: TagAssignmentRow = { eventId, holderId, tagIn, tagOut, source };
    assignments.push(row);
    assignmentIndex.set(`${holderId}:${eventId}`, row);
    const list = timelineByHolder.get(holderId) ?? [];
    list.push({ eventDate: datePart(eventDate), tagOut });
    timelineByHolder.set(holderId, list);
    currentTag.set(holderId, tagOut);
  };

  for (const night of nights) {
    const overridesForNight = overridesByEvent.get(night.id);

    // Computed combined-field participants: present, tag physically
    // there, and already holding a tag going in.
    const rawParticipants = night.results.filter(
      (r): r is typeof r & { holderId: number } =>
        r.holderId != null && r.tagPresent && currentTag.get(r.holderId) != null,
    );

    // Defensive de-dup by holderId: a holder physically returns AT MOST one
    // tag per night (Spec 02 §2.10 "the physical mechanic"), but the
    // normalized store can legitimately end up with two result rows for
    // the same holder in one event — e.g. the admin review queue's
    // `linkEntrant` (Spec 10 §10.4) back-filling an ambiguous PDGA entrant
    // onto a holder who already has a result that same night. Keep the
    // better (lowest) score per holder so the pile has exactly one entry
    // per physical person, deterministic regardless of row order.
    const bestByHolder = new Map<number, (typeof rawParticipants)[number]>();
    for (const r of rawParticipants) {
      const existing = bestByHolder.get(r.holderId);
      if (existing === undefined || r.rawScoreToPar < existing.rawScoreToPar) {
        bestByHolder.set(r.holderId, r);
      }
    }
    const participants = [...bestByHolder.values()];

    const ranked = participants
      .slice()
      .sort(
        (a, b) =>
          a.rawScoreToPar - b.rawScoreToPar ||
          tagSortKey(currentTag.get(a.holderId) ?? null) -
            tagSortKey(currentTag.get(b.holderId) ?? null) ||
          a.holderId - b.holderId,
      );

    // Pile = the ranked participants' tag-ins, sorted ascending; rank 1
    // (lowest score) takes the lowest tag in the pile, and so on down
    // (Spec 02 §2.10 "the physical mechanic").
    const pile = ranked
      .map((r) => currentTag.get(r.holderId) as number)
      .slice()
      .sort((a, b) => a - b);

    const processed = new Set<number>();
    ranked.forEach((r, index) => {
      const holderId = r.holderId;
      const tagIn = currentTag.get(holderId) as number;
      const override = overridesForNight?.get(holderId);
      // `pile` has exactly one entry per ranked participant (it's built
      // from `ranked` itself), so `pile[index]` is always defined here.
      const computedTagOut = pile[index] as number;
      const tagOut = override ?? computedTagOut;
      const source: "computed" | "override" = override !== undefined ? "override" : "computed";
      recordAssignment(night.id, night.eventDate, holderId, tagIn, tagOut, source);
      processed.add(holderId);
    });

    // Override-only holders: not a computed participant this night (no
    // current tag yet, or tag not present) but physically present in the
    // event's results and given an explicit override — the mechanism by
    // which a director assigns a first tag to a provisional holder, or
    // corrects a non-participant's record.
    if (overridesForNight) {
      const holderIdsWithResults = new Set(
        night.results.map((r) => r.holderId).filter((id): id is number => id != null),
      );
      for (const [holderId, tagOut] of overridesForNight) {
        if (processed.has(holderId)) continue;
        if (!holderIdsWithResults.has(holderId)) continue;
        const tagIn = currentTag.get(holderId) ?? null;
        recordAssignment(night.id, night.eventDate, holderId, tagIn, tagOut, "override");
      }
    }
  }

  const initialTagByHolder = new Map<number, number | null>();
  for (const holder of input.holders) initialTagByHolder.set(holder.id, holder.tagNumber);

  const tagAsOf = (holderId: number, date: string): number | null => {
    const target = datePart(date);
    const list = timelineByHolder.get(holderId);
    let result = initialTagByHolder.get(holderId) ?? null;
    if (!list) return result;
    for (const entry of list) {
      if (entry.eventDate <= target) result = entry.tagOut;
      else break;
    }
    return result;
  };

  const tagInForNight = (holderId: number, eventId: number): number | null => {
    return assignmentIndex.get(`${holderId}:${eventId}`)?.tagIn ?? null;
  };

  return {
    assignments,
    tagAsOf,
    currentTagByHolder: new Map(currentTag),
    tagInForNight,
  };
}
