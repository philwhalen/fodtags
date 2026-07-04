import { notFound } from "next/navigation";

import { getPublished } from "@server/db/repositories/readModel";
import { formatEt, type StandingRow } from "@/lib";

/**
 * Championship standings — the one public page in the skeleton
 * (plans/scaffold/09-public-and-health.md; specs/04-Feature-Leaderboards.md
 * §4.2/§4.4/§4.5).
 *
 * Reads **only** the published read model via `getPublished` — never the
 * engine, ingestion, or PDGA, and never recomputes on the request path
 * (CLAUDE.md "Public reads never recompute or touch PDGA — `app/(public)`
 * reads only from `readmodel`").
 */

// Always reflect the live read-model pointer; never statically cache this
// page at build time (CLAUDE.md / plans/scaffold/09-public-and-health.md).
export const dynamic = "force-dynamic";

/** Mirrors `StandingsViewPayload` (src/server/readmodel/build.ts) without
 * importing that module — this page's only allowed dependency is the
 * read-model repository. `read_model.payload` is a JSON text column
 * (untyped at the DB layer), so the shape is asserted here at the edge. */
interface StandingsViewPayload {
  rows: StandingRow[];
  updatedAt: string;
}

const VALID_POOLS = new Set(["pool-a", "pool-b"]);

export default async function ChampionshipPage({
  params,
}: {
  params: Promise<{ season: string; pool: string }>;
}) {
  const { season, pool } = await params;

  if (!VALID_POOLS.has(pool)) {
    notFound();
  }

  const seasonYear = Number(season);
  const published = getPublished(seasonYear, `championship/${pool}`);

  if (!published) {
    return (
      <main>
        <h1>FOD Tags — Championship</h1>
        <p>No data yet.</p>
      </main>
    );
  }

  const { rows, updatedAt } = published.payload as StandingsViewPayload;
  const poolLabel = pool === "pool-a" ? "Pool A" : "Pool B";

  return (
    <main>
      <h1>
        {season} Championship — {poolLabel}
      </h1>
      <p>Updated {formatEt(updatedAt)}</p>
      {rows.length === 0 ? (
        <p>No tag holders yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Tag #</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.playerId}>
                <td>{row.rank}</td>
                <td>{row.name}</td>
                <td>{row.tagNumber}</td>
                <td>{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
