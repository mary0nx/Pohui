import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "@/app/App";
import { router } from "@/app/routes";
import { setToken } from "@/lib/session";

import { dashboard, family, FAMILY_ID, me, meta, mockFetch } from "./helpers";

const NID = "22222222-2222-2222-2222-222222222222";

afterEach(async () => {
  delete (navigator as unknown as Record<string, unknown>).setAppBadge;
  delete (navigator as unknown as Record<string, unknown>).clearAppBadge;
  await act(() => router.navigate("/"));
});

function stubBadge() {
  const set = vi.fn().mockResolvedValue(undefined);
  const clear = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { setAppBadge: set, clearAppBadge: clear });
  return { set, clear };
}

describe("icon badge of the home-screen app", () => {
  it("follows unread notifications and clears when all are read", async () => {
    const badge = stubBadge();
    let unread = 2;
    setToken("tok");
    mockFetch([
      { path: /\/meta$/, body: meta() },
      { path: /\/me$/, body: me() },
      { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
      { path: /\/dashboard$/, body: dashboard() },
      { path: /\/tasks$/, body: [] },
      { path: /\/notifications$/, handler: () => ({ items: [], unread }) },
    ]);
    render(<App />);
    await waitFor(() => expect(badge.set).toHaveBeenCalledWith(2));
    unread = 0;
    act(() => {
      // Coming back to the app (react-query listens for visibilitychange on window).
      window.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(badge.clear).toHaveBeenCalled());
  });

  it("a tap on a push marks that notification read and removes the parameter", async () => {
    const badge = stubBadge();
    await act(() => router.navigate(`/inbox?notif=${NID}`));
    setToken("tok");
    let unread = 1;
    const m = mockFetch([
      { path: /\/meta$/, body: meta() },
      { path: /\/me$/, body: me() },
      { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
      { path: /\/notifications$/, handler: () => ({ items: [], unread }) },
      { method: "POST", path: new RegExp(`/notifications/${NID}/read$`), status: 204, handler: () => ((unread = 0), null) },
    ]);
    render(<App />);
    await screen.findByText("Уведомлений нет");
    await waitFor(() => expect(m.calls.some((c) => c.method === "POST" && c.url.pathname.endsWith(`/notifications/${NID}/read`))).toBe(true));
    await waitFor(() => expect(router.state.location.search).toBe(""));
    await waitFor(() => expect(badge.clear).toHaveBeenCalled());
  });

  it("does nothing inside Telegram or where badges are unsupported", async () => {
    setToken("tok");
    const m = mockFetch([
      { path: /\/meta$/, body: meta() },
      { path: /\/me$/, body: me() },
      { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
      { path: /\/dashboard$/, body: dashboard() },
      { path: /\/tasks$/, body: [] },
    ]);
    render(<App />);
    await screen.findByText(/Добр/);
    expect(m.calls.some((c) => c.url.pathname.endsWith("/notifications"))).toBe(false);
  });
});
