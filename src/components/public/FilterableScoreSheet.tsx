"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

import { filterScoreSheetHolders } from "@/lib";
import type { ScoreSheetProjection } from "@/lib";

import { ScoreSheetTable } from "./ScoreSheetTable";

/**
 * Client-side name filter over an already-projected `score-sheet/pool-*`
 * view (Spec 07 §7.5), mirroring `FilterableRoster`'s `?q=` URL-sync
 * behavior. `filterScoreSheetHolders` only accepts the flat
 * `PublicScoreSheetHolder[]` shape (chunk 01), so the query is matched
 * against `view.holders[i].holder` and the result narrows the original
 * `ScoreSheetHolderView[]` by holder id — never re-projecting, re-ranking,
 * or touching each holder's already-computed groups.
 */
export function FilterableScoreSheet({
  view,
  seasonYear,
  initialQuery,
}: {
  view: ScoreSheetProjection;
  seasonYear: number;
  initialQuery: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputId = useId();

  const filteredHolders = useMemo(() => {
    const matchedIds = new Set(
      filterScoreSheetHolders(
        view.holders.map((holderView) => holderView.holder),
        query,
      ).map((holder) => holder.holderId),
    );
    return view.holders.filter((holderView) => matchedIds.has(holderView.holder.holderId));
  }, [view.holders, query]);

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

      {filteredHolders.length > 0 ? (
        <ScoreSheetTable view={{ ...view, holders: filteredHolders }} seasonYear={seasonYear} />
      ) : (
        <p className="standings-filter-no-match" role="status">
          No players match &ldquo;{trimmedQuery}&rdquo;
        </p>
      )}
    </div>
  );
}
