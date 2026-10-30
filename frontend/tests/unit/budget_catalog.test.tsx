import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "@/app/App";
import { router } from "@/app/routes";
import { ProductThumb } from "@/features/catalog/thumb";
import { parseAmount } from "@/features/finance/BudgetSheet";
import { setToken } from "@/lib/session";

import { dashboard, family, FAMILY_ID, me, meta, mockFetch, totals } from "./helpers";

const base = [
  { path: /\/meta$/, body: meta() },
  { path: /\/me$/, body: me() },
  { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
  { path: /\/tasks$/, body: [] },
];

afterEach(async () => {
  await act(() => router.navigate("/"));
});

function stats() {
  return within(screen.getByLabelText("Бюджет месяца"));
}

describe("budget card on the home screen", () => {
  it("A: shows the limit, the spent money as a minus and the remaining budget", async () => {
    setToken("tok");
    mockFetch([
      ...base,
      {
        path: /\/dashboard$/,
        body: dashboard({
          is_empty: false,
          month_family: totals("2.50", "0"),
          budget: { limit: "500.00", spent: "2.50", remaining: "497.50", percent: 0.5, level: "ok" },
        }),
      },
    ]);
    render(<App />);
    await screen.findByLabelText("Бюджет месяца");
    expect(stats().getByText(/^500,00/)).toBeInTheDocument();
    expect(stats().getByText(/^−2,50/)).toBeInTheDocument();
    expect(stats().getByText(/^497,50/)).toBeInTheDocument();
    expect(screen.getByText("Осталось")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/−−|--/); // the minus is never doubled
  });

  it("C: an exceeded budget shows a negative remainder and says so", async () => {
    setToken("tok");
    mockFetch([
      ...base,
      {
        path: /\/dashboard$/,
        body: dashboard({
          is_empty: false,
          month_family: totals("520.00", "0"),
          budget: { limit: "500.00", spent: "520.00", remaining: "-20.00", percent: 104, level: "exceeded" },
        }),
      },
    ]);
    render(<App />);
    expect(await screen.findByText("Перерасход")).toBeInTheDocument();
    expect(screen.getByText(/Превышение на 20,00/)).toBeInTheDocument();
    expect(stats().getByText(/^−20,00/)).toBeInTheDocument();
    expect(stats().getByText(/^−520,00/)).toBeInTheDocument();
  });

  it("D + set: no invented budget; the form saves it through the API", async () => {
    setToken("tok");
    let budget: unknown = null;
    const m = mockFetch([
      ...base,
      {
        path: /\/dashboard$/,
        handler: () => dashboard({ is_empty: false, month_family: totals("2.50", "0"), budget }),
      },
      {
        method: "PUT",
        path: /\/finance\/budgets$/,
        handler: (body: unknown) => {
          const b = body as { limit_amount: string };
          budget = { limit: b.limit_amount, spent: "2.50", remaining: String(Number(b.limit_amount) - 2.5), percent: 0.5, level: "ok" };
          return [];
        },
      },
    ]);
    render(<App />);
    expect(await screen.findByText("Бюджет не задан")).toBeInTheDocument();
    // The spent amount is shown as spending (with a minus), not as a budget.
    expect(screen.getByText(/Потрачено в этом месяце/).textContent).toMatch(/−2,50/);
    expect(screen.queryByLabelText("Бюджет месяца")).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Задать бюджет" }));
    const input = await screen.findByLabelText(/Бюджет на месяц/);
    await user.type(input, "abc");
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    await user.clear(input);
    await user.type(input, "500");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(m.calls.some((c) => c.method === "PUT")).toBe(true));
    const put = m.calls.find((c) => c.method === "PUT")!;
    expect(put.body).toMatchObject({ limit_amount: "500" });
    expect((put.body as { month: string }).month).toMatch(/^\d{4}-\d{2}-01$/);
    // After the server confirmed, the card shows the stored budget and the recalculated rest.
    expect(await screen.findByLabelText("Бюджет месяца")).toBeInTheDocument();
    expect(stats().getByText(/^497,50/)).toBeInTheDocument();
  });

  it("parses amounts typed with commas and spaces, and rejects garbage", () => {
    expect(parseAmount("500")).toBe("500");
    expect(parseAmount("1 250,50")).toBe("1250.50");
    expect(parseAmount("12,345")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
  });
});

describe("products on the home screen", () => {
  it("lists needed items with thumbnails and marks one bought through the API", async () => {
    setToken("tok");
    const m = mockFetch([
      ...base,
      {
        path: /\/dashboard$/,
        body: dashboard({
          is_empty: false,
          shopping: {
            list_id: "l1",
            list_name: "Продукты",
            needed_total: 2,
            items: ["Молоко", "Киноа"],
            entries: [
              { id: "i1", name: "Молоко", quantity: "2.000", unit: "л", image: "local:milk.svg", category: "Молочные продукты и яйца", status: "needed" },
              { id: "i2", name: "Киноа", quantity: null, unit: null, image: null, category: null, status: "needed" },
            ],
          },
        }),
      },
      { method: "PATCH", path: /\/shopping\/lists\/l1\/items\/i1$/, body: {} },
    ]);
    render(<App />);
    const list = await screen.findByRole("list", { name: "Что купить" });
    expect(list.querySelector('img[src="/products/milk.svg"]')).not.toBeNull();
    expect(within(list).getByText("2 л")).toBeInTheDocument();
    await userEvent.click(within(list).getByRole("checkbox", { name: "Купить Молоко" }));
    await waitFor(() => expect(m.calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(m.calls.find((c) => c.method === "PATCH")!.body).toEqual({ status: "bought" });
  });
});

describe("compact home screen", () => {
  it("shows up to four products with the count in the title and full large sums", async () => {
    setToken("tok");
    const names = ["Молоко", "Хлеб", "Яйца", "Сыр", "Бананы", "Кофе"];
    mockFetch([
      ...base,
      {
        path: /\/dashboard$/,
        body: dashboard({
          is_empty: false,
          month_family: totals("1234567.89", "9876543.21"),
          shopping: {
            list_id: "l1",
            list_name: "Продукты",
            needed_total: 7,
            items: names,
            entries: names.map((n, i) => ({ id: `i${i}`, name: n, quantity: null, unit: null, image: null, category: null, status: "needed" })),
          },
        }),
      },
    ]);
    render(<App />);
    const list = await screen.findByRole("list", { name: "Что купить" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("heading", { name: /Продукты\s*7 товаров/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Добавить товар · ещё 3 в списке/ })).toHaveAttribute("href", "/home/shopping/l1");
    expect(screen.getByRole("link", { name: /Весь список/ })).toHaveAttribute("href", "/home/shopping/l1");
    // Large sums are shown in full (wrapped if needed, never cut with an ellipsis).
    const tiles = screen.getByLabelText("Доходы и расходы месяца");
    const text = tiles.textContent!.replace(/\s/g, " ");
    expect(text).toContain("+9 876 543,21");
    expect(text).toContain("−1 234 567,89");
    expect(tiles.querySelector(".truncate")).toBeNull();
  });
});

describe("catalogue in the shopping list", () => {
  it("suggests catalogue products with pictures while typing and adds the chosen one", async () => {
    await act(() => router.navigate("/home/shopping/l1"));
    setToken("tok");
    const detail = { id: "l1", name: "Продукты", archived_at: null, created_by: null, created_at: "", updated_at: "", items_needed: 0, items_total: 0, items: [], estimated_total: "0" };
    const m = mockFetch([
      ...base,
      { path: /\/shopping\/lists\/l1$/, body: detail },
      {
        path: /\/catalog$/,
        handler: (_b: unknown, url: URL) => ({
          items: url.searchParams.get("q") === "мол" ? [{ id: "milk", name: "Молоко", name_pl: "Mleko", category: "dairy", category_label: "Молочные продукты и яйца", unit: "л", image: "local:milk.svg" }] : [],
          external: [],
          external_enabled: false,
        }),
      },
      { method: "POST", path: /\/shopping\/lists\/l1\/items$/, body: [] },
    ]);
    render(<App />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Новый товар"), "мол");
    const suggestions = await screen.findByRole("list", { name: "Подходящие товары из каталога" }, { timeout: 3000 });
    // One debounced request for the whole word, not one per letter.
    expect(m.calls.filter((c) => c.url.pathname.endsWith("/catalog")).length).toBe(1);
    await user.click(within(suggestions).getByRole("button", { name: /Молоко/ }));
    await waitFor(() => expect(m.calls.some((c) => c.method === "POST")).toBe(true));
    expect(m.calls.find((c) => c.method === "POST")!.body).toEqual({ name: "Молоко", catalog_id: "milk" });
  });
});

describe("product thumbnail", () => {
  it("falls back to the category picture, then to an icon", () => {
    const { container } = render(<ProductThumb image="local:milk.svg" category="Напитки" />);
    const img = () => container.querySelector("img");
    expect(img()!.getAttribute("src")).toBe("/products/milk.svg");
    fireEvent.error(img()!);
    expect(img()!.getAttribute("src")).toBe("/products/category-drinks.svg"); // category picture
    fireEvent.error(img()!);
    expect(img()).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull(); // basket icon
  });

  it("fills the tile with a bundled illustration and supports hand-made PNGs", () => {
    const { container } = render(<ProductThumb image="local:asparagus.png" size={40} />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/products/asparagus.png");
    expect(img.style.width).toBe("40px");
  });

  it("shows the category picture for retired Twemoji codes on older items", () => {
    const { container } = render(<ProductThumb image="local:1f95b" category="Молочные продукты и яйца" />);
    expect(container.querySelector("img")!.getAttribute("src")).toBe("/products/category-dairy.svg");
  });

  it("never renders arbitrary image references", () => {
    const { container } = render(<ProductThumb image="javascript:alert(1)" />);
    expect(container.querySelector("img")).toBeNull();
  });
});
