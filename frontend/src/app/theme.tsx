import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { onTelegramThemeChange, paintChrome, telegramColorScheme } from "@/lib/telegram";

export type ThemeMode = "system" | "light" | "dark";
const STORAGE = "familyos.theme";

interface ThemeValue {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

function systemScheme(): "light" | "dark" {
  const tg = telegramColorScheme();
  if (tg) return tg;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
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

  const resolved = mode === "system" ? system : mode;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || (resolved === "dark" ? "#0f1214" : "#f4f5f6");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
    paintChrome(bg);
  }, [resolved]);

  const value = useMemo<ThemeValue>(
    () => ({
      mode,
      resolved,
      setMode: (m) => {
        setModeState(m);
        try {
          localStorage.setItem(STORAGE, m);
        } catch {
          /* ignore */
        }
      },
    }),
    [mode, resolved],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}
