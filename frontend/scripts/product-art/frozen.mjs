// Замороженные продукты.
import { C, E, P, R, S, hl, mini, pouch, rot, seeded, shadow } from "./lib.mjs";

export default {
  "frozen-vegetables": (c) =>
    pouch(c, {
      body: ["#bfe0ff", "#7fb0ea"], crimp: "#6a9ad8",
      window: E(64, 72, 18, 16, "#f4f9ff") + [[56, 66, "#7fc463"], [64, 74, "#7fc463"], [70, 64, "#ffa64d"], [58, 78, "#ffd25a"], [72, 78, "#7fc463"], [64, 62, "#ffd25a"]].map(([x, y, col]) => C(x, y, 3.6, col)).join(""),
      art: mini.snow(84, 46, 1.2, "#ffffff") + mini.snow(44, 92, 0.8, "#ffffff"),
    }),
  "frozen-berries": (c) =>
    pouch(c, {
      body: ["#d8c4ff", "#9a7ae0"], crimp: "#7f5fcc",
      window: E(64, 72, 18, 16, "#f6f2ff") + mini.berry(58, 68, 5, "#d9415a") + mini.berry(70, 66, 4.5, "#3f5fb8") + mini.berry(64, 78, 5, "#c4284c") + mini.berry(74, 78, 4, "#3f5fb8") + mini.berry(54, 78, 4, "#3f5fb8"),
      art: mini.snow(84, 46, 1.2, "#ffffff") + mini.snow(44, 92, 0.8, "#ffffff"),
    }),
  "ice-cream": (c) => {
    let cone = P("M44 64L64 108L84 64Z", c.lg("#f2c27a", "#d08a3a"));
    for (let i = -2; i <= 2; i++) cone += S(`M${54 + i * 8} 64L${74 + i * 8} 100M${74 - i * 8} 64L${54 - i * 8} 100`, "#c27a2a", 1.2, `opacity=".5"`);
    return shadow(64, 18, 108) + cone + C(54, 56, 14, c.rg("#ffd2e0", "#f08aa8")) + C(76, 56, 14, c.rg("#fff4e0", "#ead2a8")) + C(65, 40, 13, c.rg("#b88a6a", "#7a4a2a")) + C(66, 26, 4, "#e23a4a") + hl(60, 36, 4, 2, -30, 0.5);
  },
  pierogi: (c) => {
    const pi = (x, y, deg) => {
      let t = P(`M${x - 24} ${y + 6}Q${x} ${y - 30} ${x + 24} ${y + 6}Z`, c.rg("#fffaf0", "#eadbc0"));
      for (let i = 0; i < 9; i++) { const a = Math.PI + (i / 8) * Math.PI, px = x + Math.cos(a) * 21, py = y + 6 + Math.sin(a) * 26 * 0.95; t += C(px, py, 2.6, "#e8d6b6"); }
      return rot(t, deg, x, y);
    };
    return shadow(64, 42) + pi(48, 74, -10) + pi(82, 70, 12) + pi(64, 94, 0);
  },
  pelmeni: (c) => {
    const pel = (x, y, s) => C(x, y, 9 * s, c.rg("#fffaf0", "#e6d4b2")) + P(`M${x - 12 * s} ${y + 2 * s}Q${x} ${y + 12 * s} ${x + 12 * s} ${y + 2 * s}Q${x + 8 * s} ${y + 8 * s} ${x} ${y + 8 * s}Q${x - 8 * s} ${y + 8 * s} ${x - 12 * s} ${y + 2 * s}Z`, "#f2e4c8") + C(x - 3 * s, y - 3 * s, 2 * s, "#fff", `opacity=".6"`);
    const rnd = seeded("pel");
    let s = shadow(64, 42);
    for (const [x, y] of [[44, 82], [60, 86], [76, 84], [90, 80], [52, 70], [68, 72], [84, 68], [60, 58], [76, 56]]) s += pel(x + rnd() * 2, y, 1);
    return s + mini.snow(36, 52, 0.9, "#9fc2ef");
  },
  "frozen-pizza": (c) =>
    shadow(64, 44) +
    R(20, 68, 88, 32, 6, c.lg("#7fb0ea", "#4a7fc8")) + P("M20 68L32 60H96L108 68Z", "#9cc3ef") +
    C(64, 62, 30, c.rg("#f7c579", "#c9822f")) + C(64, 62, 25, "#e8573a") + C(64, 62, 23, "#ffd27a", `opacity=".55"`) +
    [[54, 54], [72, 52], [62, 66], [76, 68], [48, 66]].map(([x, y]) => C(x, y, 4, "#c42d3a")).join("") +
    [[60, 50], [80, 60], [52, 74]].map(([x, y]) => P(`M${x} ${y}l3-4l3 4z`, "#4f9a45")).join("") +
    mini.snow(98, 88, 1, "#ffffff") + mini.snow(30, 88, 0.8, "#ffffff"),
  fries: (c) => {
    let s = shadow(64, 30);
    for (const [x, deg, h] of [[46, -14, 46], [54, -6, 52], [62, 0, 54], [70, 6, 50], [78, 12, 46], [58, -3, 44], [74, 9, 40]]) s += rot(R(x - 3.5, 52 - h, 7, h, 2, c.lg("#ffe08a", "#f2b23a")), deg, x, 60);
    s += P("M38 56H90L84 104H44Z", c.lg("#ff6a5a", "#d8322a"));
    s += P("M38 56Q64 70 90 56", "none", `stroke="#ff9a8a" stroke-width="2"`);
    return s + mini.star(64, 82, 1.4, "#ffe08a");
  },
  "fish-sticks": (c) => {
    const st = (x, y, deg) => rot(R(x - 26, y - 8, 52, 16, 4, c.lg("#ffb84a", "#e0852a")) + R(x - 24, y - 6, 48, 3, 1.5, "#ffe0a0", `opacity=".6"`) + [[-14, 2], [0, -2], [12, 3], [-4, 4]].map(([dx, dy]) => C(x + dx, y + dy, 1, "#c96a1a")).join(""), deg, x, y);
    return shadow(64, 42) + st(56, 60, -8) + st(72, 76, 6) + st(54, 92, -2) + E(96, 98, 7, 3, "#fff5b8") + E(94, 96, 4, 2, "#f2d23c");
  },
  ice: (c) => {
    const cube = (x, y, s, deg) => rot(R(x - 14 * s, y - 14 * s, 28 * s, 28 * s, 6 * s, c.lg("#eef8ff", "#9cd2f5")) + R(x - 10 * s, y - 10 * s, 8 * s, 5 * s, 2.5 * s, "#fff", `opacity=".8"`) + R(x - 14 * s, y - 14 * s, 28 * s, 28 * s, 6 * s, "none", `stroke="#ffffff" stroke-width="1.5" opacity=".7"`), deg, x, y);
    return shadow(64, 40) + cube(46, 78, 1, -12) + cube(80, 80, 0.9, 14) + cube(64, 56, 0.85, 4);
  },
};
