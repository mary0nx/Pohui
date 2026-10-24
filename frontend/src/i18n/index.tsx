import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { en } from "./en";
import { pl } from "./pl";
import { ru, type MessageKey } from "./ru";

export type Locale = "ru" | "en" | "pl";
const DICTS = { ru, en, pl } as const;
const STORAGE = "familyos.locale";

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved === "ru" || saved === "en" || saved === "pl") return saved;
  } catch {
    /* ignore */
  }
  return "ru";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE, l);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = l;
  }, []);
  const t = useCallback((key: MessageKey) => (DICTS[locale] as Partial<Record<MessageKey, string>>)[key] ?? ru[key], [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n outside I18nProvider");
  return ctx;
}
