import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/app/theme";
import { CheckCircle, Collapse, EmptyState, ProgressRing } from "@/components/ui";
import { celebrate, forgetTaskDone, recordTaskDone, STREAK_SIZE } from "@/lib/motion";

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("celebrations", () => {
  it("adds a short-lived confetti layer and removes it", () => {
    vi.useFakeTimers();
    mockReducedMotion(false);
    celebrate({ x: 100, y: 100 });
    const layer = document.querySelector('[aria-hidden="true"]');
    expect(layer?.querySelectorAll(".confetti-piece").length).toBe(28);
    vi.advanceTimersByTime(1400);
    expect(document.querySelector(".confetti-piece")).toBeNull();
  });

  it("does nothing when the user prefers reduced motion", () => {
    mockReducedMotion(true);
    celebrate();
    expect(document.querySelector(".confetti-piece")).toBeNull();
  });
});

describe("progress and checks", () => {
  it("exposes progress to assistive technology", () => {
    render(<ProgressRing value={62.4} label="Бюджет" />);
    const ring = screen.getByRole("progressbar", { name: "Бюджет" });
    expect(ring).toHaveAttribute("aria-valuenow", "62");
  });

  it("draws the check only when checked", () => {
    const { container, rerender } = render(<CheckCircle checked={false} />);
    expect(container.querySelector(".check-draw")).toBeNull();
    rerender(<CheckCircle checked />);
    expect(container.querySelector(".check-draw")).not.toBeNull();
    expect(container.querySelector(".animate-check")).not.toBeNull();
  });
});

describe("task streak", () => {
  it("celebrates every few tasks finished within a short while", () => {
    const t0 = 1_000_000;
    const results = Array.from({ length: STREAK_SIZE }, (_, i) => recordTaskDone(t0 + i * 1000));
    expect(results).toEqual([...Array(STREAK_SIZE - 1).fill(false), true]);
    // Tasks finished far apart do not make a streak.
    expect(recordTaskDone(t0 + 60 * 60_000)).toBe(false);
    expect(recordTaskDone(t0 + 2 * 60 * 60_000)).toBe(false);
  });

  it("an undone task leaves the streak", () => {
    const t0 = 10_000_000;
    recordTaskDone(t0);
    recordTaskDone(t0 + 1000);
    forgetTaskDone();
    expect(recordTaskDone(t0 + 2000)).toBe(false);
  });
});

describe("cozy surfaces", () => {
  it("collapsed content is hidden from interaction until opened", () => {
    const { container, rerender } = render(
      <Collapse open={false}>
        <button type="button">Внутри</button>
      </Collapse>,
    );
    const panel = container.querySelector(".collapse-panel")!;
    expect(panel).toHaveAttribute("data-open", "false");
    expect(panel).toHaveAttribute("inert");
    rerender(
      <Collapse open>
        <button type="button">Внутри</button>
      </Collapse>,
    );
    expect(panel).toHaveAttribute("data-open", "true");
    expect(panel).not.toHaveAttribute("inert");
  });

  it("empty states show an illustration, a sentence and the add action", () => {
    const { container } = render(<EmptyState art="basket" title="Список пуст" text="Добавьте товары" action={<button type="button">Добавить</button>} />);
    expect(container.querySelector("svg[aria-hidden]")).not.toBeNull();
    expect(screen.getByText("Список пуст")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить" })).toBeInTheDocument();
  });

  it("opens in the light theme on first launch even when the system is dark", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("dark"), media: query, addEventListener() {}, removeEventListener() {} }));
    localStorage.clear();
    render(
      <ThemeProvider>
        <span />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.palette).toBe("coral");
  });
});
