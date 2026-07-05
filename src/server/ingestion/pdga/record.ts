/**
 * Dev-only fixture recorder — re-fetches live-api responses and writes them
 * to `__fixtures__/{eventId}/`. Requires network and `PDGA_SOURCE=live`.
 *
 * Usage (from repo root):
 *   set -a; . ./.env; set +a
 *   PDGA_SOURCE=live NODE_OPTIONS=--conditions=react-server npx tsx src/server/ingestion/pdga/record.ts 104527
 *
 * Do NOT run in CI — committed fixtures are the source of truth for tests.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { eventUrl, refererForEvent, roundUrl } from "@server/ingestion/pdga/live-source";
import { pdgaFetch } from "@server/ingestion/pdga/http";
import type { LiveApiEnvelope, LiveApiEventBody } from "@server/ingestion/pdga/source";

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__");

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, `${JSON.stringify(data, null, 4)}\n`, "utf8");
}

async function recordEvent(eventId: string): Promise<void> {
  if (process.env.PDGA_SOURCE !== "live") {
    console.error("[record] Refusing to run — set PDGA_SOURCE=live");
    process.exit(1);
  }

  const outDir = path.join(FIXTURES_DIR, eventId);
  const referer = refererForEvent(eventId);

  console.log(`[record] Fetching event ${eventId}…`);
  const eventResponse = await pdgaFetch(eventUrl(eventId), { referer });
  if (!eventResponse.ok) {
    throw new Error(`fetch_event failed: HTTP ${eventResponse.status}`);
  }
  const eventEnvelope = (await eventResponse.json()) as LiveApiEnvelope<LiveApiEventBody>;
  await writeJson(path.join(outDir, "event.json"), eventEnvelope);

  const { HighestCompletedRound, Divisions } = eventEnvelope.data;
  console.log(`[record] ${Divisions.length} division(s), rounds 1–${HighestCompletedRound}`);

  for (const division of Divisions) {
    for (let round = 1; round <= HighestCompletedRound; round++) {
      console.log(`[record] Fetching ${division.Division} round ${round}…`);
      const roundResponse = await pdgaFetch(roundUrl(eventId, division.Division, round), { referer });
      if (!roundResponse.ok) {
        throw new Error(`fetch_round failed: HTTP ${roundResponse.status} (${division.Division} R${round})`);
      }
      const roundEnvelope = await roundResponse.json();
      await writeJson(path.join(outDir, `round-${round}.json`), roundEnvelope);
    }
  }

  console.log(`[record] Wrote fixtures to ${outDir}`);
}

const eventId = process.argv[2];
if (!eventId) {
  console.error("Usage: PDGA_SOURCE=live tsx src/server/ingestion/pdga/record.ts <eventId>");
  process.exit(1);
}

recordEvent(eventId).catch((err: unknown) => {
  console.error("[record] Failed:", err);
  process.exit(1);
});
