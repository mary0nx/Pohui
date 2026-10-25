// Generates the «Листочек дня» illustrations: original vector drawings in the Family OS style
// (one outline weight, the --ill-* palette with light-theme fallbacks), 120×100 each.
// Output: public/daily/<id>.svg + src/features/daily/art-manifest.ts.  Run: node scripts/daily-art.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const v = (n, fb) => `var(--ill-${n},${fb})`;
const C = {
  line: v("line", "#315b4c"), wall: v("wall", "#fff"), soft: v("soft", "#efe6dc"), ground: v("ground", "#f6e6d4"),
  coral: v("coral", "#f47f70"), coralD: v("coral-deep", "#d9675a"), peach: v("peach", "#ffd9c7"), mint: v("mint", "#d9f0e4"),
  leaf: v("leaf", "#9fc7ae"), leafD: v("leaf-deep", "#6fae8c"), lav: v("lavender", "#e8dffd"), lavD: v("lavender-deep", "#b8a5f0"),
  lemon: v("lemon", "#f8e7a0"), light: v("light", "#fbe8a6"), lightD: v("light-deep", "#f2cf62"), forest: v("forest", "#315b4c"),
  smoke: v("smoke", "#d8cfe9"),
};
const L = (w = 2.5) => `stroke="${C.line}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const p = (d, fill = "none", w = 2.5, extra = "") => `<path d="${d}" fill="${fill}" ${L(w)} ${extra}/>`;
const fillOnly = (d, fill) => `<path d="${d}" fill="${fill}"/>`;
const circle = (cx, cy, r, fill, w = 2.5) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${w ? L(w) : ""}/>`;
const dot = (cx, cy, r, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
const rect = (x, y, w, h, rx, fill, sw = 2.5) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${L(sw)}/>`;
const g = (inner, attrs = "") => `<g ${attrs}>${inner}</g>`;
const sway = (inner, ox, oy) => g(inner, `class="ill-sway" style="transform-origin:${ox}px ${oy}px"`);
const ground = (cx = 60, rx = 46) => `<ellipse cx="${cx}" cy="93" rx="${rx}" ry="5" fill="${C.ground}"/>`;

// ---- motifs -----------------------------------------------------------------------------
const heart = (x, y, s = 1, fill = C.coral) =>
  g(`<path transform="translate(${x} ${y}) scale(${s})" d="M5 9.5C2 7.4 0 5.6 0 3.3 0 1.4 1.4 0 3.1 0 4 0 4.7.4 5 1.1 5.3.4 6 0 6.9 0 8.6 0 10 1.4 10 3.3c0 2.3-2 4.1-5 6.2Z" fill="${fill}"/>`, `class="ill-heart"`);
const leaf = (d, fill = C.leaf) => p(d, fill, 2);
const cloud = (x, y, s = 1, fill = C.wall) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M4 16h30a7 7 0 0 0 0-14 9 9 0 0 0-16-3A7 7 0 0 0 4 4a6 6 0 0 0 0 12Z" fill="${fill}" ${L(2.5 / s)}/>`;
const sun = (x, y, r = 9) => {
  let rays = "";
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x1 = x + Math.cos(a) * (r + 4), y1 = y + Math.sin(a) * (r + 4), x2 = x + Math.cos(a) * (r + 8), y2 = y + Math.sin(a) * (r + 8);
    rays += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }
  return g(p(rays, "none", 2.2) + circle(x, y, r, C.lightD), `class="ill-heart"`);
};
const moon = (x, y, r = 8) => p(`M${x + 2} ${y - r}a${r} ${r} 0 1 0 ${r - 1} ${r + 6}a${r - 1} ${r - 1} 0 0 1-${r - 1}-${r + 6}Z`, C.light, 2.2);
const star = (x, y, s = 1, fill = C.lightD) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0-5 1.5-1.5 5 0 1.5 1.5 0 5-1.5 1.5-5 0-1.5-1.5Z" fill="${fill}"/>`;
const sparkle = (x, y, s = 1) => g(star(x, y, s, C.lightD), `class="ill-heart"`);
const flake = (x, y, s = 1) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0-5V5M-4.3-2.5 4.3 2.5M-4.3 2.5 4.3-2.5" stroke="${C.lavD}" stroke-width="${1.8 / s}" stroke-linecap="round"/>`;
const drop = (x, y, s = 1) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 0c2 3 3 4.5 3 6a3 3 0 0 1-6 0c0-1.5 1-3 3-6Z" fill="${C.mint}" ${L(1.6 / s)}/>`;
const flower = (x, y, petal = C.coral, r = 4) => {
  let s = "";
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    s += circle((x + Math.cos(a) * r).toFixed(1), (y + Math.sin(a) * r).toFixed(1), r * 0.75, petal, 1.6);
  }
  return s + circle(x, y, r * 0.55, C.lightD, 1.6);
};
const stem = (x1, y1, x2, y2) => p(`M${x1} ${y1}Q${(x1 + x2) / 2 + 3} ${(y1 + y2) / 2} ${x2} ${y2}`, "none", 2);
const tulip = (x, y, fill) => p(`M${x - 6} ${y - 4}c0 6 3 9 6 9s6-3 6-9l-3 3-3-5-3 5Z`, fill, 2);
const pot = (x, y, w = 22, h = 18, fill = C.peach) => p(`M${x - w / 2} ${y}h${w}l-2.5 ${h}h-${w - 5}Z`, fill) + p(`M${x - w / 2 - 2} ${y}h${w + 4}`, "none", 2.5);
const mug = (x, y, fill = C.coral, steam = true) =>
  (steam ? g(p(`M${x - 4} ${y - 6}c-3-3 3-5 0-9M${x + 4} ${y - 6}c-3-3 3-5 0-9`, "none", 2.2, `stroke="${C.smoke}"`).replace(`stroke="${C.line}"`, ""), `class="ill-smoke"`) : "") +
  p(`M${x + 11} ${y + 4}h3a5 5 0 0 1 0 10h-3`, "none") + p(`M${x - 12} ${y}h24v16a8 8 0 0 1-8 8h-8a8 8 0 0 1-8-8Z`, fill);
