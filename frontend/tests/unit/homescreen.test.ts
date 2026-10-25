import { afterEach, describe, expect, it, vi } from "vitest";

import { addToHomeScreen, homeScreenStatus } from "@/lib/telegram";

function stubTelegram(version: string, status: string) {
  const handlers: Record<string, () => void> = {};
  const tg = {
    initData: "signed",
    isVersionAtLeast: (v: string) => Number(version) >= Number(v),
    checkHomeScreenStatus: (cb: (s: string) => void) => cb(status),
    addToHomeScreen: vi.fn(() => handlers.homeScreenAdded?.()),
    onEvent: (name: string, cb: () => void) => (handlers[name] = cb),
    offEvent: (name: string) => delete handlers[name],
  };
  vi.stubGlobal("Telegram", { WebApp: tg });
  return tg;
}

afterEach(() => vi.unstubAllGlobals());

describe("home screen shortcut", () => {
  it("is unsupported outside Telegram and on clients older than 8.0", async () => {
    expect(await homeScreenStatus()).toBe("unsupported");
    stubTelegram("7.10", "missed");
    expect(await homeScreenStatus()).toBe("unsupported");
  });

  it("reports the status and adds the shortcut on request", async () => {
    const tg = stubTelegram("8.0", "missed");
    expect(await homeScreenStatus()).toBe("missed");
    const added = vi.fn();
    addToHomeScreen(added);
    expect(tg.addToHomeScreen).toHaveBeenCalledOnce();
    expect(added).toHaveBeenCalledOnce();
  });
});
