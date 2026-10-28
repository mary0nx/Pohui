import { useEffect, useRef, useState, type ReactNode } from "react";

import { Daisy } from "@/components/Daisy";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/telegram";

const THRESHOLD = 72; // px of (damped) pull that triggers a refresh
const MAX = 110;
const MIN_SPIN_MS = 600;

/**
 * Pull down at the very top of the page to refresh. Works with touch only, starts only when
 * the page is scrolled to the top and no sheet or dialog is open, and leaves horizontal
 * swipes alone. Telegram's own swipe-to-close is already off (lib/telegram.ts).
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown>;
  children: ReactNode;
}) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const distance = useRef(0);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;

  useEffect(() => {
    if (busy) return;
    const reset = () => {
      start.current = null;
      distance.current = 0;
      setDragging(false);
    };
    const onStart = (e: TouchEvent) => {
      const target = e.target;
      const inDialog =
        target instanceof Element &&
        target.closest('[role="dialog"], [role="alertdialog"]') !== null;
      if (e.touches.length !== 1 || window.scrollY > 0 || inDialog) {
        start.current = null;
        return;
      }
      start.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
    };
    const onMove = (e: TouchEvent) => {
      if (!start.current) return;
      const dy = e.touches[0]!.clientY - start.current.y;
      const dx = e.touches[0]!.clientX - start.current.x;
      if (
        distance.current === 0 &&
        (dy <= 0 || Math.abs(dx) > dy || window.scrollY > 0)
      ) {
        if (Math.abs(dx) > 10 || dy < -10) start.current = null; // a scroll or a sideways swipe
        return;
      }
      const d = Math.min(MAX, Math.max(0, dy) * 0.5);
      if (d >= THRESHOLD && distance.current < THRESHOLD) haptic("select");
      distance.current = d;
      setDragging(true);
      setPull(d);
      if (e.cancelable) e.preventDefault();
    };
    const onEnd = () => {
      if (!start.current) return;
      const d = distance.current;
      reset();
      if (d < THRESHOLD) {
        setPull(0);
        return;
      }
      setBusy(true);
      setPull(THRESHOLD * 0.8);
      haptic("light");
      // Keep the spinner up a moment even when the data comes back at once.
      const shown = new Promise((r) => window.setTimeout(r, MIN_SPIN_MS));
      Promise.all([refresh.current().catch(() => undefined), shown]).finally(
        () => {
          setBusy(false);
          setPull(0);
        },
      );
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [busy]);

  const ready = pull >= THRESHOLD;
  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 z-40 flex justify-center"
        style={{
          top: "calc(var(--safe-top) - 52px)",
          transform: `translateY(${pull}px)`,
          opacity: busy ? 1 : Math.min(1, pull / (THRESHOLD * 0.6)),
          transition: dragging
            ? "none"
            : "transform 220ms var(--ease-out), opacity 220ms",
        }}
        role={busy ? "status" : undefined}
        aria-live="polite"
      >
        <span
          className={cn(
            "flex size-12 items-center justify-center rounded-full bg-surface shadow-card ring-1 ring-border/60 transition-colors",
            ready && !busy && "bg-peach-soft",
          )}
        >
          <Daisy
            className="size-10"
            open={busy ? 1 : pull / THRESHOLD}
            spinning={busy}
            rotate={pull * 2.5}
          />
          {busy && <span className="sr-only">Обновляем…</span>}
        </span>
      </div>
      {children}
    </>
  );
}