const tree = (x, y, crown = C.leaf, h = 30) => p(`M${x} ${y}v-${h * 0.45}`, "none", 3) + circle(x, y - h * 0.7, h * 0.38, crown);
const fir = (x, y, s = 1, fill = C.leafD) =>
  `<g transform="translate(${x} ${y}) scale(${s})">${p("M0-34 12-14H6L16 0H-16L-6-14H-12Z", fill)}${p("M0 0v6", "none", 3)}</g>`;
const house = (x, y, s = 1, roof = C.coral, light = C.light) =>
  `<g transform="translate(${x} ${y}) scale(${s})">${rect(-16, -22, 32, 22, 3, C.wall)}${p("M-21-19 0-38l21 19", "none", 6, `stroke="${roof}"`).replace(`stroke="${C.line}"`, "")}${rect(-11, -16, 9, 9, 2, light, 2)}${p("M4 0v-10a4 4 0 0 1 8 0V0Z", C.forest, 2)}</g>`;
const cat = (x, y, s = 1, fill = C.peach) =>
  `<g transform="translate(${x} ${y}) scale(${s})">${p("M14-4c8 0 10-8 6-10", "none", 2.5)}${p("M-12 0c0-10 6-16 13-16s13 6 13 16Z", fill)}${p("M-12-22l2-9 6 6M4-25l6-6 2 9", fill, 2.2)}${circle(-4, -21, 10, fill)}${p("M-8-22h.1M0-22h.1", "none", 3)}${p("M-5.5-18q1.5 1.5 3 0", "none", 1.6)}</g>`;
const sleepyCat = (x, y, s = 1, fill = C.peach) =>
  `<g transform="translate(${x} ${y}) scale(${s})">${p("M-20 0c0-10 8-15 20-15s20 5 20 15Z", fill)}${p("M18-2c6 1 8-4 5-6", "none", 2.5)}${p("M-21-12l1-8 6 5M-10-15l5-6 2 8", fill, 2.2)}${circle(-14, -10, 9, fill)}${p("M-19-11q2 1.5 4 0M-12-11q2 1.5 4 0", "none", 1.6)}</g>`;
const bird = (x, y, s = 1, fill = C.coral) =>
  `<g transform="translate(${x} ${y}) scale(${s})">${p("M-10 2c0-8 5-12 11-12 4 0 7 3 7 7 0 6-6 10-12 10-3 0-6-2-6-5Z", fill)}${p("M8-5l5 1-5 2", C.lightD, 1.8)}${dot(3, -5, 1.4, C.line)}${p("M-6 2c4 0 7-2 8-5", "none", 2)}${p("M-2 12v3M2 12v3", "none", 2)}</g>`;
