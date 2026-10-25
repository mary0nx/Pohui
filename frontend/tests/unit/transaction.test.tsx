import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { makeQueryClient } from "@/app/App";
import { SessionProvider } from "@/app/session";
import { ThemeProvider, useTheme } from "@/app/theme";
import { ToastProvider } from "@/components/ui";
import { TransactionSheet } from "@/features/finance/TransactionSheet";
import { I18nProvider } from "@/i18n";
import { setToken } from "@/lib/session";

import { family, FAMILY_ID, me, meta, mockFetch } from "./helpers";

function wrap(ui: React.ReactNode) {
  const router = createMemoryRouter([{ path: "/", element: ui }]);
  return (
    <QueryClientProvider client={makeQueryClient()}>
      <I18nProvider>
        <ThemeProvider>
          <ToastProvider>
            <SessionProvider>
              <RouterProvider router={router} />
            </SessionProvider>
          </ToastProvider>
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

const accounts = [
  { id: "a1", name: "Наличные", kind: "cash", currency: "PLN", initial_balance: "0", balance: "0", visibility: "family", created_by: "u1", archived_at: null },
  { id: "a2", name: "Моя карта", kind: "card", currency: "PLN", initial_balance: "0", balance: "0", visibility: "private", created_by: "u1", archived_at: null },
];
const categories = [{ id: "c1", name: "Продукты", kind: "expense", parent_id: null, icon: null, color: null, archived_at: null }];

describe("transaction form", () => {
  it("validates the amount and posts a decimal string with an idempotency key", async () => {
    setToken("tok");
    const m = mockFetch([
      { path: /\/meta$/, body: meta() },
      { path: /\/me$/, body: me() },
      { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
      { path: /\/finance\/accounts$/, body: accounts },
      { path: /\/finance\/categories$/, body: categories },
      { method: "POST", path: /\/finance\/transactions$/, status: 201, handler: (b) => ({ id: "t1", ...(b as object) }) },
    ]);
    render(wrap(<TransactionSheet open onOpenChange={() => undefined} />));
    const amount = await screen.findByLabelText(/Сумма/);
    await waitFor(() => expect(screen.getByLabelText("Счёт")).toHaveValue("a1"));
    const user = userEvent.setup();
    await user.type(amount, "12,345");
    await user.click(screen.getByRole("button", { name: "Добавить" }));
    expect(await screen.findByText(/не более 2 знаков/)).toBeInTheDocument();

    await user.clear(amount);
    await user.type(amount, "45,50");
    await user.selectOptions(screen.getByLabelText("Категория"), "c1");
    await user.click(screen.getByRole("button", { name: "Добавить" }));
    await waitFor(() => expect(m.calls.some((c) => c.method === "POST")).toBe(true));
    const post = m.calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ kind: "expense", amount: "45.50", account_id: "a1", category_id: "c1" });
    expect((post.body as { occurred_at: string }).occurred_at).toMatch(/[+-]\d\d:\d\d$/);
    expect(post.headers["Idempotency-Key"]).toBeTruthy();
  });

  it("warns that private account operations are personal", async () => {
    setToken("tok");
    mockFetch([
      { path: /\/meta$/, body: meta() },
      { path: /\/me$/, body: me() },
      { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
      { path: /\/finance\/accounts$/, body: accounts },
      { path: /\/finance\/categories$/, body: categories },
    ]);
    render(wrap(<TransactionSheet open onOpenChange={() => undefined} />));
    await waitFor(() => expect(screen.getByLabelText("Счёт")).toHaveValue("a1"));
    await userEvent.selectOptions(screen.getByLabelText("Счёт"), "a2");
    expect(screen.getByText("Операции по личному счёту видны только вам.")).toBeInTheDocument();
  });
});

function ThemeProbe() {
  const { setMode, resolved } = useTheme();
  return (
    <button type="button" onClick={() => setMode(resolved === "dark" ? "light" : "dark")}>
      {resolved}
    </button>
  );
}

describe("theme", () => {
  it("switches between light and dark and persists the choice", async () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe("light");
    await userEvent.click(screen.getByRole("button", { name: "light" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("familyos.theme.v2")).toBe("dark");
  });
});
