import { cn } from "@/lib/cn";

/**
 * A chamomile flower in the style of the Family OS illustrations: white petals with the
 * illustration outline, a sunny centre. `open` (0–1) unfolds the petals while the page is
 * pulled; `spinning` turns it slowly while something loads (still under reduced motion).
 */
export function Daisy({
  open = 1,
  spinning = false,
  rotate = 0,
  className,
}: {
  open?: number;
  spinning?: boolean;
  rotate?: number;
  className?: string;
}) {
  const o = Math.max(0, Math.min(1, open));
  const reach = 6.5 + 7.5 * o; // centre of a petal from the middle of the flower
  const length = 4 + 4.6 * o; // half length of a petal
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn(spinning && "animate-daisy", className)}
      aria-hidden
      style={spinning ? undefined : { transform: `rotate(${rotate}deg)` }}
    >
      {Array.from({ length: 12 }, (_, i) => (
        <ellipse
          key={i}
          cx={24}
          cy={24 - reach}
          rx={3.6}
          ry={length}
          transform={`rotate(${i * 30} 24 24)`}
          fill="#fffdf8"
          stroke="var(--ill-line)"
          strokeWidth={1.4}
          opacity={0.35 + 0.65 * o}
        />
      ))}
      <circle
        cx={24}
        cy={24}
        r={6.5}
        fill="var(--ill-light-deep)"
        stroke="var(--ill-line)"
        strokeWidth={1.6}
      />
      <circle cx={22} cy={22.5} r={1.1} fill="var(--ill-light)" />
      <circle cx={25.8} cy={23.4} r={0.9} fill="var(--ill-light)" />
      <circle cx={23.6} cy={26} r={0.9} fill="var(--ill-light)" />
    </svg>
  );
}