const butterfly = (x, y, s = 1) =>
  g(`<g transform="translate(${x} ${y}) scale(${s})">${p("M0 0c-4-10-14-10-14-3 0 5 8 6 14 3Z", C.lavD, 2)}${p("M0 0c4-10 14-10 14-3 0 5-8 6-14 3Z", C.lavD, 2)}${p("M0 0c-3 6-10 9-10 5 0-3 5-5 10-5Z", C.coral, 2)}${p("M0 0c3 6 10 9 10 5 0-3-5-5-10-5Z", C.coral, 2)}${p("M0-6v12M-1-7l-3-4M1-7l3-4", "none", 2)}</g>`, `class="ill-heart"`);
const bee = (x, y, s = 1) =>
  g(`<g transform="translate(${x} ${y}) scale(${s})">${p("M-3-5c-3-6 3-9 5-3M2-5c2-6 8-4 5 2", C.wall, 1.8)}${p("M-9 0a9 6 0 1 0 18 0a9 6 0 1 0-18 0Z", C.lightD, 2)}${p("M-3-5v10M3-5v10", "none", 2)}${dot(-6, -1, 1.2, C.line)}</g>`, `class="ill-heart"`);
const apple = (x, y, s = 1, fill = C.coral) =>
  `<g transform="translate(${x} ${y}) scale(${s})">${p("M0-8c-4-3-12-2-12 6 0 7 6 12 9 12 1 0 2-1 3-1s2 1 3 1c3 0 9-5 9-12 0-8-8-9-12-6Z", fill)}${p("M0-8c0-3 1-5 3-6", "none", 2)}${leaf("M2-11c3-4 8-3 9 0-3 2-7 2-9 0Z", C.leafD)}</g>`;
const maple = (x, y, s = 1, fill = C.coral, rot = 0) =>
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${p("M0-11l3 6 5-3-1 6 5 1-5 4 1 3-8-2-8 2 1-3-5-4 5-1-1-6 5 3Z", fill, 1.8)}${p("M0 0v8", "none", 1.8)}</g>`;
const umbrella = (x, y, s = 1, fill = C.coral) =>
  `<g transform="translate(${x} ${y}) scale(${s})">${p("M-22 0a22 18 0 0 1 44 0c-3-3-8-3-11 0-3-3-8-3-11 0-3-3-8-3-11 0-3-3-8-3-11 0Z", fill)}${p("M0 0v22a4 4 0 0 1-8 0", "none", 2.5)}${p("M0-18v-3", "none", 2.5)}</g>`;
const mushroom = (x, y, s = 1, cap = C.coral) =>
  `<g transform="translate(${x} ${y}) scale(${s})">${p("M-5 0v-10h10V0Z", C.wall)}${p("M-14-10c0-9 6-14 14-14s14 5 14 14Z", cap)}${dot(-6, -16, 2, C.wall)}${dot(4, -19, 1.6, C.wall)}${dot(7, -13, 1.4, C.wall)}</g>`;
const pumpkin = (x, y, s = 1) =>
  `<g transform="translate(${x} ${y}) scale(${s})">${p("M0-18c-12-2-20 4-20 11 0 6 7 9 20 9s20-3 20-9c0-7-8-13-20-11Z", C.coral)}${p("M-7-18c-4 4-4 16 0 20M7-18c4 4 4 16 0 20", "none", 2)}${p("M0-18c0-4 1-6 4-7", "none", 2.5)}${leaf("M3-21c4-3 9-1 9 2-4 1-7 1-9-2Z", C.leafD)}</g>`;
const candle = (x, y, s = 1) =>
  `<g transform="translate(${x} ${y}) scale(${s})">${g(`<path d="M0-30c-4 4-4 8 0 9 4-1 4-5 0-9Z" fill="${C.lightD}" ${L(2)}/>`, `class="ill-heart"`)}${rect(-6, -20, 12, 24, 3, C.wall)}${p("M0-21v-2", "none", 2)}${p("M-10 4h20", "none", 2.5)}</g>`;
const book = (x, y, s = 1, fill = C.leaf) =>
  `<g transform="translate(${x} ${y}) scale(${s})">${p("M-18 0h36v-7h-36Z", fill)}${p("M-18-7h36v-6h-36Z", C.lav)}${p("M-14-4h20M-14-10h24", "none", 1.5)}</g>`;
const mitten = (x, y, s = 1, fill = C.coral, flip = false) =>
  `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})">${p("M-8 6v-16a8 8 0 0 1 16 0v4l4-3a3 3 0 0 1 4 4l-8 9v2Z", fill)}${p("M-9 6h17v6h-17Z", C.wall, 2.2)}${p("M-4-6h.1M2-2h.1M-3 1h.1", "none", 2.5)}</g>`;
