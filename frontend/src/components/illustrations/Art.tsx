import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/*
 * Small hand-made vector illustrations for headers and empty states. They draw with the
 * --ill-* tokens (styles/index.css), so they follow the light and dark themes. Every
 * picture sits on a soft ground shadow and shares one outline weight (2.5) and palette.
 */

export type ArtName = "house" | "plant" | "calendar" | "basket" | "checklist" | "jar" | "docs" | "pot" | "mugs" | "bell" | "chart";

const LINE = { stroke: "var(--ill-line)", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Heart({ x, y, s = 1, fill = "var(--ill-coral)" }: { x: number; y: number; s?: number; fill?: string }) {
  return <path transform={`translate(${x} ${y}) scale(${s})`} d="M5 9.5C2 7.4 0 5.6 0 3.3 0 1.4 1.4 0 3.1 0 4 0 4.7.4 5 1.1 5.3.4 6 0 6.9 0 8.6 0 10 1.4 10 3.3c0 2.3-2 4.1-5 6.2Z" fill={fill} />;
}

function Ground({ cx = 60, rx = 46 }: { cx?: number; rx?: number }) {
  return <ellipse cx={cx} cy={93} rx={rx} ry={5} fill="var(--ill-ground)" />;
}

function Leaf({ d, fill = "var(--ill-leaf)" }: { d: string; fill?: string }) {
  return <path d={d} fill={fill} {...LINE} strokeWidth={2} />;
}

const ART: Record<ArtName, ReactNode> = {
  house: (
    <>
      <Ground cx={62} rx={52} />
      <path className="ill-smoke" d="M78 22c-3-3 3-5 0-9" fill="none" stroke="var(--ill-smoke)" strokeWidth={2.5} strokeLinecap="round" />
      <rect x={72} y={24} width={9} height={16} rx={2} fill="var(--ill-coral-deep)" {...LINE} />
      <path d="M26 50 58 22l32 28Z" fill="var(--ill-peach)" />
      <rect x={32} y={46} width={52} height={46} rx={5} fill="var(--ill-wall)" {...LINE} />
      <path d="M24 52 58 21l34 31" fill="none" stroke="var(--ill-coral)" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={58} cy={38} r={5.5} fill="var(--ill-light)" {...LINE} strokeWidth={2} />
      <rect x={38} y={57} width={13} height={13} rx={3} fill="var(--ill-light)" {...LINE} strokeWidth={2} />
      <path d="M44.5 57v13M38 63.5h13" {...LINE} strokeWidth={1.6} />
      <path d="M57 92V76a7 7 0 0 1 14 0v16Z" fill="var(--ill-forest)" {...LINE} />
      <circle cx={67} cy={84} r={1.3} fill="var(--ill-light)" />
      <g className="ill-heart">
        <Heart x={86} y={8} s={0.9} />
      </g>
      {/* potted plant by the door; the leaves sway from the rim of the pot */}
      <g className="ill-sway" style={{ transformOrigin: "101px 72px" }}>
        <Leaf d="M100 70c-7-2-9-10-6-16 6 2 9 9 6 16Z" />
        <Leaf d="M101 70c2-8 9-11 15-9-1 7-8 11-15 9Z" fill="var(--ill-leaf-deep)" />
        <Leaf d="M100 70c-1-8 2-15 7-18 3 6 0 14-7 18Z" fill="var(--ill-leaf)" />
      </g>
      <path d="M92 72h18l-2.5 20h-13Z" fill="var(--ill-peach)" {...LINE} />
    </>
  ),
  plant: (
    <>
      <Ground />
      <g className="ill-sway" style={{ transformOrigin: "60px 66px" }}>
        <Leaf d="M60 64c-12-3-17-17-12-28 11 3 16 16 12 28Z" />
        <Leaf d="M61 64c2-14 15-21 26-17-2 12-14 20-26 17Z" fill="var(--ill-leaf-deep)" />
        <Leaf d="M59 64c-3-14 3-27 12-32 5 11-1 25-12 32Z" fill="var(--ill-leaf)" />
        <Leaf d="M59 66c-10 1-19-5-21-13 9-3 18 3 21 13Z" fill="var(--ill-leaf-deep)" />
      </g>
      <path d="M42 64h36l-5 28H47Z" fill="var(--ill-coral)" {...LINE} />
      <path d="M40 64h40" {...LINE} strokeWidth={4} />
      <g className="ill-heart">
        <Heart x={78} y={22} s={0.8} fill="var(--ill-lavender-deep)" />
      </g>
    </>
  ),
  calendar: (
    <>
      <Ground />
      <rect x={24} y={22} width={72} height={66} rx={10} fill="var(--ill-wall)" {...LINE} />
      <path d="M24 32a10 10 0 0 1 10-10h52a10 10 0 0 1 10 10v8H24Z" fill="var(--ill-lavender)" {...LINE} />
      <path d="M42 16v12M78 16v12" {...LINE} strokeWidth={3.5} />
      {[0, 1, 2, 3].map((c) =>
        [0, 1, 2].map((r) => <rect key={`${c}${r}`} x={33 + c * 15} y={48 + r * 12} width={9} height={7} rx={2.5} fill={c === 2 && r === 1 ? "var(--ill-coral)" : "var(--ill-soft)"} />),
      )}
      <Heart x={88} y={10} s={1.1} />
      <path d="M100 58l2 4 4 1-4 1.5-2 4-2-4-4-1.5 4-1Z" fill="var(--ill-light-deep)" />
    </>
  ),
  basket: (
    <>
      <Ground />
      <path d="M40 46c6-16 34-16 40 0" fill="none" {...LINE} strokeWidth={3} />
      <rect x={52} y={20} width={11} height={34} rx={5.5} transform="rotate(-18 57 37)" fill="var(--ill-light-deep)" {...LINE} />
      <path d="M66 44 74 22l5 2-5 21Z" fill="var(--ill-coral)" {...LINE} strokeWidth={2} />
      <Leaf d="M77 23c-1-5 2-8 6-8 0 4-2 7-6 8Z" />
      <Leaf d="M38 46c-2-9 4-15 11-15 1 8-4 14-11 15Z" />
      <Leaf d="M44 47c2-8 10-11 16-9-2 7-9 11-16 9Z" fill="var(--ill-leaf-deep)" />
      <circle cx={86} cy={40} r={7} fill="var(--ill-coral)" {...LINE} strokeWidth={2} />
      <path d="M28 46h64l-6 40a6 6 0 0 1-6 5H40a6 6 0 0 1-6-5Z" fill="var(--ill-peach)" {...LINE} />
      <path d="M48 56v26M60 56v26M72 56v26" {...LINE} strokeWidth={2} opacity={0.5} />
      <path d="M26 46h68" {...LINE} strokeWidth={4} />
    </>
  ),
  checklist: (
    <>
      <Ground />
      <rect x={30} y={18} width={60} height={72} rx={9} fill="var(--ill-lemon)" {...LINE} />
      <rect x={36} y={26} width={48} height={58} rx={5} fill="var(--ill-wall)" />
      <rect x={48} y={13} width={24} height={11} rx={5.5} fill="var(--ill-forest)" {...LINE} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={41} y={34 + i * 16} width={10} height={10} rx={3.5} fill={i < 2 ? "var(--ill-leaf)" : "var(--ill-wall)"} {...LINE} strokeWidth={2} />
          {i < 2 && <path d={`M43.5 ${39 + i * 16}l2 2 3.5-4`} fill="none" {...LINE} strokeWidth={1.8} />}
          <path d={`M56 ${39 + i * 16}h${i === 1 ? 14 : 20}`} {...LINE} strokeWidth={2.5} opacity={i < 2 ? 0.45 : 0.8} />
        </g>
      ))}
      <Heart x={88} y={20} s={1} />
    </>
  ),
  jar: (
    <>
      <Ground />
      <Leaf d="M60 22c-7 0-12-5-12-11 7 0 12 5 12 11Z" />
      <Leaf d="M60 22c1-7 7-11 13-10-1 6-7 10-13 10Z" fill="var(--ill-leaf-deep)" />
      <path d="M60 22v8" {...LINE} strokeWidth={2} />
      <rect x={40} y={28} width={40} height={10} rx={4} fill="var(--ill-peach)" {...LINE} />
      <path d="M42 38h36c6 4 8 10 8 18v24a10 10 0 0 1-10 10H44a10 10 0 0 1-10-10V56c0-8 2-14 8-18Z" fill="var(--ill-mint)" {...LINE} />
      <ellipse cx={52} cy={80} rx={9} ry={4} fill="var(--ill-light-deep)" {...LINE} strokeWidth={2} />
      <ellipse cx={67} cy={75} rx={9} ry={4} fill="var(--ill-light-deep)" {...LINE} strokeWidth={2} />
      <ellipse cx={58} cy={68} rx={9} ry={4} fill="var(--ill-light)" {...LINE} strokeWidth={2} />
      <path d="M44 50c0-4 2-7 4-8" fill="none" stroke="var(--ill-wall)" strokeWidth={3} strokeLinecap="round" />
      <Heart x={88} y={30} s={0.9} />
    </>
  ),
  docs: (
    <>
      <Ground />
      <rect x={38} y={16} width={46} height={58} rx={6} fill="var(--ill-wall)" {...LINE} transform="rotate(-6 61 45)" />
      <path d="M46 30h26M46 38h20M46 46h24" {...LINE} strokeWidth={2.2} opacity={0.5} transform="rotate(-6 61 45)" />
      <path d="M26 40a6 6 0 0 1 6-6h18l6 7h32a6 6 0 0 1 6 6v37a6 6 0 0 1-6 6H32a6 6 0 0 1-6-6Z" fill="var(--ill-lavender)" {...LINE} />
      <circle cx={60} cy={64} r={8} fill="var(--ill-light)" {...LINE} strokeWidth={2} />
      <path d="m56.5 64 2.5 2.5 4.5-5" fill="none" {...LINE} strokeWidth={2} />
      <Heart x={88} y={18} s={0.9} />
    </>
  ),
  pot: (
    <>
      <Ground />
      <path d="M48 26c-4-4 4-7 0-12M60 24c-4-4 4-7 0-12M72 26c-4-4 4-7 0-12" fill="none" stroke="var(--ill-smoke)" strokeWidth={2.5} strokeLinecap="round" />
      <path d="M30 50h60v26a14 14 0 0 1-14 14H44a14 14 0 0 1-14-14Z" fill="var(--ill-coral)" {...LINE} />
      <path d="M30 56h-6M90 56h6" {...LINE} strokeWidth={4} />
      <path d="M26 46c0-5 15-8 34-8s34 3 34 8Z" fill="var(--ill-peach)" {...LINE} />
      <rect x={55} y={32} width={10} height={6} rx={3} fill="var(--ill-forest)" {...LINE} strokeWidth={2} />
      <Heart x={55} y={64} s={1} fill="var(--ill-wall)" />
    </>
  ),
  mugs: (
    <>
      <Ground />
      <path d="M44 36c-4-4 4-7 0-11M74 36c-4-4 4-7 0-11" fill="none" stroke="var(--ill-smoke)" strokeWidth={2.5} strokeLinecap="round" />
      <Heart x={54} y={16} s={1.2} />
      <path d="M80 54h4a7 7 0 0 1 0 14h-4" fill="none" {...LINE} strokeWidth={3} />
      <path d="M62 44h22v34a8 8 0 0 1-8 8h-6a8 8 0 0 1-8-8Z" fill="var(--ill-mint)" {...LINE} />
      <path d="M32 54h-4a7 7 0 0 0 0 14h4" fill="none" {...LINE} strokeWidth={3} />
      <path d="M30 44h24v34a8 8 0 0 1-8 8h-8a8 8 0 0 1-8-8Z" fill="var(--ill-peach)" {...LINE} />
      <Heart x={37} y={58} s={1} />
      <Leaf d="M73 66c-4-1-5-5-4-8 4 1 5 5 4 8Z" />
      <Leaf d="M73 66c1-4 5-5 8-4-1 4-5 5-8 4Z" fill="var(--ill-leaf-deep)" />
    </>
  ),
  bell: (
    <>
      <Ground />
      <path d="M60 18a4 4 0 0 1 4 4v2c10 2 16 11 16 22v14l6 10H34l6-10V46c0-11 6-20 16-22v-2a4 4 0 0 1 4-4Z" fill="var(--ill-lemon)" {...LINE} />
      <path d="M52 76a8 8 0 0 0 16 0" fill="var(--ill-coral)" {...LINE} />
      <path d="M47 42c1-4 4-7 8-8" fill="none" stroke="var(--ill-wall)" strokeWidth={3} strokeLinecap="round" />
      <path d="M90 28l2 4 4 1-4 1.5-2 4-2-4-4-1.5 4-1ZM28 34l1.5 3 3 1-3 1-1.5 3-1.5-3-3-1 3-1Z" fill="var(--ill-lavender-deep)" />
    </>
  ),
  chart: (
    <>
      <Ground />
      <rect x={24} y={20} width={72} height={66} rx={12} fill="var(--ill-wall)" {...LINE} />
      <rect x={36} y={56} width={10} height={20} rx={4} fill="var(--ill-leaf)" {...LINE} strokeWidth={2} />
      <rect x={55} y={44} width={10} height={32} rx={4} fill="var(--ill-coral)" {...LINE} strokeWidth={2} />
      <rect x={74} y={34} width={10} height={42} rx={4} fill="var(--ill-lavender)" {...LINE} strokeWidth={2} />
      <path d="M36 42l12-8 10 5 16-12" fill="none" {...LINE} strokeWidth={2.2} opacity={0.55} />
      <Heart x={88} y={10} s={1} />
    </>
  ),
};

/**
 * Decorative only (aria-hidden): the meaning is always in the text next to it.
 * `alive` plays a short "breath" of life — leaves sway, the heart floats in, smoke
 * drifts — for a few seconds after mounting, then the picture rests (no endless loops).
 */
export function Art({ name, className, alive }: { name: ArtName; className?: string; alive?: boolean }) {
  return (
    <svg viewBox="0 0 120 100" className={cn("shrink-0", alive && "ill-alive", className)} aria-hidden focusable="false">
      {ART[name]}
    </svg>
  );
}
