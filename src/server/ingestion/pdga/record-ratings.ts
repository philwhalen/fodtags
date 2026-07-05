/**
 * Dev-only ratings fixture recorder — re-fetches player profile HTML and
 * writes it to `__fixtures__/ratings/player-{pdga}.html`. Requires network
 * and `PDGA_SOURCE=live`.
 *
 * Usage (from repo root):
 *   set -a; . ./.env; set +a
 *   PDGA_SOURCE=live NODE_OPTIONS=--conditions=react-server npx tsx src/server/ingestion/pdga/record-ratings.ts 211843 125890
 *
 * Do NOT run in CI — committed fixtures are the source of truth for tests.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parsePlayerRatingHtml, playerProfileUrl } from "@server/ingestion/pdga/ratings-source";
import { pdgaFetch } from "@server/ingestion/pdga/http";

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__/ratings");

async function recordPlayer(pdgaNumber: number): Promise<void> {
  const url = playerProfileUrl(pdgaNumber);
  console.log(`[record-ratings] Fetching ${url}…`);
  const response = await pdgaFetch(url, {
    referer: "https://www.pdga.com/",
    headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
  });
  if (!response.ok) {
    throw new Error(`player profile failed: HTTP ${response.status} for PDGA# ${pdgaNumber}`);
  }
  const html = await response.text();
  const parsed = parsePlayerRatingHtml(html, pdgaNumber);
  const outPath = path.join(FIXTURES_DIR, `player-${pdgaNumber}.html`);
  await fs.promises.mkdir(FIXTURES_DIR, { recursive: true });
  await fs.promises.writeFile(outPath, html, "utf8");
  console.log(
    `[record-ratings] Wrote ${outPath} — rating ${parsed.rating}` +
      (parsed.asOfDate ? ` (as of ${parsed.asOfDate})` : ""),
  );
}

const pdgaNumbers = process.argv.slice(2).map((arg) => Number.parseInt(arg, 10));
if (pdgaNumbers.length === 0 || pdgaNumbers.some((n) => Number.isNaN(n))) {
  console.error("Usage: PDGA_SOURCE=live tsx record-ratings.ts <pdgaNumber> [pdgaNumber…]");
  process.exit(1);
}

if (process.env.PDGA_SOURCE !== "live") {
  console.error("[record-ratings] Refusing to run — set PDGA_SOURCE=live");
  process.exit(1);
}

Promise.all(pdgaNumbers.map(recordPlayer)).catch((err: unknown) => {
  console.error("[record-ratings] Failed:", err);
  process.exit(1);
});