const gift = (x, y, s = 1, fill = C.coral) =>
  `<g transform="translate(${x} ${y}) scale(${s})">${rect(-14, -18, 28, 20, 3, fill)}${rect(-16, -24, 32, 7, 2, fill)}${p("M0-24v26", "none", 2.5, "")}${p("M0-24c-4-7-12-6-10-1 2 3 10 1 10 1Zm0 0c4-7 12-6 10-1-2 3-10 1-10 1Z", C.lemon, 2)}</g>`;
const snowman = (x, y, s = 1) =>
  `<g transform="translate(${x} ${y}) scale(${s})">${circle(0, -12, 13, C.wall)}${circle(0, -33, 9, C.wall)}${p("M-1-33l9 2-9 2Z", C.coral, 1.8)}${dot(-3, -36, 1.4, C.line)}${dot(3, -36, 1.4, C.line)}${p("M-9-27c5 3 13 3 18 0l1 4c-6 3-14 3-20 0Z", C.coral, 2)}${p("M-13-14l-9-6M13-14l9-6", "none", 2.2)}${dot(0, -15, 1.4, C.line)}${dot(0, -9, 1.4, C.line)}</g>`;
const hedgehog = (x, y, s = 1) =>
  `<g transform="translate(${x} ${y}) scale(${s})">${p("M-18 0c-2-8 2-16 12-18l2 4 3-5 3 4 4-3 2 5 4-2 1 5 4 0-2 5c2 2 3 4 3 5Z", C.leafD)}${p("M12 0c0-5 3-8 8-8 3 0 5 2 7 5-2 3-6 3-8 3Z", C.peach)}${dot(20, -5, 1.4, C.line)}${dot(27.5, -3, 1.6, C.line)}${p("M-14 0h40", "none", 2.5)}</g>`;
const strawberry = (x, y, s = 1) =>
  `<g transform="translate(${x} ${y}) scale(${s})">${p("M-8-6c0 9 5 14 8 14s8-5 8-14c-3-2-13-2-16 0Z", C.coral, 2)}${p("M-8-6l3-3 3 2 2-3 2 3 3-2 3 3", C.leafD, 1.8)}${dot(-3, -1, 0.9, C.lemon)}${dot(3, 0, 0.9, C.lemon)}${dot(0, 4, 0.9, C.lemon)}</g>`;
const waves = (y, x0 = 14, x1 = 106) => {
  let d = `M${x0} ${y}`;
  for (let x = x0; x < x1; x += 12) d += `q3-4 6 0t6 0`;
  return p(d, "none", 2.2, `stroke="${C.lavD}"`).replace(`stroke="${C.line}"`, "");
};
const window_ = (x, y, w, h, inner) =>
  rect(x, y, w, h, 4, C.light) + inner + p(`M${x + w / 2} ${y}v${h}M${x} ${y + h / 2}h${w}`, "none", 2.2) + rect(x, y, w, h, 4, "none") + p(`M${x - 4} ${y + h + 2}h${w + 8}`, "none", 3);
const garland = (x0, x1, y) => {
  let s = p(`M${x0} ${y}Q${(x0 + x1) / 2} ${y + 12} ${x1} ${y}`, "none", 1.8);
  const cols = [C.coral, C.lightD, C.leaf, C.lavD];
  for (let i = 1; i < 6; i++) {
    const t = i / 6, px = x0 + (x1 - x0) * t, py = y + 12 * 2 * t * (1 - t) + 3;
    s += g(circle(px.toFixed(1), py.toFixed(1), 2.6, cols[i % 4], 1.4), `class="ill-heart"`);
  }
  return s;
};

// ---- scenes -----------------------------------------------------------------------------
const S = {};
// Spring
S["spring-sprout"] = ground() + sway(leaf("M58 62c-9-2-13-11-9-19 8 2 12 11 9 19Z") + leaf("M60 62c1-10 9-15 17-13-1 9-9 14-17 13Z", C.leafD), 59, 64) + p("M59 74V60", "none", 2.5) + pot(59, 74, 26, 18) +
  p("M84 60h16l-3 22H87Z", C.lav) + p("M100 64l8-6M84 66c-6-2-8 3-4 7", "none", 2.5) + drop(76, 52, 0.9) + drop(70, 44, 0.7) + sparkle(34, 34, 0.9);
