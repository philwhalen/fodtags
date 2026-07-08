import { formatTagNumber } from "@/lib";
import type { PublicRoundsPayload, RoundRow } from "@/lib";
import { SEASON_YEAR } from "@server/admin/context";
import { listEvents } from "@server/db/repositories/events";
import { listResultsByEvent } from "@server/db/repositories/eventResults";
import { getPublished } from "@server/db/repositories/readModel";
import { listHolders } from "@server/db/repositories/tagHolders";
import { listOverridesBySeason } from "@server/db/repositories/tagOverrides";

import { TagNightForm } from "./tag-forms";

export const dynamic = "force-dynamic";

interface NightRow {
  holderId: number;
  name: string;
  tagIn: number | null;
  tagOut: number | null;
  /** Whether the engine put this holder in the combined-field pile this
   * night — false for absent / tag-not-present holders, who are listed as
   * unchanged (Spec 10 §10.9). */
  inPile: boolean;
  badge: "computed" | "override" | "unchanged";
  scoreToPar: number;
  finish: number | null;
}

export default async function AdminTagsPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string }>;
}) {
  const { eventId: eventIdRaw } = await searchParams;

  const nights = listEvents(SEASON_YEAR)
    .filter((e) => e.type === "LeagueNight")
    .slice()
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate) || b.id - a.id);

  const selected = eventIdRaw
    ? nights.find((n) => String(n.id) === eventIdRaw)
    : nights[0];

  return (
    <>
      <h1 className="admin-page-title">Tags</h1>
      <p className="admin-page-intro">
        Nightly tag reassignment (Spec 02 §2.10): every League Night, tags return to a single
        combined-field pile and are handed back out lowest-score-takes-lowest-tag. The engine
        computes the handout below by default — record an override here when a night played out
        differently (including seeding the real historical tag-to-holder record).
      </p>

      <form method="get" className="admin-toolbar">
        <label className="admin-field">
          League Night{" "}
          <select name="eventId" defaultValue={selected?.id} className="admin-select">
            {nights.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label} — {n.eventDate}
                {n.canceled ? " (canceled)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="admin-button">
          View
        </button>
      </form>

      {!selected ? (
        <p className="admin-empty">No League Nights on the schedule yet.</p>
      ) : selected.canceled ? (
        <p className="admin-empty">
          {selected.label} is canceled — no reassignment occurs on a canceled night, so there is
          nothing to review or override here.
        </p>
      ) : (
        <TagNight seasonYear={SEASON_YEAR} eventId={selected.id} />
      )}
    </>
  );
}

function TagNight({ seasonYear, eventId }: { seasonYear: number; eventId: number }) {
  const entrants = listResultsByEvent(eventId).filter((r) => r.holderId !== null);
  const holderName = new Map(listHolders(seasonYear).map((h) => [h.id, h.name]));
  const overridesForNight = new Set(
    listOverridesBySeason(seasonYear)
      .filter((o) => o.eventId === eventId)
      .map((o) => o.holderId),
  );

  const roundsPayload = getPublished(seasonYear, "rounds")?.payload as
    | PublicRoundsPayload
    | undefined;
  const roundByHolder = new Map<number, RoundRow>();
  if (roundsPayload) {
    for (const holder of roundsPayload.holders) {
      const round = holder.rounds.find((r) => r.eventId === eventId);
      if (round) {
        roundByHolder.set(holder.holderId, round);
      }
    }
  }

  const rows: NightRow[] = entrants.map((result) => {
    const holderId = result.holderId!;
    const round = roundByHolder.get(holderId);
    const inPile = round?.tagIn != null && round?.tagOut != null;
    const badge: NightRow["badge"] = !inPile
      ? "unchanged"
      : overridesForNight.has(holderId)
        ? "override"
        : "computed";
    return {
      holderId,
      name: holderName.get(holderId) ?? result.displayName,
      tagIn: round?.tagIn ?? null,
      tagOut: round?.tagOut ?? null,
      inPile,
      badge,
      scoreToPar: result.rawScoreToPar,
      finish: null,
    };
  });

  // Combined-field finish (Spec 02 §2.10): rank the pile by raw score,
  // tie-broken by tag-in — display only, mirroring the engine's own
  // reassignment order over already-resolved published values (not a
  // re-implementation of the reassignment itself).
  const piled = rows
    .filter((r) => r.inPile)
    .slice()
    .sort(
      (a, b) =>
        a.scoreToPar - b.scoreToPar || (a.tagIn ?? 0) - (b.tagIn ?? 0) || a.holderId - b.holderId,
    );
  piled.forEach((r, i) => {
    r.finish = i + 1;
  });
  const unchanged = rows
    .filter((r) => !r.inPile)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const displayRows = [...piled, ...unchanged];

  const participants = piled.map((r) => ({
    holderId: r.holderId,
    name: r.name,
    tagIn: r.tagIn as number,
    tagOut: r.tagOut as number,
  }));

  return (
    <>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Finish</th>
              <th>Holder</th>
              <th>Tag-in → tag-out</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => (
              <tr key={row.holderId}>
                <td className="admin-num">{row.finish ?? "—"}</td>
                <td>{row.name}</td>
                <td className="admin-num">
                  {row.inPile
                    ? `${formatTagNumber(row.tagIn)} → ${formatTagNumber(row.tagOut)}`
                    : "unchanged"}
                </td>
                <td>
                  <span className="admin-status" data-status={row.badge === "override" ? "yes" : "no"}>
                    {row.badge}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="admin-section">
        <h2 className="admin-section-heading">Record override</h2>
        <TagNightForm eventId={eventId} participants={participants} />
      </section>
    </>
  );
}
