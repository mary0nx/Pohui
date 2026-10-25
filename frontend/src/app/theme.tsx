import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { cloudGet, cloudSet, onTelegramThemeChange, paintChrome, telegramColorScheme } from "@/lib/telegram";

export type ThemeMode = "system" | "light" | "dark";
const STORAGE = "familyos.theme";
// v2: the 2026 redesign re-tuned all palettes; earlier choices start again from coral.
const PALETTE_STORAGE = "familyos.palette.v2";

/** Accent palettes; colors live in styles/index.css under [data-palette]. */
export const PALETTES = [
  { id: "coral", label: "Коралл", light: "#ff786b", dark: "#ff8a7e" },
  { id: "lavender", label: "Лаванда", light: "#c7b8f5", dark: "#c7b8f5" },
  { id: "mint", label: "Мята", light: "#9ddcc5", dark: "#9ddcc5" },
  { id: "lemon", label: "Лимон", light: "#f8d96d", dark: "#f8d96d" },
  { id: "forest", label: "Лес", light: "#315b4c", dark: "#6fb39a" },
  { id: "ocean", label: "Океан", light: "#2f6fb0", dark: "#7fb2e5" },
  { id: "graphite", label: "Графит", light: "#3f3a36", dark: "#d6ccc2" },
] as const;
export type Palette = (typeof PALETTES)[number]["id"];

interface ThemeValue {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (m: ThemeMode) => void;
  palette: Palette;
  setPalette: (p: Palette) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

function systemScheme(): "light" | "dark" {
  const tg = telegramColorScheme();
  if (tg) return tg;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function isMode(v: string | null): v is ThemeMode {
  return v === "light" || v === "dark" || v === "system";
}

function isPalette(v: string | null): v is Palette {
  return PALETTES.some((p) => p.id === v);
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function readMode(): ThemeMode {
  const v = readLocal(STORAGE);
  return isMode(v) ? v : "system";
}

function readPalette(): Palette {
  const v = readLocal(PALETTE_STORAGE);
  return isPalette(v) ? v : "coral";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [palette, setPaletteState] = useState<Palette>(readPalette);
  const [system, setSystem] = useState<"light" | "dark">(systemScheme);

  useEffect(() => {
    const update = () => setSystem(systemScheme());
    const off = onTelegramThemeChange(update);
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", update);
    return () => {
      off();
      mq?.removeEventListener?.("change", update);
    };
  }, []);

  // The choice made on another device arrives through Telegram CloudStorage.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([cloudGet(STORAGE), cloudGet(PALETTE_STORAGE)]).then(([m, p]) => {
      if (cancelled) return;
      if (isMode(m)) {
        setModeState(m);
        writeLocal(STORAGE, m);
      }
      if (isPalette(p)) {
        setPaletteState(p);
        writeLocal(PALETTE_STORAGE, p);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const resolved = mode === "system" ? system : mode;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.palette = palette;
    const bg = getComputedStyle(root).getPropertyValue("--bg").trim() || (resolved === "dark" ? "#0f1214" : "#f4f5f6");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
    paintChrome(bg);
  }, [resolved, palette]);

  const value = useMemo<ThemeValue>(
    () => ({
      mode,
      resolved,
      palette,
      setMode: (m) => {
        setModeState(m);
        writeLocal(STORAGE, m);
        cloudSet(STORAGE, m);
      },
      setPalette: (p) => {
        setPaletteState(p);
        writeLocal(PALETTE_STORAGE, p);
        cloudSet(PALETTE_STORAGE, p);
      },
    }),
    [mode, resolved, palette],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}
