import { describe, expect, it } from "vitest";

import * as content from "@/features/daily/content";
import { THEME_LABELS } from "@/features/daily/labels";
import { pageFor } from "@/features/daily/schedule";
import { buildWidgetScript, WIDGET_DAYS, widgetPages } from "@/features/daily/widget";

const SEED = "11111111-1111-1111-1111-111111111111";

/** A minimal stand-in for the Scriptable runtime, recording what the widget shows. */
function runInFakeScriptable(script: string, widgetFamily: string | undefined, now: string) {
  const texts: string[] = [];
  const made: { url?: string; refreshAfterDate?: Date; shown: boolean; set: boolean } = { shown: false, set: false };
  const stack = (): Record<string, unknown> => ({
    addText: (t: string) => (texts.push(t), {}),
    addStack: stack,
    addSpacer: () => undefined,
    centerAlignContent: () => undefined,
    layoutVertically: () => undefined,
  });
  class ListWidget {
    constructor() {
      Object.assign(this, stack(), {
        setPadding: () => undefined,
        presentMedium: async () => void (made.shown = true),
      });
      return new Proxy(this, { set: (t, k, v) => ((made as Record<string, unknown>)[k as string] = v, Reflect.set(t, k, v)) });
    }
  }
  class Color {
    constructor(public hex: string) {}
    static dynamic(a: Color) {
      return a;
    }
  }
  const font = () => ({});
  const Font = { mediumSystemFont: font, systemFont: font, heavyRoundedSystemFont: font, semiboldRoundedSystemFont: font, mediumRoundedSystemFont: font };
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...args: unknown[]) {
      super(...((args.length ? args : [now]) as []));
    }
  }
  const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor;
  const run = new AsyncFunction("ListWidget", "Color", "Font", "config", "Script", "Date", script);
  return run(ListWidget, Color, Font, { widgetFamily, runsInWidget: widgetFamily !== undefined }, { setWidget: () => void (made.set = true), complete: () => undefined }, FakeDate).then(() => ({ texts, made }));
}

describe("«Листочек дня» widget for Scriptable", () => {
  it("contains the app's pages for the next days and nothing else", () => {
    const pages = widgetPages(content, SEED, "2026-10-26");
    expect(Object.keys(pages)).toHaveLength(WIDGET_DAYS);
    for (const date of ["2026-10-26", "2026-12-31", "2027-01-01", "2027-11-29"]) {
      const p = pageFor(content, SEED, date);
      expect(pages[date]).toEqual([{ spring: "p", summer: "s", autumn: "a", winter: "w" }[p.season], THEME_LABELS[p.theme], p.text]);
    }
    const script = buildWidgetScript({ content, seed: SEED, from: "2026-10-26", timeZone: "Europe/Warsaw", appUrl: "https://my-family-app.pages.dev/" });
    expect(script).not.toContain(SEED); // the family id stays in the app
    expect(script.length).toBeLessThan(120_000);
  });

  it("shows today's page in a home-screen widget and opens the app on tap", async () => {
    const script = buildWidgetScript({ content, seed: SEED, from: "2026-10-26", timeZone: "Europe/Warsaw", appUrl: "https://my-family-app.pages.dev/" });
    const { texts, made } = await runInFakeScriptable(script, "medium", "2026-11-03T09:00:00Z");
    const p = pageFor(content, SEED, "2026-11-03");
    expect(texts).toContain("3");
    expect(texts).toContain("ноября");
    expect(texts).toContain(p.text);
    expect(made.url).toBe("https://my-family-app.pages.dev/");
    expect(made.set).toBe(true);
    expect(made.refreshAfterDate).toBeInstanceOf(Date);
  });

  it("lock screen shows only the phrase; outside a widget it shows a preview", async () => {
    const script = buildWidgetScript({ content, seed: SEED, from: "2026-10-26", timeZone: "Europe/Warsaw", appUrl: "https://my-family-app.pages.dev/" });
    const lock = await runInFakeScriptable(script, "accessoryRectangular", "2026-10-26T20:00:00Z");
    expect(lock.texts).toEqual([pageFor(content, SEED, "2026-10-26").text]);
    const preview = await runInFakeScriptable(script, undefined, "2026-10-27T08:00:00Z");
    expect(preview.made.shown).toBe(true);
  });

  it("asks for a new script once its pages run out", async () => {
    const script = buildWidgetScript({ content, seed: SEED, from: "2026-10-26", timeZone: "Europe/Warsaw", appUrl: "https://my-family-app.pages.dev/", days: 3 });
    const { texts } = await runInFakeScriptable(script, "small", "2026-10-30T10:00:00Z");
    expect(texts[0]).toContain("закончились (2026-10-28)");
    expect(texts[1]).toContain("скопируйте новый скрипт");
  });
});

describe("widget page", () => {
  it("copies a ready script for Scriptable", async () => {
    const { act, render, screen, waitFor } = await import("@testing-library/react");
    const userEvent = (await import("@testing-library/user-event")).default;
    const { vi } = await import("vitest");
    const { App } = await import("@/app/App");
    const { router } = await import("@/app/routes");
    const { setToken } = await import("@/lib/session");
    const { family, FAMILY_ID, me, meta, mockFetch } = await import("./helpers");
    await act(() => router.navigate("/profile/widget"));
    setToken("tok");
    mockFetch([
      { path: /\/meta$/, body: meta() },
      { path: /\/me$/, body: me() },
      { path: new RegExp(`/families/${FAMILY_ID}$`), body: family },
    ]);
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Скопировать скрипт" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const script = writeText.mock.calls[0]![0] as string;
    expect(script).toMatch(/^\/\/ Family OS — «Листочек дня»/);
    expect(script).not.toContain(FAMILY_ID);
    expect(await screen.findByText(/Скрипт скопирован/)).toBeInTheDocument();
    expect(screen.getByLabelText("Так будет выглядеть виджет")).toBeInTheDocument();
    await act(() => router.navigate("/"));
  });
});
