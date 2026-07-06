"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

import { filterRowsByName } from "@/lib";
import type { PlayersIndexRow } from "@/lib";

import { PlayersRosterTable } from "./PlayersRosterTable";

export function FilterablePlayersRoster({
  rows,
  seasonYear,
  initialQuery,
}: {
  rows: PlayersIndexRow[];
  seasonYear: number;
  initialQuery: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputId = useId();
  const filtered = useMemo(
    () => filterRowsByName(rows, query) as PlayersIndexRow[],
    [rows, query],
  );
  const trimmedQuery = query.trim();

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (trimmedQuery) {
        params.set("q", trimmedQuery);
      } else {
        params.delete("q");
      }
      const qs = params.toString();
      router.replace((qs ? `${pathname}?${qs}` : pathname) as Route);
    }, 300);
    return () => clearTimeout(timeout);
  }, [trimmedQuery, pathname, router, searchParams]);

  return (
    <div className="roster-filter">
      <div className="roster-filter-controls">
        <label htmlFor={inputId} className="roster-filter-label">
          Search players
        </label>
        <input
          id={inputId}
          type="search"
          className="roster-filter-input"
          placeholder="Search players"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className="roster-filter-clear"
          onClick={() => setQuery("")}
          disabled={query === ""}
        >
          Clear
        </button>
      </div>

      {filtered.length > 0 ? (
        <PlayersRosterTable rows={filtered} seasonYear={seasonYear} />
      ) : (
        <p className="roster-filter-no-match" role="status">
          No players match &ldquo;{trimmedQuery}&rdquo;
        </p>
      )}
    </div>
  );
}
