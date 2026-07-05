// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.7.
import "server-only";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "@server/config";
import { pdgaFetch } from "@server/ingestion/pdga/http";

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__/ratings");

const PDGA_MONTH: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

export interface PlayerRating {
  pdgaNumber: number;
  rating: number;
  /** Parsed from the profile page's "(as of DD-Mon-YYYY)" when present. */
  asOfDate?: string;
}

export interface RatingsSource {
  fetchPlayerRating(pdgaNumber: number): Promise<PlayerRating>;
}

export function playerProfileUrl(pdgaNumber: number): string {
  return `https://www.pdga.com/player/${pdgaNumber}`;
}

/** Converts PDGA's `09-Jun-2026` display form to `YYYY-MM-DD`. */
export function parsePdgaDisplayDate(display: string): string {
  const parts = display.split("-");
  if (parts.length !== 3) {
    throw new Error(`Unrecognized PDGA date: ${display}`);
  }
  const [day, mon, year] = parts as [string, string, string];
  const month = PDGA_MONTH[mon];
  if (!month) {
    throw new Error(`Unrecognized PDGA date: ${display}`);
  }
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

/**
 * Parses the current rating from a PDGA player profile HTML page.
 * Expects markup like:
 * `<li class="current-rating"> <strong>Current Rating:</strong> 952 …
 *  <small class="rating-date">(as of 09-Jun-2026)</small> </li>`
 */
export function parsePlayerRatingHtml(html: string, pdgaNumber: number): PlayerRating {
  const ratingMatch = html.match(/<strong>Current Rating:<\/strong>\s*(\d+)/i);
  if (!ratingMatch) {
    throw new Error(`Could not parse current rating for PDGA# ${pdgaNumber}`);
  }

  const rating = Number.parseInt(ratingMatch[1]!, 10);
  const dateMatch = html.match(
    /<small class="rating-date">\(as of (\d{2}-[A-Za-z]{3}-\d{4})\)<\/small>/i,
  );

  return {
    pdgaNumber,
    rating,
    asOfDate: dateMatch ? parsePdgaDisplayDate(dateMatch[1]!) : undefined,
  };
}

export const liveRatingsSource: RatingsSource = {
  async fetchPlayerRating(pdgaNumber: number): Promise<PlayerRating> {
    const url = playerProfileUrl(pdgaNumber);
    const response = await pdgaFetch(url, {
      referer: "https://www.pdga.com/",
      headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    });
    if (!response.ok) {
      throw new Error(`player profile fetch failed: HTTP ${response.status} for PDGA# ${pdgaNumber}`);
    }
    const html = await response.text();
    return parsePlayerRatingHtml(html, pdgaNumber);
  },
};

export const fixtureRatingsSource: RatingsSource = {
  async fetchPlayerRating(pdgaNumber: number): Promise<PlayerRating> {
    const filePath = path.join(FIXTURES_DIR, `player-${pdgaNumber}.html`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing ratings fixture: ${filePath}`);
    }
    const html = fs.readFileSync(filePath, "utf8");
    return parsePlayerRatingHtml(html, pdgaNumber);
  },
};

export const stubRatingsSource: RatingsSource = {
  async fetchPlayerRating(pdgaNumber: number): Promise<PlayerRating> {
    throw new Error(`Ratings fetch unavailable when PDGA_SOURCE=stub (PDGA# ${pdgaNumber})`);
  },
};

/**
 * Factory selecting which ratings fetcher the monthly pull uses.
 * Controlled by `PDGA_SOURCE` (`stub` default | `live` | `fixture`).
 */
export function getRatingsSource(): RatingsSource {
  switch (config.pdgaSource) {
    case "live":
      return liveRatingsSource;
    case "fixture":
      return fixtureRatingsSource;
    default:
      return stubRatingsSource;
  }
}
