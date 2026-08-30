import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  clearTokens,
  getRefresh,
  getToken,
  request,
  setTokens,
  setUnauthorizedHandler,
} from "./client";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (k: string) => (k.toLowerCase() === "content-type" ? "application/json" : null),
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("api client request()", () => {
  beforeEach(() => {
    clearTokens();
    setUnauthorizedHandler(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ hello: "world" }));
    vi.stubGlobal("fetch", fetchMock);

    const data = await request<{ hello: string }>("/ping");
    expect(data).toEqual({ hello: "world" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes once on 401 then retries with the new access token", async () => {
    const newAccess = "new.access.token";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ access_token: newAccess, refresh_token: "new.refresh" }, 200))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    setTokens("old.access", "old.refresh");
    vi.stubGlobal("fetch", fetchMock);

    const data = await request<{ ok: boolean }>("/ping");

    expect(data).toEqual({ ok: true });
    // original call + refresh + retry
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const retryInit = fetchMock.mock.calls[2][1] as { headers?: Record<string, string> };
    expect(retryInit.headers?.Authorization).toBe(`Bearer ${newAccess}`);
  });

  it("throws ApiError and fires the unauthorized handler when refresh fails", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ detail: "bad refresh" }, 400));
    setTokens("old.access", "old.refresh");
    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/ping")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    // Session truly ends: tokens wiped.
    expect(getToken()).toBeNull();
    expect(getRefresh()).toBeNull();
  });

  it("deduplicates concurrent 401 refreshes to a single /auth/refresh call", async () => {
    const newAccess = "single.flight.access";
    let refreshCalls = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: { headers?: Record<string, string> }) => {
      if (url.includes("/auth/refresh")) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return jsonResponse({ access_token: newAccess, refresh_token: "new.refresh" }, 200);
      }
      if (init?.headers?.Authorization === `Bearer ${newAccess}`) {
        return jsonResponse({ ok: true }, 200);
      }
      // initial calls with old token return 401
      return jsonResponse({ detail: "expired" }, 401);
    });

    setTokens("old.access", "old.refresh");
    vi.stubGlobal("fetch", fetchMock);

    // Trigger two requests concurrently
    const [res1, res2] = await Promise.all([
      request<{ ok: boolean }>("/parallel-1"),
      request<{ ok: boolean }>("/parallel-2"),
    ]);

    expect(res1).toEqual({ ok: true });
    expect(res2).toEqual({ ok: true });
    expect(refreshCalls).toBe(1);
  });

  it("reads the backend's {error:{message}} shape (not just detail)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: "Custom failure" } }, 422));
    vi.stubGlobal("fetch", fetchMock);

    const err = (await request("/ping").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Custom failure");
    expect(err.status).toBe(422);
  });
});
