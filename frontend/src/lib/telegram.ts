/**
 * Thin typed wrapper over the official Telegram Mini Apps script (telegram-web-app.js).
 * Outside Telegram (browser, tests) every call degrades gracefully.
 * NOTE: initDataUnsafe is used only for UI hints (e.g. start_param routing); identity is
 * always proven by sending the raw initData string to the backend for signature checks.
 */

type EventName = "themeChanged" | "viewportChanged" | "backButtonClicked";

interface TgBackButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

interface TgWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { id: number; first_name: string } };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string | undefined>;
  BackButton: TgBackButton;
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  };
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast(version: string): boolean;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  disableVerticalSwipes?(): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  onEvent(event: EventName, cb: () => void): void;
  offEvent(event: EventName, cb: () => void): void;
  CloudStorage?: {
    setItem(key: string, value: string, cb?: (err: string | null, ok?: boolean) => void): void;
    getItem(key: string, cb: (err: string | null, value?: string) => void): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export function webApp(): TgWebApp | undefined {
  return typeof window === "undefined" ? undefined : window.Telegram?.WebApp;
}

export function isInsideTelegram(): boolean {
  return Boolean(webApp()?.initData);
}

export function initTelegram(): void {
  const tg = webApp();
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    if (tg.isVersionAtLeast("7.7")) tg.disableVerticalSwipes?.();
  } catch {
    /* older clients */
  }
}

export function telegramInitData(): string {
  return webApp()?.initData ?? "";
}

export function startParam(): string | undefined {
  return webApp()?.initDataUnsafe?.start_param;
}

export function telegramColorScheme(): "light" | "dark" | undefined {
  const tg = webApp();
  return tg?.initData ? tg.colorScheme : undefined;
}

export function onTelegramThemeChange(cb: () => void): () => void {
  const tg = webApp();
  if (!tg) return () => undefined;
  tg.onEvent("themeChanged", cb);
  return () => tg.offEvent("themeChanged", cb);
}

export function paintChrome(background: string): void {
  const tg = webApp();
  if (!tg?.initData) return;
  try {
    if (tg.isVersionAtLeast("6.1")) {
      tg.setHeaderColor?.(background);
      tg.setBackgroundColor?.(background);
    }
    if (tg.isVersionAtLeast("7.10")) tg.setBottomBarColor?.(background);
  } catch {
    /* ignore */
  }
}

export function haptic(kind: "light" | "success" | "error" | "select" = "light"): void {
  const h = webApp()?.HapticFeedback;
  if (!h) return;
  try {
    if (kind === "success" || kind === "error") h.notificationOccurred(kind);
    else if (kind === "select") h.selectionChanged();
    else h.impactOccurred("light");
  } catch {
    /* ignore */
  }
}

export function showBackButton(onBack: () => void): () => void {
  const tg = webApp();
  if (!tg?.initData || !tg.isVersionAtLeast("6.1")) return () => undefined;
  tg.BackButton.onClick(onBack);
  tg.BackButton.show();
  return () => {
    tg.BackButton.offClick(onBack);
    tg.BackButton.hide();
  };
}

export function openExternal(url: string): void {
  const tg = webApp();
  if (tg?.initData) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Telegram CloudStorage: small per-user values synced across the user's devices (Bot API 6.9+).
 * Resolves to null outside Telegram, on older clients or on any error.
 */
export function cloudGet(key: string): Promise<string | null> {
  const tg = webApp();
  if (!tg?.CloudStorage || !tg.isVersionAtLeast("6.9")) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      tg.CloudStorage!.getItem(key, (err, value) => resolve(err || !value ? null : value));
    } catch {
      resolve(null);
    }
  });
}

export function cloudSet(key: string, value: string): void {
  const tg = webApp();
  if (!tg?.CloudStorage || !tg.isVersionAtLeast("6.9")) return;
  try {
    tg.CloudStorage.setItem(key, value);
  } catch {
    /* best effort: the local copy still applies */
  }
}
