import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "@/app/App";
import { router } from "@/app/routes";
import {
  defaultDirection,
  transfersText,
  untilText,
} from "@/features/route/api";
import { setToken } from "@/lib/session";
import { askLine } from "@/features/route/RouteCard";

import { dashboard, family, FAMILY_ID, me, meta, mockFetch } from "./helpers";

const place = (
  id: string,
  kind: string,
  title: string,
  label: string,
  over: Record<string, unknown> = {},
) => ({
  id,
  kind,
  title,
  label,
  estate: "Stare Miasto",
  lat: 51.11,
  lon: 17.03,
  shared: false,
  mine: true,
  owner_name: null,
  position: 0,
  ...over,
});
const HOME = place("p-home", "home", "Дом", "ul. Testowa 1");
const WORK = place("p-work", "work", "Работа", "ul. Próbna 2");

const stop = (name: string) => ({ name, code: "1", lat: 51.1, lon: 17.0 });
const walk = (minutes: number, from: string | null, to: string | null) => ({
  kind: "walk",
  minutes,
  metres: minutes * 80,
  from_name: from,
  to_name: to,
  mode: null,
  line: null,
  night: false,
  headsign: null,
  from_stop: null,
  to_stop: null,
  departure_at: null,
  arrival_at: null,
  stops: null,
  time_kind: "scheduled",
  delay_min: null,
  wait_min: null,
});
const ride = (line: string, mode: string, a: string, b: string, dep: string, arr: string) => ({
  kind: "ride", minutes: 10, metres: null, from_name: null, to_name: null, mode, line, night: false, headsign: "Kierunek", from_stop: stop(a), to_stop: stop(b),
  departure_at: dep, arrival_at: arr, stops: 5, time_kind: "scheduled", delay_min: null, wait_min: 2,
}); // prettier-ignore
const option = (over: Record<string, unknown>) => {
  const legs = [
    walk(3, null, "Przystanek A"),
    ride(
      "10",
      "tram",
      "Przystanek A",
      "Przystanek B",
      "2026-10-27T07:05:00+01:00",
      "2026-10-27T07:25:00+01:00",
    ),
    walk(4, "Przystanek B", null),
  ];
  return {
    id: "o1",
    provider: "gtfs",
    tags: ["fastest"],
    recommended: true,
    depart_at: "2026-10-27T07:02:00+01:00",
    arrive_at: "2026-10-27T07:29:00+01:00",
    duration_min: 27,
    transfers: 0,
    walk_m: 560,
    walk_min: 7,
    legs,
    time_kind: "scheduled",
    warnings: [],
    first_ride: legs[1],
    ...over,
  };
};
const plan = (over: Record<string, unknown> = {}) => ({
  status: "ok", message: null, mode: "depart", at: "2026-10-27T07:00:00+01:00", from_title: "Дом", to_title: "Работа",
  options: [option({}), option({ id: "o2", tags: ["fewer_transfers"], recommended: false, transfers: 0, duration_min: 31 })],
  walk_option: null,
  schedule: { provider: "gtfs", source: "Rozkład jazdy transportu publicznego — Otwarte dane Wrocławia (UM Wrocław)", license: "CC0 1.0", name: "GTFS", valid_from: "2026-10-26", valid_to: "2026-11-15", fetched_at: "2026-10-27T05:00:00Z", checked_at: "2026-10-27T05:00:00Z", stale: false },
  realtime: false, jakdojade_url: "https://jakdojade.pl/wroclaw/Przystanek%20A/Przystanek%20B?fc=51.1:17.0", notes: ["Время — по расписанию. Задержки не учитываются: данных о движении в реальном времени нет."],
  ...over,
}); // prettier-ignore
const base = [
  { path: /\/meta$/, body: meta() },
  { path: /\/me$/, body: me() },
  { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
  { path: /\/dashboard$/, body: dashboard() },
  { path: /\/tasks$/, body: [] },
  { path: /\/me\/route\/favorites$/, body: [] },
  {
    path: /\/me\/route\/preferences$/,
    body: { prefer: "fastest", max_walk_m: 1000 },
  },
];

afterEach(async () => {
  vi.useRealTimers();
  await act(() => router.navigate("/"));
});

describe("«Мой маршрут»", () => {
  it("helpers speak plain Russian", () => {
    expect(transfersText(0)).toBe("без пересадок");
    expect(transfersText(2)).toBe("2 пересадки");
    expect(untilText(0)).toBe("сейчас");
    expect(untilText(75)).toBe("через 1 ч 15 мин");
    expect(defaultDirection(new Date("2026-10-27T06:00:00Z"))).toBe("to_work");
    expect(defaultDirection(new Date("2026-10-27T15:00:00Z"))).toBe("to_home");
    expect(askLine(new Date("2026-10-27T06:00:00Z"))).toBe("Доброе утро! Куда сегодня едем?");
  });

  it("home card invites to add places when there are none", async () => {
    setToken("tok");
    mockFetch([
      ...base,
      { path: /\/me\/places$/, body: { places: [], shared: [] } },
    ]);
    render(<App />);
    expect(
      await screen.findByText(/Добавьте дом и работу/),
    ).toBeInTheDocument();
  });

  it("home card shows the best option by the timetable and both directions", async () => {
    setToken("tok");
    const m = mockFetch([
      ...base,
      { path: /\/me\/places$/, body: { places: [HOME, WORK], shared: [] } },
      { method: "POST", path: /\/me\/route\/plan$/, body: plan() },
    ]);
    render(<App />);
    expect(await screen.findByText("«Przystanek A»")).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Дом → Работа" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Работа → Дом" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Трамвай 10")).toBeInTheDocument();
    expect(
      screen.getByText(/27 мин в пути · без пересадок/),
    ).toBeInTheDocument();
    expect(screen.getByText("По расписанию")).toBeInTheDocument();
    // Places travel as ids in the body, never addresses in the URL.
    const call = m.calls.find((c) =>
      c.url.pathname.endsWith("/me/route/plan"),
    )!;
    expect(call.method).toBe("POST");
    expect(call.url.search).toBe("");
    expect(JSON.stringify(call.body)).not.toContain("Testowa");
    await userEvent
      .setup()
      .click(screen.getByRole("tab", { name: "Работа → Дом" }));
    await waitFor(() =>
      expect(
        m.calls.some(
          (c) =>
            c.url.pathname.endsWith("/me/route/plan") &&
            (c.body as { from_place_id: string }).from_place_id === "p-work",
        ),
      ).toBe(true),
    );
  });

  it("details: options with labels, the step schema, sources and the Jakdojade link", async () => {
    await act(() => router.navigate("/route?from=p-home&to=p-work"));
    setToken("tok");
    mockFetch([
      ...base,
      { path: /\/me\/places$/, body: { places: [HOME, WORK], shared: [] } },
      { method: "POST", path: /\/me\/route\/plan$/, body: plan() },
    ]);
    render(<App />);
    expect(await screen.findByText("Рекомендуем")).toBeInTheDocument();
    expect(
      screen.getByText("Быстрее всего", { selector: "span" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Меньше пересадок", { selector: "span" }),
    ).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getAllByRole("button", { expanded: false })[0]!);
    const steps = await screen.findByRole("list", { name: "Шаги маршрута" });
    expect(
      within(steps).getByText(/Пешком 3 мин до остановки «Przystanek A»/),
    ).toBeInTheDocument();
    expect(within(steps).getByText(/выход «Przystanek B»/)).toBeInTheDocument();
    expect(within(steps).getAllByText("по расписанию").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText(/лицензия CC0 1.0/)).toBeInTheDocument();
    expect(screen.getByText(/реальном времени нет/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Открыть эту поездку в Jakdojade/ }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(/^https:\/\/jakdojade\.pl\/wroclaw\//),
    );
  });

  it("a stale schedule is shown with a warning and no recommendation; no route has a clear message", async () => {
    await act(() => router.navigate("/route?from=p-home&to=p-work"));
    setToken("tok");
    const stale = plan({
      options: [option({ recommended: false })],
      schedule: { ...plan().schedule, stale: true },
      notes: [
        "Расписание давно не удавалось обновить — сверьтесь с табло на остановке.",
      ],
    });
    mockFetch([
      ...base,
      { path: /\/me\/places$/, body: { places: [HOME, WORK], shared: [] } },
      { method: "POST", path: /\/me\/route\/plan$/, body: stale },
    ]);
    const view = render(<App />);
    expect(
      await screen.findByText(/давно не удавалось обновить/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Рекомендуем")).not.toBeInTheDocument();
    view.unmount();
    mockFetch([
      ...base,
      { path: /\/me\/places$/, body: { places: [HOME, WORK], shared: [] } },
      {
        method: "POST",
        path: /\/me\/route\/plan$/,
        body: plan({
          status: "no_schedule",
          message:
            "Нет действующего расписания на эту дату — маршрут не строим, чтобы не обмануть.",
          options: [],
        }),
      },
    ]);
    render(<App />);
    expect(
      await screen.findByText(/Нет действующего расписания/),
    ).toBeInTheDocument();
  });

  it("adds a place: search the register, confirm with nearby stops, save", async () => {
    await act(() => router.navigate("/route/places"));
    setToken("tok");
    let saved: Record<string, unknown> | null = null;
    const hit = {
      id: "2026-10-26:5",
      label: "ul. Legnicka 58",
      street: "ul. Legnicka",
      number: "58",
      postcode: "54-204",
      estate: "Gądów",
      lat: 51.12,
      lon: 16.99,
    };
    const m = mockFetch([
      ...base,
      {
        path: /\/me\/places$/,
        body: {
          places: [],
          shared: [
            place("p-s", "work", "Работа Мари", "ul. Rynek 1", {
              mine: false,
              shared: true,
              owner_name: "Мари",
            }),
          ],
        },
      },
      {
        method: "POST",
        path: /\/me\/places\/search$/,
        body: { addresses: [hit], streets: [], source: "EMUiA" },
      },
      {
        method: "POST",
        path: /\/me\/places\/check$/,
        body: {
          address: hit,
          stops: [
            {
              name: "Niedźwiedzia",
              code: "1",
              distance_m: 320,
              walk_min: 5,
              lat: 51.121,
              lon: 16.993,
              lines: ["3", "10"],
              modes: ["tram"],
            },
          ],
          osm_url: "https://www.openstreetmap.org/?mlat=51.12",
        },
      },
      {
        method: "POST",
        path: /\/me\/places$/,
        handler: (b) => (
          (saved = b as Record<string, unknown>),
          place("p1", "home", "Дом", "ul. Legnicka 58")
        ),
      },
    ]);
    render(<App />);
    expect(await screen.findByText("Работа Мари")).toBeInTheDocument();
    expect(screen.getByText("Делится: Мари")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Добавить дом" }));
    await user.type(screen.getByLabelText("Адрес во Вроцлаве"), "legnicka 58");
    await user.click(
      await screen.findByRole("button", { name: /ul\. Legnicka 58/ }),
    );
    expect(
      await screen.findByRole("img", { name: /ближайшие остановки/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/≈320 м, 5 мин пешком · 3, 10/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Подтвердить и сохранить" }),
    );
    await waitFor(() => expect(saved).not.toBeNull());
    expect(saved).toMatchObject({
      kind: "home",
      title: "Дом",
      address_id: "2026-10-26:5",
      shared: false,
    });
    // The typed address went in a POST body only.
    const search = m.calls.find((c) =>
      c.url.pathname.endsWith("/me/places/search"),
    )!;
    expect(search.url.search).toBe("");
    expect(search.body).toEqual({ q: "legnicka 58" });
  });
});
