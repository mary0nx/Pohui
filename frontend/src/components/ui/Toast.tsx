import { Check, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { haptic } from "@/lib/telegram";

interface ToastItem {
  id: number;
  text: string;
  tone: "success" | "error";
  leaving?: boolean;
}

const ToastContext = createContext<{ show: (text: string, tone?: "success" | "error") => void } | null>(null);
const VISIBLE_MS = 3200;
const EXIT_MS = 180;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const show = useCallback((text: string, tone: "success" | "error" = "success") => {
    const id = ++counter.current;
    haptic(tone === "success" ? "success" : "error");
    setItems((prev) => [...prev.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))), VISIBLE_MS);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), VISIBLE_MS + EXIT_MS);
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[calc(12px+var(--safe-top))] z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex max-w-md items-center gap-3 rounded-full border border-border/70 bg-surface py-2 pl-2 pr-4 text-sm font-semibold text-text shadow-sheet",
              t.leaving ? "animate-toast-out" : "animate-toast-in",
            )}
          >
            <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-on-bright", t.tone === "success" ? "bg-mint" : "bg-coral")}>
              {t.tone === "success" ? <Check className="size-4" /> : <X className="size-4" strokeWidth={3} />}
            </span>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
}
