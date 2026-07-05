"use client";

import { useId, useMemo, useState } from "react";

import { filterRowsByName } from "@/lib";
import type { PublicStandingsRow } from "@/lib/standings-view";

import { StandingsTable } from "./StandingsTable";

/**
 * Client-side name filter over a standings table (Spec 04 §4.7). Holds the
 * query as local state and filters via the pure `filterRowsByName` helper —
 * purely client-side (no refetch, no router navigation). Filtering never
 * re-ranks: rows keep the rank/points from the full-pool `rows` prop.
 */
export function FilterableStandings({
  rows,
  seasonYear,
}: {
  rows: PublicStandingsRow[];
  seasonYear: number;
}) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const filtered = useMemo(() => filterRowsByName(rows, query), [rows, query]);
  const trimmedQuery = query.trim();

  return (
    <div className="standings-filter">
      <div className="standings-filter-controls">
        <label htmlFor={inputId} className="standings-filter-label">
          Search players
        </label>
        <input
          id={inputId}
          type="search"
          className="standings-filter-input"
          placeholder="Search players"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className="standings-filter-clear"
          onClick={() => setQuery("")}
          disabled={query === ""}
        >
          Clear
        </button>
      </div>

      {filtered.length > 0 ? (
        <StandingsTable rows={filtered} seasonYear={seasonYear} />
      ) : (
        <p className="standings-filter-no-match" role="status">
          No players match &ldquo;{trimmedQuery}&rdquo;
        </p>
      )}
    </div>
  );
}
