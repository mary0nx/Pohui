// Хлеб и выпечка.
import { C, E, P, R, S, hl, rot, seeded, shadow } from "./lib.mjs";

const crust = ["#f7c579", "#c9822f"];

export default {
  bread: (c) =>
    shadow(64, 44) +
    P("M22 86Q20 54 64 50Q108 54 106 86Q106 96 96 96H32Q22 96 22 86Z", c.rg("#f9cf88", "#c47d2c", 0.4, 0.3)) +
    S("M38 66Q44 58 50 62M56 60Q62 52 68 56M74 60Q80 52 86 58", "#fbe6b8", 4) +
    hl(40, 70, 10, 3, -10, 0.35),
  "rye-bread": (c) => {
    const rnd = seeded("rye");
    let s = shadow(60, 42) + C(56, 72, 30, c.rg("#9a6a48", "#4e2f1e"));
    for (let i = 0; i < 18; i++) s += E(36 + rnd() * 40, 52 + rnd() * 36, 1.6, 0.9, "#d8c19a", `transform="rotate(${rnd() * 180} 56 72)"`);
    s += S("M40 62Q56 54 72 62M40 76Q56 68 72 76", "#c8a882", 1.4, `opacity=".6"`);
    s += rot(R(80, 60, 20, 38, 5, "#5a3624") + R(83, 63, 14, 32, 3, "#8a6450"), 12, 90, 80);
    return s;
  },
  "toast-bread": (c) => {
    const slice = (x, y, deg) => rot(P(`M${x - 20} ${y + 22}V${y - 6}Q${x - 24} ${y - 22} ${x - 8} ${y - 22}Q${x} ${y - 30} ${x + 8} ${y - 22}Q${x + 24} ${y - 22} ${x + 20} ${y - 6}V${y + 22}Z`, "#d9984a") + P(`M${x - 16} ${y + 18}V${y - 6}Q${x - 19} ${y - 18} ${x - 7} ${y - 18}Q${x} ${y - 25} ${x + 7} ${y - 18}Q${x + 19} ${y - 18} ${x + 16} ${y - 6}V${y + 18}Z`, c.lg("#fff4dc", "#f4dcae")), deg, x, y);
    return shadow(64, 42) + slice(44, 70, -12) + slice(64, 68, 0) + slice(84, 72, 12);
  },
  rolls: (c) => {
    const bun = (x, y, s) => E(x, y, 18 * s, 14 * s, c.rg(crust[0], crust[1], 0.4, 0.3)) + S(`M${x - 8 * s} ${y - 6 * s}Q${x} ${y - 11 * s} ${x + 8 * s} ${y - 6 * s}`, "#fbe1b0", 2.4 * s) + hl(x - 7 * s, y - 4 * s, 4 * s, 2 * s, -20, 0.45);
    return shadow(64, 42) + bun(46, 66, 1) + bun(82, 66, 0.95) + bun(64, 86, 1.05);
  },
  baguette: (c) =>
    shadow(64, 44) +
    rot(R(14, 54, 100, 22, 11, c.lg("#f7c579", "#c47d2c")) + [30, 50, 70, 90].map((x) => S(`M${x} 60l10 9`, "#fbe6b8", 3.5)).join("") + R(20, 57, 80, 3, 1.5, "#fff", `opacity=".3"`), -20),
  croissant: (c) =>
    shadow(64, 44) +
    P("M22 82Q24 60 40 54L52 74Z", c.rg(crust[0], crust[1])) +
    P("M106 82Q104 60 88 54L76 74Z", c.rg(crust[0], crust[1])) +
    P("M38 56Q50 44 64 44Q78 44 90 56L80 80Q64 86 48 80Z", c.rg("#fbd28c", "#c97f2c", 0.5, 0.3)) +
    S("M50 52Q54 66 52 80M64 46V82M78 52Q74 66 76 80", "#b8702a", 1.6, `opacity=".55"`) +
    hl(58, 54, 8, 3, -5, 0.4),
  bagel: (c) => {
    const ring = (x, y, s) => {
      const rnd = seeded("bagel" + x);
      let t = E(x, y, 22 * s, 17 * s, "none", `stroke="${c.lg("#f2b56a", "#b8722a")}" stroke-width="${12 * s}"`);
      for (let i = 0; i < 18; i++) { const a = rnd() * Math.PI * 2; t += E(x + Math.cos(a) * 22 * s, y + Math.sin(a) * 17 * s - 2, 1.2, 0.7, i % 2 ? "#fffbe8" : "#3a3030"); }
      return t;
    };
    return shadow(64, 44) + ring(78, 62, 0.85) + ring(52, 80, 1);
  },
  tortilla: (c) =>
    shadow(64, 44) +
    [0, 1, 2, 3].map((i) => E(64, 88 - i * 7, 40, 11, i === 3 ? c.rg("#fbe8b8", "#e9c98a") : "#e3c182")).join("") +
    [[52, 64], [70, 66], [80, 62], [60, 68], [46, 66]].map(([x, y]) => E(x, y, 3, 1.4, "#c9944a", `opacity=".6"`)).join(""),
  donut: (c) => {
    const rnd = seeded("donut");
    let s = shadow(64, 40) + E(64, 70, 36, 30, c.rg("#f8c98a", "#c9822f"));
    s += P("M30 66Q28 44 64 40Q100 44 98 66Q96 74 88 72Q86 82 76 76Q68 84 60 78Q50 84 44 76Q34 78 30 66Z", c.rg("#ffb6c8", "#ee7a9a"));
    s += E(64, 66, 11, 8, "#fff5ef") + E(64, 66, 11, 8, "#e8a27c", `opacity=".25"`);
    const col = ["#ffffff", "#7fc4f0", "#ffe27a", "#9fd88a"];
    for (let i = 0; i < 16; i++) { const a = rnd() * Math.PI * 2, r = 15 + rnd() * 14; s += R(64 + Math.cos(a) * r, 60 + Math.sin(a) * r * 0.8, 5, 1.8, 0.9, col[i % 4], `transform="rotate(${rnd() * 180} ${64 + Math.cos(a) * r} ${60 + Math.sin(a) * r * 0.8})"`); }
    return s + hl(44, 52, 7, 3, -25, 0.45);
  },
  cake: (c) =>
    shadow(64, 42) +
    P("M24 74L92 54V96L24 100Z", c.lg("#fff3e2", "#f2d9b8")) +
    P("M92 54L104 64V98L92 96Z", "#e9c9a0") +
    P("M24 74L92 54L104 64L36 84Z", "#ffd6e2") +
    R(24, 80, 68, 5, 2, "#f49fb6", `transform="skewY(-14) translate(0 22)"`) +
    S("M24 87L92 70M24 94L92 82", "#f6a9bf", 3) +
    C(70, 56, 7, c.rg("#ff7a8a", "#d42a4a")) + P("M66 50l4 4 4-4", "none", `stroke="#4f9a45" stroke-width="2"`),
  "sweet-bun": (c) => {
    let s = shadow(64, 40) + C(64, 70, 31, c.rg("#f8cc86", "#c97f2c"));
    let d = "M64 70";
    for (let t = 0; t < 4.2 * Math.PI; t += 0.3) { const r = 2 + t * 2.1; d += `L${(64 + Math.cos(t) * r).toFixed(1)} ${(70 + Math.sin(t) * r).toFixed(1)}`; }
    s += S(d, "#a8622a", 3, `opacity=".6"`);
    s += S("M44 56Q52 62 48 70M76 52Q72 62 82 64M60 86Q66 80 74 88", "#fff8ea", 3.5);
    return s + hl(50, 56, 8, 3, -25, 0.4);
  },
};