S["spring-tulips"] = ground() + sway(stem(48, 78, 44, 42) + stem(60, 78, 60, 34) + stem(72, 78, 77, 44) + leaf("M52 72c-8-4-10-12-6-17 6 3 8 10 6 17Z") + leaf("M68 72c2-9 9-13 15-11-2 7-8 11-15 11Z", C.leafD) +
  tulip(44, 42, C.coral) + tulip(60, 34, C.lavD) + tulip(77, 44, C.lightD), 60, 78) + p("M46 76h28l-3 17H49Z", C.mint) + heart(84, 20, 0.8);
S["spring-window"] = window_(30, 18, 60, 50, cloud(40, 28, 0.6) + sun(76, 30, 5)) + p("M26 70h68l-4 14H30Z", C.peach) +
  sway(flower(40, 62, C.coral, 3.5) + flower(60, 60, C.lavD, 3.5) + flower(80, 62, C.lightD, 3.5) + leaf("M50 70c-4-6-2-10 2-12 2 4 2 9-2 12Z") + leaf("M70 70c-2-6 1-10 5-11 1 5-1 9-5 11Z", C.leafD), 60, 70);
S["spring-bird"] = p("M10 50c25-4 55 2 100-6", "none", 3) + p("M34 49c4-6 3-12-2-14M78 46c6-5 10-5 14-2", "none", 2) +
  flower(30, 34, C.peach, 4) + flower(94, 40, C.peach, 4) + flower(18, 46, C.lav, 3) + bird(60, 36, 1.1, C.coral) + heart(74, 14, 0.8) + leaf("M46 50c-2 5-7 7-10 5 2-4 6-6 10-5Z") + leaf("M86 45c2 5 7 6 10 4-2-4-6-5-10-4Z", C.leafD);
S["spring-rain"] = cloud(30, 10, 1.4, C.lav) + drop(36, 40) + drop(52, 48) + drop(68, 38) + ground() + umbrella(78, 64, 0.8, C.coral) +
  sway(leaf("M30 92c-6-3-8-10-5-15 6 2 8 9 5 15Z") + leaf("M32 92c1-7 6-10 11-9-1 6-6 9-11 9Z", C.leafD), 31, 92) + p("M22 93q10-3 20 0", "none", 2, `stroke="${C.lavD}"`).replace(`stroke="${C.line}"`, "");
S["spring-kite"] = cloud(14, 52, 0.9) + cloud(76, 66, 0.7) + g(p("M70 14 86 30 70 50 54 30Z", C.coral) + p("M70 14v36M54 30h32", "none", 2) + p("M70 50c-4 8 4 12-2 20s4 12-2 18", "none", 2) +
  p("M66 60l-5-2 1 5ZM70 72l-5-2 1 5Z", C.lightD, 1.6), `class="ill-sway" style="transform-origin:70px 88px"`) + sparkle(30, 26, 1);
S["spring-blossom"] = ground() + house(84, 92, 0.9) + p("M38 92V58", "none", 3.5) + p("M38 70l-8-6M38 64l9-7", "none", 2.5) +
  circle(38, 46, 20, C.peach) + flower(30, 40, C.coral, 3) + flower(46, 38, C.coral, 3) + flower(38, 54, C.coral, 3) + flower(48, 52, C.lav, 2.6) + heart(56, 18, 0.7);
S["spring-tea"] = ground(56, 40) + mug(56, 64, C.mint) + sway(stem(80, 92, 84, 60) + flower(84, 56, C.wall, 5) + leaf("M82 80c-6-2-8-8-5-12 5 2 7 7 5 12Z"), 82, 92) + p("M30 90h52", "none", 2.5) + sparkle(30, 36, 0.8);
S["spring-bee"] = ground() + sway(stem(36, 92, 34, 52) + flower(34, 48, C.coral, 5) + leaf("M35 76c-7-1-10-7-8-12 6 1 9 6 8 12Z"), 36, 92) +
  sway(stem(70, 92, 72, 60) + flower(72, 56, C.lavD, 4.5) + leaf("M71 82c5-5 11-5 14-2-4 4-9 4-14 2Z", C.leafD), 70, 92) + bee(92, 34, 1.1) + p("M80 36c-6 2-8 8-4 10", "none", 1.6, `stroke-dasharray="2 4"`);
S["spring-snowdrops"] = ground() + sun(90, 22, 7) + sway(p("M40 92c0-14 2-24 8-30M56 92c0-12 0-22-4-30M68 92c0-12 2-20 8-26", "none", 2) +
  p("M48 62c-6 0-8 6-6 12 2-2 4-3 6-3 2 0 4 1 6 3 2-6 0-12-6-12Z", C.wall, 2) + p("M52 62c-6 0-8 6-6 12 2-2 4-3 6-3 2 0 4 1 6 3 2-6 0-12-6-12Z", C.wall, 2).replace("M52 62", "M52 62") +
  p("M76 66c-5 0-7 5-5 10 1-2 3-3 5-3s4 1 5 3c2-5 0-10-5-10Z", C.wall, 2) + leaf("M38 92c-4-8-2-16 4-20 2 8 0 15-4 20Z") + leaf("M62 92c-1-9 3-15 9-17 0 8-4 14-9 17Z", C.leafD), 55, 92) + flake(26, 30, 1);
