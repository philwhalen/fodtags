"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

import { filterRosterByName } from "@/lib";
import type { RosterRow, RoundsFilter } from "@/lib";

import { RoundsRosterTable } from "./RoundsRosterTable";

export function FilterableRoster({
  rows,
  seasonYear,
  filter,
  initialQuery,
}: {
  rows: RosterRow[];
  seasonYear: number;
  filter: RoundsFilter;
  initialQuery: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputId = useId();
  const filtered = useMemo(() => filterRosterByName(rows, query), [rows, query]);
  const trimmedQuery = query.trim();
  // Depend on the string *value*, not the `useSearchParams()` object: each
  // `router.replace` hands back a fresh object reference, so keeping the object
  // in the deps would re-fire this effect in a ~300ms loop.
  const searchParamsString = searchParams.toString();

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParamsString);
      if (trimmedQuery) {
        params.set("q", trimmedQuery);
      } else {
        params.delete("q");
      }
      const qs = params.toString();
      // `scroll: false` — this is a URL sync, not navigation; it must never
      // yank the viewport back to the top (breaks in-page hash anchors).
      router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false });
    }, 300);
    return () => clearTimeout(timeout);
  }, [trimmedQuery, pathname, router, searchParamsString]);

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
        <RoundsRosterTable rows={filtered} seasonYear={seasonYear} filter={filter} />
      ) : (
        <p className="roster-filter-no-match" role="status">
          No players match &ldquo;{trimmedQuery}&rdquo;
        </p>
      )}
    </div>
  );
}
