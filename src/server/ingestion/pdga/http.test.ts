import { afterEach, describe, expect, it, vi } from "vitest";

import { __resetRateLimitForTests, pdgaFetch } from "@server/ingestion/pdga/http";

afterEach(() => {
  __resetRateLimitForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("pdgaFetch", () => {
  it("sends browser-like headers including Referer when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await pdgaFetch("https://www.pdga.com/apps/tournament/live-api/live_results_fetch_event?TournID=104527", {
      referer: "https://www.pdga.com/live/event/104527/leaders",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("User-Agent")).toMatch(/Mozilla/);
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Referer")).toBe("https://www.pdga.com/live/event/104527/leaders");
  });

  it("retries on 5xx and returns the eventual 200", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await pdgaFetch("https://www.pdga.com/test", { maxRetries: 2 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
  });

  it("throws on timeout when the request does not settle in time", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(pdgaFetch("https://www.pdga.com/slow", { timeoutMs: 20, maxRetries: 0 })).rejects.toThrow();
  });

  it("escalates to Playwright fallback on 403 when live (mocked — no browser)", async () => {
    const headerFetch = vi.fn().mockResolvedValue(new Response("blocked", { status: 403 }));
    const playwrightFallback = vi
      .fn()
      .mockResolvedValue(new Response('{"data":{},"hash":"pw"}', { status: 200 }));

    const response = await pdgaFetch(
      "https://www.pdga.com/apps/tournament/live-api/live_results_fetch_event?TournID=104527",
      { referer: "https://www.pdga.com/live/event/104527/leaders", maxRetries: 0 },
      { headerFetch, playwrightFallback, playwrightOn403: true },
    );

    expect(headerFetch).toHaveBeenCalledOnce();
    expect(playwrightFallback).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
  });

  it("does not escalate to Playwright on 200", async () => {
    const headerFetch = vi.fn().mockResolvedValue(new Response('{"data":{},"hash":"ok"}', { status: 200 }));
    const playwrightFallback = vi.fn();

    const response = await pdgaFetch("https://www.pdga.com/test", { maxRetries: 0 }, {
      headerFetch,
      playwrightFallback,
      playwrightOn403: true,
    });

    expect(headerFetch).toHaveBeenCalledOnce();
    expect(playwrightFallback).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("returns 403 without Playwright when not live and no test override", async () => {
    const headerFetch = vi.fn().mockResolvedValue(new Response("blocked", { status: 403 }));
    const playwrightFallback = vi.fn();

    const response = await pdgaFetch("https://www.pdga.com/test", { maxRetries: 0 }, {
      headerFetch,
      playwrightFallback,
    });

    expect(playwrightFallback).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });
});