// Summer
S["summer-sun"] = sun(78, 30, 11) + p("M8 86c14-22 34-26 52-12 14-16 34-16 52 4v8H8Z", C.leaf) + p("M30 88c10-10 22-12 32-6", "none", 2) + tree(26, 80, C.leafD, 22) + cloud(16, 22, 0.7) + heart(46, 18, 0.7);
S["summer-sunflowers"] = ground() + sway(stem(44, 92, 40, 40) + stem(72, 92, 76, 30) + leaf("M42 70c-8-1-12-7-10-12 7 1 11 6 10 12Z") + leaf("M74 64c5-6 12-6 15-3-4 5-10 5-15 3Z", C.leafD) +
  flower(40, 36, C.lightD, 7) + flower(76, 26, C.lightD, 7), 58, 92) + dot(40, 36, 3.6, C.coralD) + dot(76, 26, 3.6, C.coralD) + bee(98, 52, 0.8);
S["summer-lemonade"] = ground(58, 38) + p("M44 42h28l-3 48H47Z", C.light) + p("M45 54h26", "none", 2) + p("M64 42l8-22", "none", 2.5) + circle(46, 42, 8, C.lemon, 2) + p("M46 34v16M38 42h16", "none", 1.4) +
  rect(52, 62, 7, 7, 2, C.wall, 1.8) + rect(60, 72, 7, 7, 2, C.wall, 1.8) + sun(94, 24, 6) + leaf("M82 88c-2-7 2-12 8-13 1 7-3 12-8 13Z");
S["summer-sailboat"] = sun(26, 22, 7) + p("M60 16v48", "none", 2.5) + p("M60 18c14 8 22 24 22 42H60Z", C.wall) + p("M58 26c-10 8-16 20-16 34h16Z", C.coral) + p("M34 66h56l-8 12H42Z", C.peach) +
  waves(84, 10, 110) + waves(92, 22, 98) + bird(92, 20, 0.5, C.lav);
S["summer-strawberries"] = ground() + p("M24 60h72l-6 30H30Z", C.peach) + p("M30 70h60M28 80h64", "none", 1.6) + strawberry(38, 52, 1) + strawberry(56, 48, 1.1) + strawberry(76, 52, 1) +
  p("M28 60c4-22 60-22 64 0", "none", 2.5) + heart(90, 20, 0.8);
S["summer-picnic"] = p("M10 80l30-14 70 6-26 18Z", C.coral) + p("M26 73l58 11M48 69l14 20M72 70l-6 18", "none", 1.6, `stroke="${C.wall}"`).replace(`stroke="${C.line}"`, "") + p("M10 80l30-14 70 6-26 18Z", "none") +
  p("M46 60h24l-3 14H49Z", C.lemon) + p("M50 60c0-10 16-10 16 0", "none", 2.5) + apple(82, 70, 0.6) + cloud(16, 18, 0.8) + sun(94, 22, 6);
S["summer-butterfly"] = ground() + sway(stem(40, 92, 38, 60) + flower(38, 56, C.coral, 4.5) + stem(62, 92, 64, 66) + flower(64, 62, C.lightD, 4) + leaf("M39 80c-6-2-9-8-6-12 5 2 8 7 6 12Z") + leaf("M63 82c4-5 10-5 13-2-4 4-9 4-13 2Z", C.leafD), 50, 92) +
  butterfly(84, 34, 1.1) + p("M70 48c-6 4-8 2-10 8", "none", 1.6, `stroke-dasharray="2 4"`);
S["summer-tent"] = moon(28, 22, 9) + star(54, 14, 1) + star(92, 22, 0.8) + star(76, 10, 0.7) + ground() + p("M30 90 60 40l30 50Z", C.lightD) + p("M60 40 52 90h16Z", C.coral) + p("M60 40v-6", "none", 2.5) + p("M24 90h72", "none", 2.5) + tree(102, 90, C.leafD, 24);
S["summer-icecream"] = ground(60, 30) + p("M48 50h24L60 90Z", C.lightD) + p("M52 58l14 14M56 52l12 12M64 52 54 66", "none", 1.4) + circle(60, 40, 12, C.peach) + circle(52, 46, 8, C.mint) + circle(68, 46, 8, C.lav) +
  p("M60 28c2-4 6-4 6-1", "none", 2) + dot(64, 27, 3, C.coral) + sparkle(88, 26, 1) + sun(24, 22, 5);
