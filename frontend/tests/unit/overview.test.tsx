import { act, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "@/app/App";
import { router } from "@/app/routes";
import { setToken } from "@/lib/session";

import { family, FAMILY_ID, me, meta, mockFetch, totals } from "./helpers";

afterEach(async () => {
  await act(() => router.navigate("/"));
});

const cat = (id: string | null, name: string, amount: string) => ({ category_id: id, name, icon: null, color: null, amount, budget: null });

describe("finance overview", () => {
  it("keeps categories where refunds outweigh expenses out of the chart and says so", async () => {
    await act(() => router.navigate("/finance"));
    setToken("tok");
    mockFetch([
      { path: /\/meta$/, body: meta() },
      { path: /\/me$/, body: me() },
      { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
      { path: /\/finance\/accounts$/, body: [] },
      { path: /\/finance\/categories$/, body: [] },
      {
        path: /\/finance\/summary$/,
        body: {
          month: "2026-10-01",
          currency: "PLN",
          family: totals("258.41", "8500"),
          personal: totals("0", "0"),
          by_category: [cat("c1", "Транспорт", "236.15"), cat("c2", "Продукты", "94.75"), cat(null, "Без категории", "-72.49")],
          by_member: [],
          daily: [],
          history: [],
          budget: null,
          category_alerts: [],
          other_currency_count: 0,
        },
      },
    ]);
    render(<App />);
    const card = (await screen.findByText("Расходы по категориям")).closest("div.rounded-card, div[class*='rounded-card']")!;
    const legend = within(card as HTMLElement).getAllByRole("listitem").map((li) => li.textContent);
    expect(legend).toHaveLength(2);
    expect(legend.join(" ")).not.toMatch(/−72|-72/);
    expect(await screen.findByText(/Возвратов больше, чем расходов: Без категории \+72,49/)).toBeInTheDocument();
  });
});
