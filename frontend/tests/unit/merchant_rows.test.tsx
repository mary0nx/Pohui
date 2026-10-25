import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { makeQueryClient } from "@/app/App";
import { SessionProvider } from "@/app/session";
import { ThemeProvider } from "@/app/theme";
import { ToastProvider } from "@/components/ui";
import { MerchantIcon } from "@/features/finance/merchants/MerchantIcon";
import { transactionIcon } from "@/features/finance/merchants/registry";
import { TransactionsTab } from "@/features/finance/TransactionsTab";
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

const accounts = [{ id: "a1", name: "Карта", kind: "card", currency: "PLN", initial_balance: "0", balance: "0", visibility: "family", created_by: "u1", archived_at: null }];
const categories = [
  { id: "c1", name: "Продукты", kind: "expense", parent_id: null, icon: "shopping-basket", color: null, archived_at: null },
  { id: "c2", name: "Транспорт", kind: "expense", parent_id: null, icon: "car", color: null, archived_at: null },
];
const base = { currency: "PLN", account_id: "a1", to_account_id: null, payment_method: "card", visibility: "family", created_by: "u1", receipt_document_id: null, scheduled_payment_id: null, created_at: "2026-10-25T10:00:00Z" };
const items = [
  { ...base, id: "t1", kind: "expense", amount: "53.68", category_id: "c1", occurred_at: "2026-10-25T18:07:00Z", merchant: "LIDL POLSKA 1234", description: "Mastercard ••4821 · Wrocław" },
  { ...base, id: "t2", kind: "expense", amount: "12.40", category_id: "c1", occurred_at: "2026-10-25T17:00:00Z", merchant: "Delikatesy S.c.", description: null },
  { ...base, id: "t3", kind: "refund", amount: "199.99", category_id: null, occurred_at: "2026-10-25T16:00:00Z", merchant: "ZALANDO SE", description: "Zwrot" },
  {
    ...base,
    id: "t4",
    kind: "expense",
    amount: "1234567.89",
    category_id: "c2",
    occurred_at: "2026-10-25T15:00:00Z",
    merchant: "BARDZO DŁUGA NAZWA FIRMY TRANSPORTOWEJ SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ ODDZIAŁ WROCŁAW 0001",
    description: null,
  },
];

describe("transaction history with merchant icons", () => {
  it("shows the shop logo or the illustration, the brand name and unchanged amounts", async () => {
    setToken("tok");
    mockFetch([
      { path: /\/meta$/, body: meta() },
      { path: /\/me$/, body: me() },
      { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
      { path: /\/finance\/accounts$/, body: accounts },
      { path: /\/finance\/categories$/, body: categories },
      { path: /\/finance\/transactions$/, body: { items, total: items.length } },
    ]);
    render(wrap(<TransactionsTab />));
    const lidl = (await screen.findByText("Lidl")).closest("button")!;
    await waitFor(() => expect(lidl.querySelector("img")?.getAttribute("src")).toBe("/assets/brands/lidl.svg"));
    expect(within(lidl).getByText("Mastercard ••4821 · Wrocław")).toBeInTheDocument(); // the description stays
    expect(lidl.textContent).toMatch(/−53,68\s*PLN/); // 19: amount and sign as before

    const local = screen.getByText("Delikatesy S.c.").closest("button")!;
    expect(local.querySelector("img")?.getAttribute("src")).toBe("/assets/categories/grocery-basket.svg");

    const refund = screen.getByText("Zalando").closest("button")!;
    expect(refund.querySelector("img")?.getAttribute("src")).toBe("/assets/brands/zalando.svg");
    expect(refund.textContent).toMatch(/\+199,99\s*PLN/);

    // 20: long names wrap (two lines) and big sums are never cut with an ellipsis.
    const long = screen.getByText(/BARDZO DŁUGA NAZWA/).closest("button")!;
    expect(long.querySelector("img")?.getAttribute("src")).toBe("/assets/categories/transport.svg");
    expect(screen.getByText(/BARDZO DŁUGA NAZWA/).className).toContain("line-clamp-2");
    const amount = [...long.querySelectorAll("span")].find((s) => /1\s234\s567,89/.test(s.textContent ?? "") && s.children.length === 0)!;
    expect(amount.className).toContain("whitespace-nowrap");
    expect(amount.className).not.toContain("truncate");
    expect(amount.textContent).toMatch(/−1\s234\s567,89\s*PLN/);
  });
});

describe("missing image files", () => {
  it("15: a logo that fails to load falls back to the category picture, then to a built-in icon", () => {
    const icon = transactionIcon({ kind: "expense", merchant: "LIDL POLSKA 1234" });
    const { container } = render(<MerchantIcon icon={icon} />);
    const img = () => container.querySelector("img");
    expect(img()!.getAttribute("src")).toBe("/assets/brands/lidl.svg");
    fireEvent.error(img()!);
    expect(img()!.getAttribute("src")).toBe("/assets/categories/grocery-basket.svg");
    fireEvent.error(img()!);
    expect(img()).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull(); // never an empty circle or a broken image
  });

  it("keeps the picture's proportions and a fixed size", () => {
    const { container } = render(<MerchantIcon icon={transactionIcon({ kind: "expense", merchant: "IKEA" })} size={44} />);
    const img = container.querySelector("img")!;
    expect(img.className).toContain("object-contain");
    expect(img.getAttribute("width")).toBe("44");
    expect(img.getAttribute("height")).toBe("44");
  });
});
