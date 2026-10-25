/** Motion helpers: everything decorative is skipped when the user asked for reduced motion. */

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

const CONFETTI_COLORS = ["#ff786b", "#9ddcc5", "#c7b8f5", "#f8d96d", "#315b4c"];

/**
 * A small, one-off confetti burst for meaningful achievements (a goal reached, a list
 * finished). ~28 DOM pieces animated with transform/opacity, removed after 1.3 s.
 */
export function celebrate(origin?: { x: number; y: number }): void {
  if (typeof document === "undefined" || prefersReducedMotion()) return;
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 3;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:0;height:0;pointer-events:none;z-index:70`;
  for (let i = 0; i < 28; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    const angle = (Math.PI * 2 * i) / 28 + Math.random() * 0.4;
    const distance = 70 + Math.random() * 90;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length]!;
    piece.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    piece.style.setProperty("--dy", `${Math.sin(angle) * distance + 90}px`);
    piece.style.setProperty("--rot", `${(Math.random() - 0.5) * 720}deg`);
    piece.style.animationDelay = `${Math.random() * 80}ms`;
    if (i % 3 === 0) piece.style.borderRadius = "999px";
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 1300);
}

/** Center of an element, for starting a burst where the user tapped. */
export function centerOf(el: Element | null | undefined): { x: number; y: number } | undefined {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
