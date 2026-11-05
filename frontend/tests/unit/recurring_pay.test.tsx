import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { makeQueryClient } from "@/app/App";
import { SessionProvider } from "@/app/session";
import { ThemeProvider } from "@/app/theme";
import { ToastProvider } from "@/components/ui";
import { RecurringTab } from "@/features/finance/RecurringTab";
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
const today = new Date().toISOString().slice(0, 10);
const rule = (accountId: string | null) => ({
  id: "r1", name: "Аренда", kind: "expense", amount: "3200.00", currency: "PLN", account_id: accountId, category_id: null, frequency: "monthly",
  interval: 1, start_date: today, end_date: null, remind_days_before: 1, auto_create: false, active: true, visibility: "family", next_due_date: today,
});
const scheduled = [{ id: "s1", rule_id: "r1", rule_name: "Аренда", kind: "expense", due_date: today, amount: "3200.00", currency: "PLN", status: "pending", transaction_id: null, overdue: false }];

function setup(accountId: string | null) {
  setToken("tok");
  return mockFetch([
    { path: /\/meta$/, body: meta() },
    { path: /\/me$/, body: me() },
    { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
    { path: /\/finance\/accounts$/, body: accounts },
    { path: /\/finance\/categories$/, body: [] },
    { path: /\/finance\/recurring$/, body: [rule(accountId)] },
    { path: /\/finance\/scheduled-payments$/, body: scheduled },
    { method: "POST", path: /\/scheduled-payments\/s1\/pay$/, handler: () => ({ ...scheduled[0], status: "paid" }) },
  ]);
}

describe("paying a scheduled payment", () => {
  it("asks for an account when the rule has none and sends it", async () => {
    const m = setup(null);
    render(wrap(<RecurringTab />));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Оплачено" }));
    const select = await screen.findByLabelText("Счёт");
    // only accounts with the rule's visibility are offered
    await waitFor(() => expect(select).toHaveValue("a1"));
    expect(screen.queryByRole("option", { name: "Моя карта" })).not.toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: "Оплачено" });
    await user.click(buttons.at(-1)!);
    await waitFor(() => expect(m.calls.some((c) => c.method === "POST" && c.url.pathname.endsWith("/pay"))).toBe(true));
    const call = m.calls.find((c) => c.method === "POST" && c.url.pathname.endsWith("/pay"))!;
    expect(call.body).toEqual({ account_id: "a1" });
  });

  it("uses the rule's own account without asking", async () => {
    const m = setup("a1");
    render(wrap(<RecurringTab />));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Оплачено" }));
    await screen.findByText("Отметить платёж оплаченным?");
    expect(screen.queryByLabelText("Счёт")).not.toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: "Оплачено" });
    await user.click(buttons.at(-1)!);
    await waitFor(() => expect(m.calls.some((c) => c.method === "POST" && c.url.pathname.endsWith("/pay"))).toBe(true));
    expect(m.calls.find((c) => c.method === "POST" && c.url.pathname.endsWith("/pay"))!.body).toEqual({});
  });
});
