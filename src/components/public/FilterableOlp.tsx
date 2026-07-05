"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

import { filterRowsByName, projectOlp } from "@/lib";
import type { PublicOlpPayload } from "@/lib";

import { OlpTable } from "./OlpTable";

/**
 * Client-side name filter over an `olp/<sub-league>` payload (Spec 06
 * §6.6), mirroring `FilterableRoster`'s `?q=` URL-sync behavior. Projects
 * the payload once via `projectOlp`, then narrows **both** the ranked and
 * not-eligible rows by the query — never re-ranking, so a filtered player
 * keeps their true rank, score, and payout. A shared "no match" message
 * covers the case where the query matches neither section.
 */
export function FilterableOlp({
  payload,
  seasonYear,
  initialQuery,
}: {
  payload: PublicOlpPayload;
  seasonYear: number;
  initialQuery: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputId = useId();

  const projection = useMemo(() => projectOlp(payload), [payload]);
  const filteredRanked = useMemo(
    () => filterRowsByName(projection.ranked, query),
    [projection.ranked, query],
  );
  const filteredNotEligible = useMemo(
    () => filterRowsByName(projection.notEligible, query),
    [projection.notEligible, query],
  );
  const trimmedQuery = query.trim();
  const noMatch =
    trimmedQuery !== "" && filteredRanked.length === 0 && filteredNotEligible.length === 0;

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

      {noMatch ? (
        <p className="standings-filter-no-match" role="status">
          No players match &ldquo;{trimmedQuery}&rdquo;
        </p>
      ) : (
        <OlpTable
          ranked={filteredRanked}
          notEligible={filteredNotEligible}
          projected={projection.projected}
          seasonYear={seasonYear}
        />
      )}
    </div>
  );
}
