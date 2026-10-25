import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CheckCircle, ProgressRing } from "@/components/ui";
import { celebrate } from "@/lib/motion";

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
  });
});
