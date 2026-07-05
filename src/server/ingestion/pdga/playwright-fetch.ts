// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.7.
import "server-only";

import { type Browser, type BrowserContext, chromium } from "playwright";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface PlaywrightFetchInit {
  referer?: string;
  timeoutMs?: number;
}

let browserPromise: Promise<Browser> | undefined;
let sharedContext: BrowserContext | undefined;
let exitHookRegistered = false;

function registerExitHook(): void {
  if (exitHookRegistered) {
    return;
  }
  exitHookRegistered = true;
  process.on("exit", () => {
    void sharedContext?.close();
    void browserPromise?.then((browser) => browser.close());
  });
}

async function getSharedContext(): Promise<BrowserContext> {
  registerExitHook();
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  if (!sharedContext) {
    const browser = await browserPromise;
    sharedContext = await browser.newContext({
      userAgent: DEFAULT_USER_AGENT,
      extraHTTPHeaders: {
        Accept: "application/json",
      },
    });
  }
  return sharedContext;
}

/**
 * Headless-Chromium GET fallback when header-fetch alone returns 403.
 * Lazily launches a single shared browser/context; closed on process exit.
 *
 * Deploy note: run `npx playwright install chromium` once on the VM before
 * enabling `PDGA_SOURCE=live` in production.
 */
export async function playwrightFetch(
  url: string | URL,
  init: PlaywrightFetchInit = {},
): Promise<string> {
  const context = await getSharedContext();
  const page = await context.newPage();

  if (init.referer) {
    await page.setExtraHTTPHeaders({ Referer: init.referer });
  }

  try {
    const response = await page.goto(url.toString(), {
      waitUntil: "networkidle",
      timeout: init.timeoutMs ?? 30_000,
    });
    if (!response) {
      throw new Error(`Playwright fetch failed: no response for ${url.toString()}`);
    }
    if (!response.ok()) {
      throw new Error(`Playwright fetch failed: HTTP ${response.status()} for ${url.toString()}`);
    }
    return await response.text();
  } finally {
    await page.close();
  }
}

/** Test-only: reset lazy browser/context singletons between cases. */
export async function __resetPlaywrightForTests(): Promise<void> {
  await sharedContext?.close();
  sharedContext = undefined;
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = undefined;
  }
  exitHookRegistered = false;
}
