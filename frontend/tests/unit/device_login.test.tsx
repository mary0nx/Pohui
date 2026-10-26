import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "@/app/App";
import { getToken } from "@/lib/session";

import { dashboard, family, FAMILY_ID, me, meta, mockFetch } from "./helpers";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const started = {
  poll_token: "poll-secret",
  bot_url: "https://t.me/family_bot?start=login_abc",
  app_url: "tg://resolve?domain=family_bot&start=login_abc",
  expires_at: "2026-10-26T12:10:00Z",
};

function stubLocation() {
  const assigned: string[] = [];
  const loc = { ...window.location, set href(v: string) { assigned.push(v); }, get href() { return "http://localhost/"; } };
  vi.stubGlobal("location", loc);
  return assigned;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("sign-in outside Telegram", () => {
  it("opens the bot, waits for «Войти» and keeps the device signed in", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE);
    let approved = false;
    const device = { ...me(), auth_method: "device" };
    const m = mockFetch([
      { path: /\/meta$/, body: meta(false) },
      { method: "POST", path: /\/auth\/link\/start$/, body: started },
      { method: "POST", path: /\/auth\/link\/poll$/, handler: () => (approved ? { status: "approved", auth: { token: "device-token", expires_at: "2026-12-25T00:00:00Z", start_param: null, me: device } } : { status: "pending", auth: null }) },
      { path: /\/me$/, body: device },
      { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
      { path: /\/dashboard$/, body: dashboard() },
      { path: /\/tasks$/, body: [] },
    ]);
    render(<App />);
    // iPhone Safari tab: suggests installing on the home screen first.
    expect(await screen.findByText("Сначала установите на экран «Домой»")).toBeInTheDocument();
    const assigned = stubLocation();
    await userEvent.click(screen.getByRole("button", { name: "Войти через Telegram" }));
    expect(await screen.findByText("Ждём подтверждения в Telegram…")).toBeInTheDocument();
    expect(assigned).toEqual([started.app_url]);
    const startCall = m.calls.find((c) => c.url.pathname.endsWith("/auth/link/start"))!;
    expect(startCall.body).toEqual({ standalone: false });
    // Coming back from Telegram after pressing «Войти»: the next check signs in.
    approved = true;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await screen.findByText(/Добр/, undefined, { timeout: 4000 })).toBeInTheDocument();
    const polls = m.calls.filter((c) => c.url.pathname.endsWith("/auth/link/poll"));
    expect(polls.every((c) => (c.body as { poll_token: string }).poll_token === "poll-secret")).toBe(true);
    // Outside Telegram the token survives closing the app (localStorage, not sessionStorage).
    expect(getToken()).toBe("device-token");
    expect(localStorage.getItem("familyos.session")).toBe("device-token");
    expect(sessionStorage.getItem("familyos.session")).toBeNull();
  });

  it("explains a rejected sign-in and lets the user start again", async () => {
    mockFetch([
      { path: /\/meta$/, body: meta(false) },
      { method: "POST", path: /\/auth\/link\/start$/, body: started },
      { method: "POST", path: /\/auth\/link\/poll$/, body: { status: "rejected", auth: null } },
    ]);
    render(<App />);
    stubLocation();
    await userEvent.click(await screen.findByRole("button", { name: "Войти через Telegram" }));
    await screen.findByText("Ждём подтверждения в Telegram…");
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(await screen.findByText(/Вход отклонён в Telegram/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Войти через Telegram" })).toBeInTheDocument();
    expect(getToken()).toBeNull();
  });

  it("opens the t.me page on a computer and shows server problems", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36");
    mockFetch([
      { path: /\/meta$/, body: meta(false) },
      { method: "POST", path: /\/auth\/link\/start$/, status: 503, body: { error: { code: "service_unavailable", message: "Вход без Telegram недоступен: на сервере не задан бот" } } },
    ]);
    render(<App />);
    expect(screen.queryByText("Сначала установите на экран «Домой»")).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Войти через Telegram" }));
    expect(await screen.findByText(/на сервере не задан бот/)).toBeInTheDocument();
    await waitFor(() => expect(getToken()).toBeNull());
  });
});

describe("devices and phone notifications", () => {
  it("lists signed-in devices and signs one out", async () => {
    const { router } = await import("@/app/routes");
    const { setToken } = await import("@/lib/session");
    await act(() => router.navigate("/profile"));
    setToken("tok");
    let devices = [
      { id: "d1", label: "iPhone · приложение на экране", created_at: "2026-10-20T10:00:00Z", last_used_at: "2026-10-26T09:00:00Z", current: false, push: true },
    ];
    const m = mockFetch([
      { path: /\/meta$/, body: meta() },
      { path: /\/me$/, body: me() },
      { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
      { path: /\/invitations$/, body: [] },
      { path: /\/auth\/devices$/, handler: () => devices },
      {
        method: "DELETE",
        path: /\/auth\/devices\/d1$/,
        status: 204,
        handler: () => {
          devices = [];
          return null;
        },
      },
    ]);
    render(<App />);
    expect(await screen.findByText("iPhone · приложение на экране")).toBeInTheDocument();
    expect(screen.getByLabelText("уведомления включены")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Выйти" }));
    await waitFor(() => expect(m.calls.some((c) => c.method === "DELETE" && c.url.pathname.endsWith("/auth/devices/d1"))).toBe(true));
    expect(await screen.findByText("Других устройств нет.")).toBeInTheDocument();
    await act(() => router.navigate("/"));
  });

  it("asks to install on the home screen before turning on notifications on iPhone", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE);
    const { router } = await import("@/app/routes");
    const { setToken } = await import("@/lib/session");
    await act(() => router.navigate("/profile/notifications"));
    setToken("tok");
    const categories = Object.fromEntries(["event_reminder", "payment_due", "task_overdue", "task_assigned", "task_reminder", "custom_reminder", "shopping_update", "shopping_reminder", "goal_update", "document_expiry", "system"].map((c) => [c, true]));
    mockFetch([
      { path: /\/meta$/, body: meta() },
      { path: /\/me$/, body: me() },
      { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
      { path: /\/notifications\/settings$/, body: { quiet_start: null, quiet_end: null, timezone: null, telegram_enabled: true, categories, bot_started: true, bot_blocked: false } },
    ]);
    render(<App />);
    expect(await screen.findByText("Уведомления на этом устройстве")).toBeInTheDocument();
    expect(screen.getByText(/работают только в приложении с экрана «Домой»/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Включить уведомления" })).not.toBeInTheDocument();
    await act(() => router.navigate("/"));
  });
});
