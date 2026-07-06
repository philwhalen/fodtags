// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.7.
import "server-only";

import { config } from "@server/config";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 5;

/**
 * Minimum spacing between requests to the same host. A large PDGA event
 * (many divisions × rounds) can otherwise trip PDGA's server-side rate
 * limit (HTTP 429) mid-scrape. Overridable via `PDGA_RATE_LIMIT_MS` for
 * stubborn events without a redeploy; defaults conservative — a weekly
 * refresh taking an extra minute or two is fine (Spec 03 §3.8).
 */
const DEFAULT_RATE_LIMIT_MS = ((): number => {
  const parsed = Number(process.env.PDGA_RATE_LIMIT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1200;
})();

const lastRequestByHost = new Map<string, number>();

export interface PdgaFetchInit extends Omit<RequestInit, "signal"> {
  /** Per-request timeout in milliseconds (default 30s). */
  timeoutMs?: number;
  /** Retry count for 5xx responses and network/timeout failures (default 3). */
  maxRetries?: number;
  /** Sets the `Referer` header (required by PDGA for 200 responses). */
  referer?: string;
}

export type HeaderFetcher = (
  url: string | URL,
  init: RequestInit & { signal: AbortSignal },
) => Promise<Response>;

export type PlaywrightFallback = (
  url: string | URL,
  init: PdgaFetchInit,
) => Promise<Response>;

export interface PdgaFetchDeps {
  /** Override the header fetch (unit tests). */
  headerFetch?: HeaderFetcher;
  /** Override Playwright fallback (unit tests — never launches Chromium). */
  playwrightFallback?: PlaywrightFallback;
  /** Test-only: force 403 → Playwright escalation when `pdgaSource !== live`. */
  playwrightOn403?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 10_000);
}

async function enforceRateLimit(host: string, rateLimitMs: number): Promise<void> {
  const last = lastRequestByHost.get(host) ?? 0;
  const elapsed = Date.now() - last;
  const wait = rateLimitMs - elapsed;
  if (wait > 0) {
    await sleep(wait);
  }
  lastRequestByHost.set(host, Date.now());
}

function buildHeaders(init: PdgaFetchInit): Headers {
  const headers = new Headers(init.headers);
  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", DEFAULT_USER_AGENT);
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (init.referer) {
    headers.set("Referer", init.referer);
  }
  return headers;
}

function isRetryableStatus(status: number): boolean {
  return status >= 500;
}

/** Cap on how long we'll honor a 429 `Retry-After` before giving up, so a
 * hostile/absurd value can't stall a refresh indefinitely. */
const MAX_RETRY_AFTER_MS = 30_000;

/**
 * Wait to use before retrying a 429 (Too Many Requests). Honors the
 * `Retry-After` header when present (delta-seconds or HTTP-date form),
 * capped at `MAX_RETRY_AFTER_MS`; otherwise falls back to exponential
 * backoff. PDGA Live throttles a burst of round/division requests with 429
 * mid-scrape, and Spec 03 §3.8 requires the scraper to be resilient to
 * that rather than failing the whole source on the first 429.
 */
function retryAfterMs(response: Response, attempt: number): number {
  const header = response.headers.get("Retry-After");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) {
      return Math.min(Math.max(seconds, 0) * 1000, MAX_RETRY_AFTER_MS);
    }
    const dateMs = Date.parse(header);
    if (!Number.isNaN(dateMs)) {
      return Math.min(Math.max(dateMs - Date.now(), 0), MAX_RETRY_AFTER_MS);
    }
  }
  return backoffMs(attempt);
}

function shouldEscalateToPlaywright(deps: PdgaFetchDeps): boolean {
  if (deps.playwrightOn403 !== undefined) {
    return deps.playwrightOn403;
  }
  return config.pdgaSource === "live";
}

async function defaultPlaywrightFallback(
  url: string | URL,
  init: PdgaFetchInit,
): Promise<Response> {
  const { playwrightFetch } = await import("@server/ingestion/pdga/playwright-fetch");
  const body = await playwrightFetch(url, {
    referer: init.referer,
    timeoutMs: init.timeoutMs,
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function headerFetchOnce(
  urlObj: URL,
  init: PdgaFetchInit,
  headerFetch: HeaderFetcher,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = buildHeaders(init);

  try {
    return await headerFetch(urlObj, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * PDGA live-api fetch wrapper: browser-like headers, per-host rate limiting,
 * timeout, exponential backoff on 5xx / network errors, and Playwright
 * escalation on 403 when `PDGA_SOURCE=live`.
 */
export async function pdgaFetch(
  url: string | URL,
  init: PdgaFetchInit = {},
  deps: PdgaFetchDeps = {},
): Promise<Response> {
  const urlObj = typeof url === "string" ? new URL(url) : url;
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = init.maxRetries ?? DEFAULT_MAX_RETRIES;
  const headerFetch = deps.headerFetch ?? fetch;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await enforceRateLimit(urlObj.host, DEFAULT_RATE_LIMIT_MS);

    try {
      const response = await headerFetchOnce(urlObj, init, headerFetch, timeoutMs);

      if (response.status === 403 && shouldEscalateToPlaywright(deps)) {
        const fallback = deps.playwrightFallback ?? defaultPlaywrightFallback;
        return fallback(urlObj, init);
      }

      if (response.status === 429 && attempt < maxRetries) {
        await sleep(retryAfterMs(response, attempt));
        continue;
      }

      if (isRetryableStatus(response.status) && attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }

      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
    }
  }

  throw lastError ?? new Error("pdgaFetch failed after retries");
}

/** Test-only: clears per-host rate-limit timestamps between cases. */
export function __resetRateLimitForTests(): void {
  lastRequestByHost.clear();
}
