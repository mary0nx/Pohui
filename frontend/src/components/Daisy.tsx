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
  const reach = 9 + 6 * o; // centre of a petal from the middle of the flower
  const length = 4.5 + 3.8 * o; // half length of a petal
  const width = 3.8 + 2.4 * o; // half width: few, wide, rounded petals
  return (
    <svg viewBox="-2 -2 52 52" className={className} aria-hidden>
      {/* Only the petals turn; the little face in the middle stays upright. */}
      <g
        className={cn(spinning && "animate-daisy")}
        style={{
          // The petals form a symmetric ring, so the centre of their box is the flower centre.
          transformBox: "fill-box",
          transformOrigin: "center",
          transform: spinning ? undefined : `rotate(${rotate}deg)`,
        }}
      >
        {Array.from({ length: 8 }, (_, i) => (
          <ellipse
            key={i}
            cx={24}
            cy={24 - reach}
            rx={width}
            ry={length}
            transform={`rotate(${i * 45} 24 24)`}
            fill="#fffdf8"
            stroke="var(--ill-line)"
            strokeWidth={1.5}
            opacity={0.4 + 0.6 * o}
          />
        ))}
      </g>
      <circle
        cx={24}
        cy={24}
        r={8.2}
        fill="var(--ill-light-deep)"
        stroke="var(--ill-line)"
        strokeWidth={1.6}
      />
      {/* rosy cheeks, closed happy eyes, a small smile */}
      <ellipse
        cx={19.4}
        cy={26.2}
        rx={1.6}
        ry={1}
        fill="var(--ill-coral)"
        opacity={0.55}
      />
      <ellipse
        cx={28.6}
        cy={26.2}
        rx={1.6}
        ry={1}
        fill="var(--ill-coral)"
        opacity={0.55}
      />
      <path
        d="M19.9 23.2q1.1-1.2 2.2 0M25.9 23.2q1.1-1.2 2.2 0"
        fill="none"
        stroke="var(--ill-line)"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <path
        d="M22.3 26.4q1.7 1.6 3.4 0"
        fill="none"
        stroke="var(--ill-line)"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
    </svg>
  );
}
