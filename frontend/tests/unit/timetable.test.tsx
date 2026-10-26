import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "@/app/App";
import { router } from "@/app/routes";
import { setToken } from "@/lib/session";

import { family, FAMILY_ID, me, meta, mockFetch } from "./helpers";

const schedule = {
  provider: "gtfs",
  source: "Otwarte dane Wrocławia",
  license: "CC0 1.0",
  name: "GTFS",
  valid_from: "2026-10-26",
  valid_to: "2026-11-15",
  fetched_at: null,
  checked_at: null,
  stale: false,
};
const stops = [
  { id: "s1", name: "LEŚNICA", code: "1" },
  { id: "s2", name: "Kosmonautów (Szpital)", code: "2" },
  { id: "s3", name: "BISKUPIN", code: "3" },
];
const base = [
  { path: /\/meta$/, body: meta() },
  { path: /\/me$/, body: me() },
  { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
  {
    path: /\/transit\/lines$/,
    body: {
      status: "ok", date: "2026-10-27", schedule,
      lines: [
        { line: "10", mode: "tram", night: false, runs: true, directions: [{ id: "0", headsign: "BISKUPIN" }, { id: "1", headsign: "LEŚNICA" }] },
        { line: "149", mode: "bus", night: false, runs: true, directions: [] },
        { line: "245", mode: "bus", night: true, runs: false, directions: [] },
      ],
    },
  },
  { path: /\/transit\/lines\/10$/, body: { status: "ok", line: "10", mode: "tram", night: false, directions: [{ id: "0", headsign: "BISKUPIN", stops }, { id: "1", headsign: "LEŚNICA", stops: [...stops].reverse() }] } },
  {
    path: /\/transit\/lines\/10\/departures$/,
    body: {
      status: "ok", date: "2026-10-27", schedule, line: "10", mode: "tram", night: false,
      direction: { id: "0", headsign: "BISKUPIN" }, stop: stops[1],
      departures: [
        { at: "2026-10-27T05:04:00+01:00", time: "05:04", hour: 5, headsign: "BISKUPIN", other_end: false, next: false },
        { at: "2026-10-27T05:24:00+01:00", time: "05:24", hour: 5, headsign: "Zajezdnia OŁBIN", other_end: true, next: false },
        { at: "2026-10-27T06:04:00+01:00", time: "06:04", hour: 6, headsign: "BISKUPIN", other_end: false, next: true },
      ],
    },
  },
]; // prettier-ignore

afterEach(async () => {
  await act(() => router.navigate("/"));
});

describe("Расписание", () => {
  it("lines → direction → stop → departures by hour", async () => {
    await act(() => router.navigate("/route/timetable"));
    setToken("tok");
    mockFetch(base);
    render(<App />);
    expect(await screen.findByText("Трамваи")).toBeInTheDocument();
    expect(screen.getByText("Ночные")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Автобус 245, в этот день не ходит" }),
    ).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: "Трамвай 10" }));
    expect(
      await screen.findByRole("tab", { name: "→ BISKUPIN" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "→ LEŚNICA" })).toBeInTheDocument();
    await user.click(
      screen.getByRole("link", { name: /Kosmonautów \(Szpital\)/ }),
    );
    const table = await screen.findByRole("table", {
      name: "Отправления по часам",
    });
    expect(table).toHaveTextContent("05");
    expect(table).toHaveTextContent("04");
    expect(screen.getByText("— рейс до «Zajezdnia OŁBIN»")).toBeInTheDocument();
    expect(
      screen.getByText("Выделено ближайшее отправление."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/по расписанию, задержки не учитываются/),
    ).toBeInTheDocument();
  });
});