S["summer-cat"] = sun(92, 20, 7) + p("M16 84h88l-6 8H22Z", C.lav) + p("M24 84h72", "none", 2.5) + sleepyCat(62, 84, 1.2, C.peach) + p("M78 48h6l-6 6h6M88 38h4l-4 4h4", "none", 1.8);
// Autumn
S["autumn-mug"] = ground(60, 40) + mug(56, 64, C.coral) + maple(88, 30, 0.9, C.lightD, 20) + maple(26, 40, 0.8, C.coral, -25) + maple(94, 66, 0.6, C.peach, 50) + p("M28 90h56", "none", 2.5);
S["autumn-umbrella"] = drop(20, 14, 0.8) + drop(96, 22, 0.8) + drop(30, 40, 0.7) + drop(102, 50, 0.7) + umbrella(60, 42, 1.1, C.coral) + ground() + p("M30 92q12-4 24 0", "none", 2, `stroke="${C.lavD}"`).replace(`stroke="${C.line}"`, "") + maple(84, 84, 0.7, C.lightD, 30);
S["autumn-pumpkin"] = ground() + pumpkin(58, 90, 1.2) + maple(92, 82, 0.7, C.coral, 20) + maple(22, 78, 0.6, C.lightD, -20) + sparkle(90, 30, 0.9);
S["autumn-leaves"] = ground() + p("M44 92V52M44 66l-10-8M44 60l9-9", "none", 3.5) + circle(44, 40, 20, C.lightD) + circle(32, 46, 9, C.coral, 2) + circle(56, 32, 8, C.coral, 2) +
  maple(76, 40, 0.8, C.coral, 30) + maple(90, 62, 0.7, C.lightD, -20) + maple(70, 78, 0.6, C.coralD, 60) + maple(96, 86, 0.5, C.peach, 0);
S["autumn-window"] = window_(26, 14, 52, 52, drop(36, 22, 0.7) + drop(60, 30, 0.7) + drop(44, 44, 0.6) + drop(66, 52, 0.6)) + candle(94, 66, 0.9) + book(52, 86, 1, C.leaf) + p("M20 90h84", "none", 2.5);
S["autumn-apples"] = ground() + p("M26 62h68l-6 28H32Z", C.peach) + p("M32 72h56M30 82h60", "none", 1.6) + apple(42, 56, 1, C.coral) + apple(60, 52, 1.05, C.lightD) + apple(78, 56, 1, C.coralD) + apple(96, 86, 0.7, C.coral);
S["autumn-mushrooms"] = ground() + mushroom(50, 92, 1.3, C.coral) + mushroom(76, 92, 0.9, C.lightD) + leaf("M20 92c2-8 8-12 14-10-2 7-8 10-14 10Z", C.leafD) + maple(96, 70, 0.6, C.coral, 30) + drop(30, 30, 0.8) + drop(88, 24, 0.8);
S["autumn-book"] = ground() + book(46, 90, 1.2, C.coral) + book(46, 76, 1.1, C.leaf) + book(46, 63, 1, C.lightD) + mug(88, 66, C.lav) + maple(24, 34, 0.8, C.coral, -20) + maple(64, 30, 0.7, C.lightD, 25);
S["autumn-house"] = ground() + house(52, 92, 1.4, C.coral, C.light) + g(p("M70 34c-3-3 3-5 0-9", "none", 2.2, `stroke="${C.smoke}"`).replace(`stroke="${C.line}"`, ""), `class="ill-smoke"`) + rect(66, 36, 7, 12, 2, C.coralD) +
  maple(96, 34, 0.8, C.lightD, 30) + maple(88, 70, 0.6, C.coral, -30) + maple(20, 50, 0.7, C.coral, 10) + tree(100, 92, C.lightD, 26);
