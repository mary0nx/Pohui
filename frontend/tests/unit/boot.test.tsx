import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "@/app/App";

import { me, meta, mockFetch, SPA_INDEX_HTML } from "./helpers";

function insideTelegram(initData: string) {
  (window as unknown as { Telegram: unknown }).Telegram = {
    WebApp: {
      initData,
      initDataUnsafe: {},
      colorScheme: "light",
      isVersionAtLeast: () => true,
      ready: () => undefined,
      expand: () => undefined,
      onEvent: () => undefined,
      offEvent: () => undefined,
      BackButton: { show: () => undefined, hide: () => undefined, onClick: () => undefined, offClick: () => undefined },
    },
  };
}

afterEach(() => {
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("static-host build (Cloudflare Pages) without VITE_API_URL", () => {
  it("does not call its own origin as the API and explains what to configure", async () => {
    vi.stubGlobal("__API_URL_REQUIRED__", true);
    vi.stubEnv("VITE_API_URL", "");
    const m = mockFetch([{ path: /\/meta$/, raw: SPA_INDEX_HTML }]);
    render(<App />);
    expect(await screen.findByText("Сервер Family OS не подключён")).toBeInTheDocument();
    expect(screen.getByText(/VITE_API_URL/, { selector: "p" })).toBeInTheDocument();
    expect(m.calls).toHaveLength(0);
  });

  it("refuses a Cloudflare Pages address as VITE_API_URL", async () => {
    vi.stubGlobal("__API_URL_REQUIRED__", true);
    vi.stubEnv("VITE_API_URL", "https://pohui.pages.dev");
    const m = mockFetch([]);
    render(<App />);
    expect(await screen.findByText("Сервер Family OS не подключён")).toBeInTheDocument();
    expect(screen.getByText(/указывает на сайт Cloudflare Pages/)).toBeInTheDocument();
    expect(m.calls).toHaveLength(0);
  });

  it("uses the configured backend origin", async () => {
    vi.stubGlobal("__API_URL_REQUIRED__", true);
    vi.stubEnv("VITE_API_URL", "https://api.familyos.test/");
    const m = mockFetch([{ path: /\/api\/v1\/meta$/, body: meta(false) }]);
    render(<App />);
    expect(await screen.findByText("Вход в Family OS")).toBeInTheDocument();
    expect(m.calls[0]!.url.origin).toBe("https://api.familyos.test");
  });
});

describe("boot without a reachable backend", () => {
  it("explains that the server is unavailable when /meta returns index.html (Cloudflare Pages case)", async () => {
    mockFetch([{ path: /\/meta$/, raw: SPA_INDEX_HTML }]);
    render(<App />);
    expect(await screen.findByText("Сервер Family OS недоступен")).toBeInTheDocument();
    expect(screen.getByText(/вместо данных пришла веб-страница/)).toBeInTheDocument();
    expect(screen.queryByText(/dev_auth/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Режим разработки/)).not.toBeInTheDocument();
  });

  it("retries and continues once the backend answers", async () => {
    let up = false;
    mockFetch([
      {
        path: /\/meta$/,
        get raw() {
          return up ? undefined : SPA_INDEX_HTML;
        },
        body: meta(false),
      },
    ]);
    render(<App />);
    await screen.findByText("Сервер Family OS недоступен");
    up = true;
    await userEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByText("Вход в Family OS")).toBeInTheDocument();
  });

  it("reports a /meta response that breaks the contract instead of crashing", async () => {
    mockFetch([{ path: /\/meta$/, body: { env: "production" } }]);
    render(<App />);
    expect(await screen.findByText("Сервер Family OS недоступен")).toBeInTheDocument();
    expect(screen.getByText(/не соответствует ожидаемому формату.*dev_auth/)).toBeInTheDocument();
  });

  it("does not offer the dev login when the backend disables it", async () => {
    mockFetch([{ path: /\/meta$/, body: meta(false) }]);
    render(<App />);
    expect(await screen.findByText("Вход в Family OS")).toBeInTheDocument();
    expect(screen.queryByText(/Режим разработки/)).not.toBeInTheDocument();
  });
});

describe("boot inside Telegram", () => {
  it("sends the raw initData to the backend and enters the app", async () => {
    insideTelegram("query_id=1&user=%7B%7D&auth_date=1&hash=abc");
    const m = mockFetch([
      { path: /\/meta$/, body: meta(false) },
      { method: "POST", path: /\/auth\/telegram$/, body: { token: "t", expires_at: "2026-11-01T00:00:00Z", start_param: null, me: me(false) } },
    ]);
    render(<App />);
    expect(await screen.findByText("Создайте семейное пространство")).toBeInTheDocument();
    const login = m.calls.find((c) => c.url.pathname.endsWith("/auth/telegram"))!;
    expect(login.body).toEqual({ init_data: "query_id=1&user=%7B%7D&auth_date=1&hash=abc" });
  });

  it("shows the server problem screen when the login endpoint is not the API", async () => {
    insideTelegram("query_id=1&hash=abc");
    mockFetch([
      { path: /\/meta$/, body: meta(false) },
      { method: "POST", path: /\/auth\/telegram$/, status: 405, raw: SPA_INDEX_HTML },
    ]);
    render(<App />);
    expect(await screen.findByText("Сервер Family OS недоступен")).toBeInTheDocument();
  });

  it("treats a rejected signature as an auth error, not as a server outage", async () => {
    insideTelegram("query_id=1&hash=forged");
    mockFetch([
      { path: /\/meta$/, body: meta(false) },
      { method: "POST", path: /\/auth\/telegram$/, status: 401, body: { error: { code: "invalid_signature", message: "Подпись Telegram недействительна" } } },
    ]);
    render(<App />);
    expect(await screen.findByText("Подпись Telegram недействительна")).toBeInTheDocument();
    expect(screen.queryByText("Сервер Family OS недоступен")).not.toBeInTheDocument();
  });
});
