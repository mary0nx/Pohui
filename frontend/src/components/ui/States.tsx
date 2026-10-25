import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { errorMessage } from "@/api/client";
import { Art, type ArtName } from "@/components/illustrations/Art";
import { cn } from "@/lib/cn";

import { Button } from "./Button";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-muted", className)} aria-label="Загрузка" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton-shimmer rounded-2xl", className)} aria-hidden />;
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Загрузка">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-card" />
      ))}
    </div>
  );
}

/**
 * Cozy empty state: a small illustration, one short sentence and a clear way to add the
 * first item. `art` picks an illustration; `icon` is the fallback for places without one.
 */
export function EmptyState({ art, icon, title, text, action }: { art?: ArtName; icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="animate-fade-in flex flex-col items-center px-6 py-8 text-center">
      {art ? (
        <Art name={art} className="animate-art-in mb-3 h-[104px] w-[125px]" />
      ) : (
        icon && <div className="animate-art-in mb-4 flex size-16 items-center justify-center rounded-3xl bg-accent-soft text-accent-strong" aria-hidden>{icon}</div>
      )}
      <p className="text-base font-bold text-heading">{title}</p>
      {text && <p className="mt-1 max-w-xs text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  return (
    <div role="alert" className={cn("animate-fade-in flex flex-col items-center text-center", compact ? "py-4" : "px-6 py-10")}>
      <div className="mb-3 flex size-14 items-center justify-center rounded-3xl bg-danger-soft text-danger">
        <AlertTriangle className="size-6" />
      </div>
      <p className="text-base font-bold">Не удалось загрузить данные</p>
      <p className="mt-1 max-w-xs text-sm text-muted">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" icon={<RefreshCw className="size-4" />} onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}

/** Starts at 0 and fills to `value` once mounted, so progress visibly grows on arrival. */
function useGrow(value: number): number {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return shown;
}

const LEVEL_COLOR = { ok: "var(--progress-ok)", warning: "var(--progress-warn)", exceeded: "var(--progress-over)", done: "var(--progress-done)" } as const;
type Level = keyof typeof LEVEL_COLOR;

export function ProgressBar({ value, level = "ok", className, label }: { value: number; level?: Level; className?: string; label?: string }) {
  const clamped = Math.min(Math.max(value, 0), 100);
  const shown = useGrow(clamped);
  return (
    <div
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-surface-2", className)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full origin-left rounded-full transition-transform duration-700 ease-[var(--ease-out)]"
        style={{ transform: `scaleX(${shown / 100})`, background: LEVEL_COLOR[level] }}
      />
    </div>
  );
}

/** Circular progress (budgets, goals). Animates its arc from empty on mount. */
export function ProgressRing({
  value,
  size = 64,
  stroke = 8,
  level = "ok",
  label,
  children,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  level?: Level;
  label?: string;
  children?: ReactNode;
  className?: string;
}) {
  const clamped = Math.min(Math.max(value, 0), 100);
  const shown = useGrow(clamped);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-surface-2 opacity-90" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={LEVEL_COLOR[level]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown / 100)}
          style={{ transition: "stroke-dashoffset 900ms var(--ease-out)" }}
        />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}

/** Round checkbox with a drawn check mark and a small pop when it becomes checked. */
export function CheckCircle({ checked, tone = "success", className }: { checked: boolean; tone?: "success" | "accent"; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200",
        checked ? (tone === "success" ? "animate-check border-transparent bg-sage text-forest-ink" : "animate-check border-transparent bg-accent text-accent-fg") : "border-[color-mix(in_srgb,var(--sage)_70%,var(--border))] bg-surface",
        className,
      )}
      aria-hidden
    >
      {checked && (
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path className="check-draw" d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
    </span>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "accent" | "warning" | "danger" | "success" | "lavender"; className?: string }) {
  const tones = {
    neutral: "bg-surface-2 text-muted",
    accent: "bg-peach text-peach-ink",
    warning: "bg-lemon text-lemon-ink",
    danger: "bg-danger-soft text-danger",
    success: "bg-mint text-mint-ink",
    lavender: "bg-lavender text-lavender-ink",
  };
  return <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}

const AVATAR_COLORS = ["bg-peach text-peach-ink", "bg-mint text-mint-ink", "bg-lavender text-lavender-ink", "bg-lemon text-lemon-ink"];

export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  if (src) return <img src={src} alt={name} width={size} height={size} className="shrink-0 rounded-full object-cover ring-2 ring-surface" style={{ width: size, height: size }} />;
  const color = AVATAR_COLORS[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-bold ring-2 ring-surface", color)} style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
      {initials}
    </span>
  );
}

/** Smoothly expanding block (height follows the content). Closed content is inert. */
export function Collapse({ open, id, children }: { open: boolean; id?: string; children: ReactNode }) {
  return (
    <div id={id} className="collapse-panel" data-open={open} inert={!open}>
      <div>{children}</div>
    </div>
  );
}
