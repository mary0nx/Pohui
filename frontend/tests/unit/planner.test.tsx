import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "@/app/App";
import { router } from "@/app/routes";
import { shortDayLabel } from "@/components/WeekPlanner";
import { setToken } from "@/lib/session";
import { addDays, todayIn, weekdayIndex } from "@/lib/time";

import { dashboard, family, FAMILY_ID, me, meta, mockFetch } from "./helpers";

const TZ = "Europe/Warsaw";
const base = (ai = false) => [
  { path: /\/meta$/, body: { ...meta(), ai_available: ai } },
  { path: /\/me$/, body: me() },
  { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
];

async function open(path: string) {
  await act(() => router.navigate(path));
  setToken("tok");
}

afterEach(async () => {
  await act(() => router.navigate("/"));
  document.documentElement.removeAttribute("data-palette");
  localStorage.clear();
});

const item = (over: Record<string, unknown>) => ({
  id: "i1",
  list_id: "l1",
  name: "Молоко",
  quantity: null,
  unit: null,
  category: null,
  note: null,
  estimated_price: null,
  store: null,
  status: "needed",
  added_by: "u1",
  bought_by: null,
  bought_at: null,
  position: 1,
  planned_for: null,
  updated_at: "2026-10-01T00:00:00Z",
  ...over,
});

const listDetail = (items: unknown[]) => ({
  id: "l1",
  name: "Продукты",
  archived_at: null,
  items_needed: items.length,
  items_total: items.length,
  updated_at: "2026-10-01T00:00:00Z",
  created_at: "2026-10-01T00:00:00Z",
  items,
  estimated_total: "0",
});

describe("AI hidden while it is not configured", () => {
  it("shows no assistant button or prompt and redirects /assistant home", async () => {
    await open("/assistant");
    mockFetch([...base(false), { path: /\/dashboard$/, body: dashboard() }]);
    render(<App />);
    expect(await screen.findByText("Начните с первых данных")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    expect(screen.queryByRole("link", { name: "AI-ассистент" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Спросите ассистента/)).not.toBeInTheDocument();
  });

  it("brings the assistant back once the server has AI", async () => {
    await open("/");
    mockFetch([...base(true), { path: /\/dashboard$/, body: dashboard() }]);
    render(<App />);
    expect(await screen.findByRole("link", { name: "AI-ассистент" })).toBeInTheDocument();
    expect(await screen.findByText(/Спросите ассистента/)).toBeInTheDocument();
  });
});

describe("color palettes", () => {
  it("applies and remembers the chosen palette", async () => {
    await open("/profile");
    mockFetch([...base(), { path: /\/invitations$/, body: [] }]);
    render(<App />);
    const ocean = await screen.findByRole("radio", { name: "Океан" });
    expect(screen.getByRole("radio", { name: "Мята" })).toHaveAttribute("aria-checked", "true");
    await userEvent.setup().click(ocean);
    expect(ocean).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.palette).toBe("ocean");
    expect(localStorage.getItem("familyos.palette")).toBe("ocean");
  });
});

describe("day labels", () => {
  it("uses Russian weekday abbreviations", () => {
    expect(shortDayLabel("2026-10-24")).toBe("Сб, 24 окт");
    expect(shortDayLabel("2026-10-26")).toBe("Пн, 26 окт");
    expect(shortDayLabel("2026-11-01")).toBe("Вс, 1 ноя");
  });
});

describe("shopping by day", () => {
  it("shows items under their day and adds new ones for a chosen day", async () => {
    const today = todayIn(TZ);
    // Another day of the same (Monday-based) week: tomorrow, or yesterday on Sundays.
    const other = weekdayIndex(today) < 6 ? addDays(today, 1) : addDays(today, -1);
    await open("/home/shopping/l1?view=week");
    const m = mockFetch([
      ...base(),
      { path: /\/shopping\/lists\/l1$/, body: listDetail([item({ planned_for: today }), item({ id: "i2", name: "Без дня" })]) },
      { method: "POST", path: /\/shopping\/lists\/l1\/items\/bulk$/, body: [item({ id: "i3", name: "Хлеб", planned_for: other })] },
    ]);
    render(<App />);
    const todaySection = await screen.findByRole("region", { name: new RegExp(`${Number(today.slice(8))} `) });
    expect(within(todaySection).getByText("Молоко")).toBeInTheDocument();
    expect(within(todaySection).getByText("сегодня")).toBeInTheDocument();
    expect(screen.queryByText("Без дня")).not.toBeInTheDocument();

    const user = userEvent.setup();
    const plusButtons = screen.getAllByRole("button", { name: /Добавить покупку/ });
    const todayIndex = plusButtons.findIndex((b) => b.closest("section") === todaySection);
    await user.click(plusButtons[other > today ? todayIndex + 1 : todayIndex - 1]!);
    await user.type(await screen.findByLabelText("Что купить"), "хлеб");
    await user.click(screen.getByRole("button", { name: "Добавить" }));
    await waitFor(() => expect(m.calls.some((c) => c.method === "POST")).toBe(true));
    const post = m.calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ text: "хлеб", planned_for: other });
  });
});

describe("tasks by day", () => {
  it("lists open tasks under their due day and pre-fills the date for a new one", async () => {
    const today = todayIn(TZ);
    await open("/home/tasks?view=week");
    mockFetch([
      ...base(),
      { path: /\/tasks\/stats$/, body: { done_this_week: 0, points_this_week: 0, done_this_month: 0, points_this_month: 0, open_total: 1, overdue_total: 0 } },
      {
        path: /\/tasks$/,
        body: [
          {
            id: "t1",
            title: "Вынести мусор",
            description: null,
            assignee_id: null,
            due_at: `${today}T18:00:00Z`,
            priority: "normal",
            category: null,
            status: "todo",
            points: null,
            recurrence_freq: null,
            recurrence_interval: 1,
            completed_at: null,
            completed_by: null,
            visibility: "family",
            created_by: "u1",
            created_at: "2026-10-01T00:00:00Z",
            updated_at: "2026-10-01T00:00:00Z",
            overdue: false,
            comments_count: 0,
          },
        ],
      },
    ]);
    render(<App />);
    const todaySection = await screen.findByRole("region", { name: new RegExp(`${Number(today.slice(8))} `) });
    expect(await within(todaySection).findByText("Вынести мусор")).toBeInTheDocument();
    await userEvent.setup().click(within(todaySection).getByRole("button", { name: /Добавить задачу/ }));
    expect(await screen.findByLabelText("Срок")).toHaveValue(today);
  });
});
