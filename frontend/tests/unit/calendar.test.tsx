import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "@/app/App";
import { router } from "@/app/routes";
import { toPatternCode } from "@/features/calendar/ShiftSheet";
import { catholicEaster, holidaysBetween, orthodoxEaster, polishPublicHolidays, polishTradingSundays } from "@/lib/holidays";
import { setToken } from "@/lib/session";
import { todayIn } from "@/lib/time";

import { family, FAMILY_ID, me, meta, mockFetch } from "./helpers";

afterEach(async () => {
  await act(() => router.navigate("/"));
  localStorage.clear();
});

describe("Polish calendar layers", () => {
  it("computes Easter for both churches", () => {
    expect(catholicEaster(2026)).toBe("2026-04-05");
    expect(catholicEaster(2027)).toBe("2027-03-28");
    expect(orthodoxEaster(2026)).toBe("2026-04-12");
    expect(orthodoxEaster(2027)).toBe("2027-05-02");
  });

  it("lists the 2026 trading Sundays (three in December since 2025)", () => {
    expect(polishTradingSundays(2026).map((h) => h.date)).toEqual([
      "2026-01-25",
      "2026-03-29",
      "2026-04-26",
      "2026-06-28",
      "2026-08-30",
      "2026-12-06",
      "2026-12-13",
      "2026-12-20",
    ]);
    expect(polishTradingSundays(2027).map((h) => h.date)).toEqual([
      "2027-01-31",
      "2027-03-21",
      "2027-04-25",
      "2027-06-27",
      "2027-08-29",
      "2027-12-05",
      "2027-12-12",
      "2027-12-19",
    ]);
  });

  it("has all statutory days off including Wigilia", () => {
    const days = polishPublicHolidays(2026).map((h) => h.date).sort();
    expect(days).toEqual([
      "2026-01-01",
      "2026-01-06",
      "2026-04-05",
      "2026-04-06",
      "2026-05-01",
      "2026-05-03",
      "2026-05-24",
      "2026-06-04",
      "2026-08-15",
      "2026-11-01",
      "2026-11-11",
      "2026-12-24",
      "2026-12-25",
      "2026-12-26",
    ]);
  });

  it("filters by range and enabled layers", () => {
    const map = holidaysBetween("2026-12-01", "2027-01-10", ["public", "orthodox"]);
    expect(map.get("2026-12-24")?.[0]?.name).toMatch(/Wigilia/);
    expect(map.get("2027-01-07")?.[0]?.name).toMatch(/Рождество Христово/);
    expect(map.has("2026-12-06")).toBe(false); // trading layer is off
  });

  it("reads shift patterns typed with Д/Н/В", () => {
    expect(toPatternCode("ДДННВВВВ")).toBe("DDNNOOOO");
    expect(toPatternCode("д н в в")).toBe("DNOO");
    expect(toPatternCode("ВВВ")).toBeNull();
    expect(toPatternCode("ДX")).toBeNull();
  });
});

describe("calendar month with work shifts", () => {
  const base = [
    { path: /\/meta$/, body: meta() },
    { path: /\/me$/, body: me() },
    { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
    { path: /\/calendar\/occurrences$/, body: [] },
  ];

  it("opens on the month, colors shifts and cycles a day day→night→off", async () => {
    const today = todayIn("Europe/Warsaw");
    await act(() => router.navigate("/calendar"));
    setToken("tok");
    const m = mockFetch([
      ...base,
      { path: /\/calendar\/shifts$/, body: [{ day: today, kind: "day" }] },
      { method: "PUT", path: /\/calendar\/shifts\/\d{4}-\d\d-\d\d$/, status: 204 },
    ]);
    render(<App />);
    expect(await screen.findByRole("tab", { name: "Месяц" })).toHaveAttribute("aria-selected", "true");
    const cell = await screen.findByRole("button", { name: /Дневная смена/ });
    expect(cell).toHaveStyle({ background: "var(--shift-day)" });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Рабочий график и праздники" }));
    await user.click(await screen.findByRole("switch", { name: /Править смены касанием/ }));
    expect(await screen.findByText(/дневная → ночная → выходной/)).toBeInTheDocument();
    await user.click(cell);
    await waitFor(() => expect(m.calls.some((c) => c.method === "PUT")).toBe(true));
    const put = m.calls.find((c) => c.method === "PUT")!;
    expect(put.url.pathname.endsWith(`/calendar/shifts/${today}`)).toBe(true);
    expect(put.body).toEqual({ kind: "night" });
  });

  it("shows holiday names for the selected day", async () => {
    await act(() => router.navigate("/calendar"));
    setToken("tok");
    mockFetch([...base, { path: /\/calendar\/shifts$/, body: [] }]);
    render(<App />);
    await screen.findByRole("button", { name: "Следующий месяц" });
    // Go to December 2026 and pick Wigilia.
    const user = userEvent.setup();
    const target = "2026-12";
    for (let i = 0; i < 24 && !screen.queryByText(/декабрь 2026/i); i++) {
      const forward = todayIn("Europe/Warsaw").slice(0, 7) < target;
      await user.click(screen.getByRole("button", { name: forward ? "Следующий месяц" : "Предыдущий месяц" }));
    }
    await user.click(screen.getByRole("button", { name: /24 декабря.*Wigilia/ }));
    const chips = await screen.findAllByText(/Wigilia/);
    expect(chips.length).toBeGreaterThan(0);
    const trading = screen.getByRole("button", { name: /20 декабря.*Торговое воскресенье/ });
    expect(within(trading).getByText("🛒")).toBeInTheDocument();
  });
});
