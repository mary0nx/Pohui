import { describe, expect, it, vi } from "vitest";

import { api, ApiError, onUnauthorized } from "@/api/client";
import { getToken, setToken } from "@/lib/session";

import { mockFetch } from "./helpers";

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
