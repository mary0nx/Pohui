import { describe, expect, it, vi } from "vitest";

import { api, ApiError, BACKEND_UNAVAILABLE, INVALID_RESPONSE, normalizeApiBase, onUnauthorized } from "@/api/client";
import { getToken, setToken } from "@/lib/session";

import { mockFetch, SPA_INDEX_HTML } from "./helpers";

describe("api client", () => {
  it("sends the bearer token and idempotency key", async () => {
    setToken("tok");
    const m = mockFetch([{ method: "POST", path: /\/api\/v1\/x$/, body: { ok: true } }]);
    await api("/x", { body: { a: 1 }, idempotencyKey: "key-12345678" });
    expect(m.calls[0]!.headers.Authorization).toBe("Bearer tok");
    expect(m.calls[0]!.headers["Idempotency-Key"]).toBe("key-12345678");
    expect(m.calls[0]!.body).toEqual({ a: 1 });
  });

  it("maps the unified error format to ApiError", async () => {
    mockFetch([{ method: "GET", path: /\/x$/, status: 422, body: { error: { code: "validation_error", message: "Проверьте данные" } } }]);
    await expect(api("/x")).rejects.toMatchObject({ status: 422, code: "validation_error", message: "Проверьте данные" });
  });

  it("clears the session and notifies on 401", async () => {
    setToken("tok");
    const cb = vi.fn();
    const off = onUnauthorized(cb);
    mockFetch([{ path: /\/me$/, status: 401, body: { error: { code: "session_expired", message: "Сессия истекла" } } }]);
    await expect(api("/me")).rejects.toBeInstanceOf(ApiError);
    expect(getToken()).toBeNull();
    expect(cb).toHaveBeenCalledOnce();
    off();
  });

  it("reports network failures in Russian", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api("/x")).rejects.toMatchObject({ code: "network_error" });
  });
});

describe("api client: responses that are not the Family OS API", () => {
  it("rejects an HTML page served with 200 (static host SPA fallback)", async () => {
    mockFetch([{ path: /\/meta$/, raw: SPA_INDEX_HTML }]);
    await expect(api("/meta")).rejects.toMatchObject({ code: BACKEND_UNAVAILABLE });
    await expect(api("/meta")).rejects.toThrow(/вместо данных пришла веб-страница/);
  });

  it("rejects an HTML 404 page as backend unavailable", async () => {
    mockFetch([{ path: /\/meta$/, status: 404, raw: SPA_INDEX_HTML }]);
    await expect(api("/meta")).rejects.toMatchObject({ code: BACKEND_UNAVAILABLE, status: 404 });
  });

  it("rejects an empty or malformed successful body instead of returning undefined", async () => {
    mockFetch([
      { path: /\/empty$/, raw: { text: "", contentType: "application/json" } },
      { path: /\/broken$/, raw: { text: "{not json", contentType: "application/json" } },
    ]);
    await expect(api("/empty")).rejects.toMatchObject({ code: INVALID_RESPONSE });
    await expect(api("/broken")).rejects.toMatchObject({ code: INVALID_RESPONSE });
  });

  it("keeps API error messages for non-HTML errors", async () => {
    mockFetch([{ path: /\/x$/, status: 502, raw: { text: "Bad gateway", contentType: "text/plain" } }]);
    await expect(api("/x")).rejects.toMatchObject({ status: 502, code: "http_error" });
  });
});

describe("normalizeApiBase", () => {
  it("accepts an origin and strips trailing slashes", () => {
    expect(normalizeApiBase(undefined)).toBe("");
    expect(normalizeApiBase("  ")).toBe("");
    expect(normalizeApiBase("https://api.example.com/")).toBe("https://api.example.com");
  });

  it("refuses values that are not a bare origin", () => {
    expect(() => normalizeApiBase("api.example.com")).toThrow(/VITE_API_URL/);
    expect(() => normalizeApiBase("https://api.example.com/api/v1")).toThrow(/VITE_API_URL/);
  });
});
