import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "@/app/App";
import { useToday } from "@/features/daily/api";
import * as content from "@/features/daily/content";
import { pageFor } from "@/features/daily/schedule";
import { setToken } from "@/lib/session";
import { todayIn } from "@/lib/time";

import { dashboard, family, FAMILY_ID, me, meta, mockFetch } from "./helpers";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100"><circle class="leaf-test" cx="60" cy="50" r="20"/></svg>';

function routes(extra: Parameters<typeof mockFetch>[0] = [], art: "ok" | "missing" = "ok") {
  return [
    { path: /\/meta$/, body: { ...meta(), bot_username: "pohui_family_bot" } },
    { path: /\/me$/, body: me() },
    { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
    { path: /\/tasks$/, body: [] },
    { path: /\/dashboard$/, body: dashboard() },
    ...(art === "ok" ? [{ path: /^\/daily\/[a-z]+-[a-z]+\.svg$/, raw: { text: SVG, contentType: "image/svg+xml" } }] : []),
    ...extra,
  ];
}

afterEach(() => {
  vi.useRealTimers();
});

describe("«Листочек дня» on the home screen", () => {
  it("shows today's page for the family with its picture, above the finances", async () => {
    setToken("tok");
    const m = mockFetch(routes());
    render(<App />);
    const today = pageFor(content, FAMILY_ID, todayIn("Europe/Warsaw"));
    const card = await screen.findByRole("button", { name: /^Листочек дня/ });
    expect(within(card).getByText(today.text)).toBeInTheDocument();
    expect(card.textContent).toContain(String(Number(today.date.slice(8))));
    await waitFor(() => expect(card.querySelector(".leaf-test")).not.toBeNull());
    expect(m.calls.some((c) => c.url.pathname === `/daily/${today.art}.svg`)).toBe(true);
    // Compact: placed before the budget card, no favourites request until opened.
    const budget = screen.getByText(/^Бюджет · /);
    expect(card.compareDocumentPosition(budget) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(m.calls.some((c) => c.url.pathname.endsWith("/daily-favorites"))).toBe(false);
  });

  it("falls back to a built-in picture when the illustration cannot load", async () => {
    setToken("tok");
    mockFetch(routes([], "missing"));
    render(<App />);
    const card = await screen.findByRole("button", { name: /^Листочек дня/ });
    // The picture is retried once (≈1 s) before the built-in one is shown.
    await waitFor(() => expect(card.querySelector("svg[viewBox='0 0 120 100']")).not.toBeNull(), { timeout: 4000 });
    expect(card.querySelector(".leaf-test")).toBeNull();
  });

  it("opens the full page, saves the phrase to favourites through the API and shares as text", async () => {
    setToken("tok");
    const today = pageFor(content, FAMILY_ID, todayIn("Europe/Warsaw"));
    let saved: unknown[] = [];
    const m = mockFetch(
      routes([
        { path: /\/me\/daily-favorites$/, handler: () => saved },
        {
          method: "PUT",
          path: /\/me\/daily-favorites\/[a-z]+-\d+$/,
          handler: (body: unknown, url: URL) => {
            const b = body as { text: string; day: string };
            saved = [{ phrase_id: url.pathname.split("/").pop(), text: b.text, day: b.day, created_at: "2026-10-25T10:00:00Z" }];
            return saved[0];
          },
        },
      ]),
    );
    render(<App />);
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(await screen.findByRole("button", { name: /^Листочек дня/ }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText(today.text)).toBeInTheDocument();
    expect(within(sheet).getByText(today.idea)).toBeInTheDocument();
    const fav = await within(sheet).findByRole("button", { name: "В избранное" });
    await waitFor(() => expect(fav).toBeEnabled());
    await user.click(fav);
    await waitFor(() => expect(m.calls.some((c) => c.method === "PUT")).toBe(true));
    const put = m.calls.find((c) => c.method === "PUT")!;
    expect(put.url.pathname).toBe(`/api/v1/me/daily-favorites/${today.id}`);
    expect(put.body).toEqual({ text: today.text, day: today.date });
    expect(await within(sheet).findByRole("button", { name: "В избранном" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(sheet).getByRole("button", { name: "Поделиться" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0]![0]).toContain(today.text);
  });
});

describe("the date of the page", () => {
  function Probe() {
    return <p data-testid="d">{useToday("Europe/Warsaw")}</p>;
  }

  it("turns over at local midnight while the app stays open", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // 23:59:40 in Warsaw (UTC+1 after the October clock change).
    vi.setSystemTime(new Date("2026-10-25T22:59:40Z"));
    render(<Probe />);
    expect(screen.getByTestId("d").textContent).toBe("2026-10-25");
    await act(async () => {
      vi.setSystemTime(new Date("2026-10-25T23:00:05Z"));
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByTestId("d").textContent).toBe("2026-10-26");
  });
});
