import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PullToRefresh } from "@/components/PullToRefresh";
import { newVersionAvailable } from "@/lib/appVersion";

function swipe(from: [number, number], to: [number, number]) {
  fireEvent.touchStart(window, {
    touches: [{ clientX: from[0], clientY: from[1] }],
  });
  fireEvent.touchMove(window, {
    touches: [{ clientX: to[0], clientY: to[1] }],
  });
  fireEvent.touchEnd(window, { touches: [] });
}

afterEach(() => {
  vi.restoreAllMocks();
  document.querySelectorAll("script[data-test]").forEach((s) => s.remove());
});

describe("pull to refresh", () => {
  it("refreshes after a long pull down at the top, not after a short pull or a sideways swipe", async () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>Главная</p>
      </PullToRefresh>,
    );
    await act(async () => swipe([100, 100], [100, 140])); // 20 px after damping: too short
    expect(onRefresh).not.toHaveBeenCalled();
    await act(async () => swipe([100, 100], [300, 180])); // mostly sideways
    expect(onRefresh).not.toHaveBeenCalled();
    await act(async () => swipe([100, 100], [105, 300]));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not start inside an open sheet", async () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    const { getByRole } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <div role="dialog">Лист</div>
      </PullToRefresh>,
    );
    const sheet = getByRole("dialog");
    await act(async () => {
      fireEvent.touchStart(sheet, {
        touches: [{ clientX: 100, clientY: 100 }],
      });
      fireEvent.touchMove(window, {
        touches: [{ clientX: 100, clientY: 400 }],
      });
      fireEvent.touchEnd(window, { touches: [] });
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

describe("new version check", () => {
  it("compares the running bundle with the deployed one", async () => {
    expect(await newVersionAvailable()).toBe(false); // dev / tests: no built bundle
    const s = document.createElement("script");
    s.type = "module";
    s.src = "/assets/index-AAA111.js";
    s.dataset.test = "1";
    document.head.appendChild(s);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        '<script type="module" src="/assets/index-AAA111.js"></script>',
      ),
    );
    expect(await newVersionAvailable()).toBe(false);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        '<script type="module" src="/assets/index-BBB222.js"></script>',
      ),
    );
    expect(await newVersionAvailable()).toBe(true);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    expect(await newVersionAvailable()).toBe(false);
  });
});