S["autumn-hedgehog"] = ground() + hedgehog(52, 90, 1.2) + apple(84, 82, 0.6, C.coral) + maple(30, 40, 0.8, C.lightD, 20) + maple(84, 34, 0.7, C.coral, -20) + mushroom(22, 92, 0.6, C.coral);
// Winter
S["winter-snowman"] = ground() + snowman(56, 92, 1.1) + flake(20, 24, 1) + flake(92, 18, 1.1) + flake(98, 54, 0.8) + flake(30, 56, 0.8) + fir(98, 92, 0.6);
S["winter-window"] = garland(16, 104, 8) + window_(32, 26, 56, 48, star(44, 36, 1) + moon(74, 36, 6) + flake(52, 62, 0.8) + flake(76, 64, 0.7)) + candle(46, 90, 0.5) + p("M60 82h16l-2 8H62Z", C.peach, 2) + sway(leaf("M68 82c-5-3-6-9-3-12 4 3 5 8 3 12Z") + leaf("M68 82c1-6 5-9 9-8-1 5-5 8-9 8Z", C.leafD), 68, 82);
S["winter-cocoa"] = ground(56, 40) + mug(56, 64, C.coral) + p("M44 70h24", "none", 1.6) + dot(52, 66, 3.4, C.wall) + dot(60, 67, 3, C.wall) + flake(24, 30, 1) + flake(92, 28, 1.1) + flake(96, 60, 0.8) + p("M28 90h56", "none", 2.5);
S["winter-mittens"] = mitten(44, 56, 1.4, C.coral) + mitten(78, 60, 1.4, C.lavD, true) + p("M44 74c8 10 26 12 34 4", "none", 2) + flake(24, 24, 1) + flake(96, 22, 0.9);
S["winter-tree"] = ground() + fir(60, 88, 1.6) + star(60, 30, 1.8) + g(dot(52, 58, 2.6, C.coral) + dot(68, 64, 2.6, C.lightD) + dot(56, 74, 2.6, C.lav) + dot(70, 50, 2.4, C.coral), `class="ill-heart"`) + gift(94, 92, 0.6) + flake(24, 26, 1);
S["winter-house"] = p("M8 88c20-6 40-6 52-2 16-6 36-6 52 0v6H8Z", C.wall) + house(60, 86, 1.5, C.lavD, C.lightD) + p("M28 34c8-4 16 0 18 2", "none", 0) + flake(20, 28, 1) + flake(98, 30, 1) + flake(92, 60, 0.7) + fir(18, 88, 0.6) + fir(104, 88, 0.5);
S["winter-candle"] = ground(60, 34) + candle(60, 86, 1.8) + p("M36 90c4-6 12-4 12 0M72 90c4-6 12-4 12 0", "none", 2) + leaf("M36 88c-6-4-6-10-2-13 4 3 4 9 2 13Z", C.leafD) + leaf("M84 88c6-4 6-10 2-13-4 3-4 9-2 13Z", C.leafD) + dot(40, 82, 2, C.coral) + dot(80, 82, 2, C.coral) + sparkle(30, 26, 0.9) + sparkle(92, 36, 0.7);
S["winter-cat"] = p("M14 84c0-10 12-14 46-14s46 4 46 14Z", C.lav) + p("M22 78h76M26 72l4 12M40 70l2 14M56 70v14M70 70l-1 14M86 72l-3 12", "none", 1.2) + sleepyCat(60, 78, 1.1, C.peach) + flake(22, 24, 1) + flake(98, 26, 0.9) + heart(80, 34, 0.8);
S["winter-gift"] = ground() + gift(52, 92, 1.5, C.coral) + gift(86, 92, 0.9, C.leaf) + sparkle(26, 34, 1) + sparkle(96, 40, 0.8) + flake(30, 64, 0.8);
S["winter-night"] = moon(86, 24, 10) + star(30, 18, 1) + star(56, 30, 0.8) + star(18, 46, 0.7) + flake(42, 52, 0.9) + flake(70, 50, 0.8) + ground() + fir(36, 92, 1) + fir(62, 92, 1.3) + fir(88, 92, 0.9);

// ---- output ------------------------------------------------------------------------------
const out = join(root, "public", "daily");
mkdirSync(out, { recursive: true });
const ids = Object.keys(S);
for (const id of ids) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100">${S[id]}</svg>\n`;
  if (/<script|\son\w+=|href=/i.test(svg)) throw new Error(`unsafe content in ${id}`);
  writeFileSync(join(out, `${id}.svg`), svg);
}
const bySeason = { spring: [], summer: [], autumn: [], winter: [] };
for (const id of ids) bySeason[id.split("-")[0]].push(id);
writeFileSync(
  join(root, "src", "features", "daily", "art-manifest.ts"),
  `// Generated by scripts/daily-art.mjs — do not edit by hand.\nexport const ART_BY_SEASON = ${JSON.stringify(bySeason, null, 2).replace(/"(\w+)":/g, "$1:")} as const;\n`,
);
console.log(`${ids.length} illustrations →`, out);
