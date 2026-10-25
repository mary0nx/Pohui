import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { App } from "@/app/App";
import { setToken } from "@/lib/session";

import { dashboard, family, FAMILY_ID, me, meta, mockFetch, totals } from "./helpers";

const base = [
  { path: /\/meta$/, body: meta() },
  { path: /\/me$/, body: me() },
  { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
  { path: /\/tasks$/, body: [] },
];

describe("app gate", () => {
  it("offers the explicit dev login outside Telegram in development", async () => {
    mockFetch([{ path: /\/meta$/, body: meta(true) }]);
    render(<App />);
    expect(await screen.findByText(/Режим разработки/)).toBeInTheDocument();
    expect(screen.getByText(/Это не Telegram-авторизация/)).toBeInTheDocument();
  });

  it("asks to open the app in Telegram when dev login is disabled", async () => {
    mockFetch([{ path: /\/meta$/, body: meta(false) }]);
    render(<App />);
    expect(await screen.findByText("Откройте приложение в Telegram")).toBeInTheDocument();
  });

  it("shows onboarding for a user without a family", async () => {
    setToken("tok");
    mockFetch([{ path: /\/meta$/, body: meta() }, { path: /\/me$/, body: me(false) }]);
    render(<App />);
    expect(await screen.findByText("Создайте семейное пространство")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Название"));
    await user.click(screen.getByRole("button", { name: "Создать" }));
    expect(await screen.findByText("Введите название")).toBeInTheDocument();
  });
});

describe("dashboard", () => {
  it("renders real data from the API", async () => {
    setToken("tok");
    mockFetch([
      ...base,
      {
        path: /\/dashboard$/,
        body: dashboard({
          is_empty: false,
          month_family: totals("80.00", "5000.00"),
          shopping: { list_id: "l1", list_name: "Продукты", needed_total: 3, items: ["Молоко", "Хлеб", "Яйца"] },
        }),
      },
    ]);
    render(<App />);
    expect(await screen.findByText(/Анна$/)).toBeInTheDocument();
    expect(screen.getByText(/4\s?920,00/)).toBeInTheDocument();
    const shopping = screen.getByRole("list", { name: "Что купить" });
    expect(within(shopping).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Молоко", "Хлеб", "Яйца"]);
    // Light is the default theme on first launch, even when the system is dark.
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.queryByText("Начните с первых данных")).not.toBeInTheDocument();
  });

  it("shows a helpful empty state", async () => {
    setToken("tok");
    mockFetch([...base, { path: /\/dashboard$/, body: dashboard() }]);
    render(<App />);
    expect(await screen.findByText("Начните с первых данных")).toBeInTheDocument();
  });

  it("shows an error with retry when the API fails", async () => {
    setToken("tok");
    let fail = true;
    mockFetch([
      ...base,
      {
        path: /\/dashboard$/,
        handler: () => (fail ? { error: { code: "x", message: "Сервер недоступен" } } : dashboard()),
        get status() {
          return fail ? 503 : 200;
        },
      },
    ]);
    render(<App />);
    expect(await screen.findByText("Сервер недоступен", {}, { timeout: 4000 })).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByText("Начните с первых данных")).toBeInTheDocument();
  });

  it("navigates between sections with the bottom bar", async () => {
    setToken("tok");
    mockFetch([
      ...base,
      { path: /\/dashboard$/, body: dashboard() },
      { path: /\/occurrences$/, body: [] },
      { path: /\/shopping\/lists$/, body: [] },
      { path: /\/tasks\/stats$/, body: dashboard().task_stats },
    ]);
    render(<App />);
    await screen.findByText("Начните с первых данных");
    const nav = screen.getByRole("navigation", { name: "Основная навигация" });
    await userEvent.click(within(nav).getByText("Календарь"));
    expect(await screen.findByRole("heading", { name: "Календарь" })).toBeInTheDocument();
    // The calendar opens on the month grid.
    expect(await screen.findByRole("button", { name: "Следующий месяц" })).toBeInTheDocument();
    await userEvent.click(within(nav).getByText("Дом"));
    expect(await screen.findByRole("heading", { name: "Покупки и дом" })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/home"));
  });
});
