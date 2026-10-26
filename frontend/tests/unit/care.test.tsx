import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "@/app/App";
import { router } from "@/app/routes";
import { setToken } from "@/lib/session";

import { dashboard, family, FAMILY_ID, me, meta, mockFetch } from "./helpers";

const settings = (over: Record<string, unknown> = {}) => ({
  enabled: false,
  configured: false,
  recipient_name: null,
  default_name: "Мари",
  gender: "f",
  city: "Вроцлав",
  country: "Польша",
  timezone: "Europe/Warsaw",
  send_time: "06:00:00",
  leave_time: "08:00:00",
  days: [0, 1, 2, 3, 4, 5, 6],
  tone: "tender",
  weather_tips: true,
  signature: null,
  next_send_at: null,
  telegram: { bot_started: false, bot_blocked: false, bot_link: "https://t.me/family_bot" },
  push_devices: 0,
  ...over,
});
const preview = {
  day: "2026-11-10",
  title: "Доброе утро, Мария! ❤️",
  body: "Сегодня во Вроцлаве дождливо, днём от +6°C до +9°C.\n\n🌧️ Погода: +6°C утром, днём до +9°C, дождь.\n🧥 Совет: Возьми зонт; тёплая куртка.",
  weather: { emoji: "🌧️", condition: "дождь", leave_temp: "+6°C", temp_max: "+9°C", temp_min: "+6°C", line: "🌧️ Погода: +6°C утром, днём до +9°C, дождь.", tips: "🧥 Совет: Возьми зонт; тёплая куртка.", source: "Open-Meteo" },
};
const base = [
  { path: /\/meta$/, body: meta() },
  { path: /\/me$/, body: me() },
  { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
  { path: /\/me\/care\/preview$/, body: preview },
];

afterEach(async () => {
  await act(() => router.navigate("/"));
});

describe("«Забота на каждый день»", () => {
  it("shows today's message, explains the bot and saves the settings", async () => {
    await act(() => router.navigate("/profile/care"));
    setToken("tok");
    let saved: Record<string, unknown> | null = null;
    const m = mockFetch([
      ...base,
      { path: /\/me\/care$/, body: settings() },
      { method: "PUT", path: /\/me\/care$/, handler: (body) => ((saved = body as Record<string, unknown>), settings({ ...(body as object), enabled: true, configured: true, next_send_at: "2026-11-11T05:00:00Z" })) },
      { method: "POST", path: /\/me\/care\/test$/, body: { queued: true, telegram_ready: false, push_devices: 0 } },
    ]);
    render(<App />);
    expect(await screen.findByText("Доброе утро, Мария! ❤️")).toBeInTheDocument();
    expect(screen.getByText(/Прогноз: Open-Meteo/)).toBeInTheDocument();
    expect(screen.getByText("Бот пока не может вам писать")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Имя в приветствии"), "Мария");
    await user.click(screen.getByRole("radio", { name: "Романтичный" }));
    await user.click(screen.getByRole("button", { name: "Сб" }));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(saved).not.toBeNull());
    expect(saved).toMatchObject({ recipient_name: "Мария", tone: "romantic", send_time: "06:00", days: [0, 1, 2, 3, 4, 6] });
    await user.click(screen.getByRole("switch", { name: /Утреннее сообщение/ }));
    expect(await screen.findByText(/Следующее сообщение: среда, 11 ноября, 06:00/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Отправить тест" }));
    expect(await screen.findByText(/бот пока не может вам писать/)).toBeInTheDocument();
    expect(m.calls.some((c) => c.method === "POST" && c.url.pathname.endsWith("/me/care/test"))).toBe(true);
  });

  it("shows the weather line on the home screen only when switched on", async () => {
    setToken("tok");
    mockFetch([...base, { path: /\/dashboard$/, body: dashboard() }, { path: /\/tasks$/, body: [] }, { path: /\/me\/care$/, body: settings({ enabled: true, configured: true }) }]);
    render(<App />);
    expect(await screen.findByText("+6°C утром, днём до +9°C, дождь")).toBeInTheDocument();
    expect(screen.getByText("Возьми зонт; тёплая куртка.")).toBeInTheDocument();
  });
});
