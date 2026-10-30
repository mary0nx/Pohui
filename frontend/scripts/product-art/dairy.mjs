// Молочные продукты и яйца.
import { C, E, P, R, S, bottle, bowl, carton, heap, hl, mini, rot, seeded, shadow } from "./lib.mjs";

const leafAt = (x, y, deg, s, fill = "#6fb35a") =>
  `<path transform="translate(${x} ${y}) rotate(${deg}) scale(${s})" d="M0 0C3-5 10-7 15-5C11 1 5 3 0 0Z" fill="${fill}"/>`;
const cowSpots = (x, y) => E(x - 6, y - 2, 4, 3, "#3b4a5a") + E(x + 5, y + 3, 3, 2.4, "#3b4a5a") + E(x + 7, y - 4, 1.8, 1.4, "#3b4a5a");

export default {
  milk: (c) =>
    bottle(c, { x: 56, top: 26, w: 36, h: 78, nw: 16, nh: 12, body: ["#ffffff", "#e6ecf5"], cap: ["#7fb2f0", "#4a86d8"], label: "#cfe2fb", labelH: 24, art: cowSpots(56, 80) }) +
    R(80, 74, 20, 30, 4, "#ffffff", `opacity=".6"`) + R(82, 80, 16, 22, 3, c.lg("#ffffff", "#e9eef6")) + hl(85, 84, 1.5, 6, 0, 0.6),
  kefir: (c) =>
    bottle(c, { x: 62, top: 22, w: 32, h: 82, nw: 13, nh: 16, shoulder: 10, body: ["#fbfcff", "#dfe7ef"], cap: ["#7cd08a", "#3f9b55"], label: "#d4f0d9", labelH: 34, art: mini.leaf(64, 84, 1.3, "#4f9a55") + R(50, 72, 24, 3, 1.5, "#4f9a55", `opacity=".5"`) }) +
    S("M48 46H76M48 52H76", "#cfd8e2", 1),
  yogurt: (c) =>
    shadow(60, 30) +
    P("M38 52H86L80 100Q80 104 76 104H48Q44 104 44 100Z", c.lg("#ffffff", "#e8e2f2", 0, 0, 1, 0)) +
    R(40, 66, 44, 22, 0, "#f7b6c8") + mini.berry(58, 77, 4) + mini.berry(66, 77, 4) + mini.leaf(64, 72, 0.6, "#5fa54c") +
    E(62, 52, 24, 5, "#ffd2df") + E(62, 52, 21, 3.6, "#fff5f8") +
    P("M80 48Q96 34 100 44Q92 48 84 54Z", "#e3e6ee") +
    rot(R(66, 18, 7, 44, 3.5, c.lg("#f2f4f8", "#b9c2cf", 0, 0, 1, 0)) + E(69.5, 18, 6, 9, "#dfe4ec"), 18, 70, 50) +
    R(44, 56, 4, 40, 2, "#fff", `opacity=".5"`),
  "sour-cream": (c) =>
    bowl(c, {
      x: 64, y: 70, w: 74, depth: 28, color: ["#8fb6e8", "#4f7fc2"], rim: "#ffffff",
      content: E(64, 70, 34, 7, "#fffdf6") + P("M44 70Q50 54 64 52Q78 54 84 70Z", c.lg("#ffffff", "#f3eedf")) + S("M54 64Q60 56 68 60Q74 62 72 56", "#e9e0c8", 2) + P("M64 50Q66 44 62 40Q70 44 66 52Z", "#ffffff"),
    }),
  cream: (c) =>
    carton(c, { x: 58, y: 54, w: 32, h: 46, d: 12, front: ["#fffaf0", "#f1e4c7"], side: "#e6d4ad", top: ["#fff5dc", "#ecdcb6"], band: "#f7d27a", art: mini.drop(58, 80, 1.6, "#ffffff") }),
  "cottage-cheese": (c) =>
    bowl(c, {
      x: 64, y: 70, w: 76, depth: 28, color: ["#f7c9a8", "#e09a6c"], rim: "#fff2e6",
      content: (() => {
        const rnd = seeded("curd");
        let s = P("M30 70Q64 40 98 70Z", "#fbf6ea");
        for (let i = 0; i < 26; i++) { const t = rnd() * 2 - 1, x = 64 + t * 30, y = 70 - rnd() * 22 * (1 - t * t); s += C(x, y, 3 + rnd() * 2.5, i % 3 ? "#ffffff" : "#f0e7d2"); }
        return s;
      })(),
    }),
  cheese: (c) =>
    shadow(64, 40) +
    P("M24 74L92 46L104 66V96L24 96Z", c.lg("#ffe07a", "#f2b73a")) +
    P("M24 74L92 46L104 66L36 88Z", "#fff0a8") +
    P("M24 74L36 88V96H24Z", "#e9a82a") +
    [[58, 80, 6], [84, 74, 4.5], [72, 88, 3.5], [44, 90, 3], [94, 88, 3.2]].map(([x, y, r]) => E(x, y, r, r * 0.8, "#e9a82a")).join("") +
    E(70, 64, 4, 2, "#f2c050"),
  mozzarella: (c) =>
    bowl(c, {
      x: 64, y: 74, w: 76, depth: 26, color: ["#a8d8c0", "#5fa98a"], rim: "#eaf6f0",
      content: C(48, 64, 13, c.rg("#ffffff", "#e9eef2")) + C(76, 62, 14, c.rg("#ffffff", "#e9eef2")) + C(62, 54, 12, c.rg("#ffffff", "#e9eef2")) + leafAt(66, 46, -40, 1.5, "#3f9a45") + leafAt(66, 46, 200, 1.2, "#5fb35a"),
    }),
  feta: (c) =>
    shadow(64, 38) +
    R(30, 58, 44, 36, 4, c.lg("#ffffff", "#e8ebe6")) + P("M30 58L42 48H86L74 58Z", "#f7f9f4") + P("M74 58L86 48V84L74 94Z", "#dfe3dc") +
    [[38, 66], [56, 72], [46, 84], [64, 86], [60, 64]].map(([x, y]) => E(x, y, 1.6, 1, "#cfd5cc")).join("") +
    R(80, 82, 13, 13, 2.5, c.lg("#ffffff", "#e3e7df")) + R(94, 90, 9, 9, 2, "#f2f4ef") +
    leafAt(42, 50, -30, 0.9, "#6aa84f") + C(90, 76, 1.6, "#3a3a2a") + C(96, 80, 1.4, "#3a3a2a"),
  "cream-cheese": (c) =>
    shadow(60, 36) +
    R(28, 66, 64, 34, 10, c.lg("#cfe0ff", "#8fb0ea")) + E(60, 66, 32, 9, "#eaf1ff") + E(60, 66, 28, 7, "#fffdf8") +
    S("M42 66Q52 60 62 66Q72 70 80 64", "#efe8d6", 2.4) +
    R(36, 80, 48, 12, 4, "#ffffff", `opacity=".55"`) +
    rot(R(70, 30, 8, 30, 3, "#e3e8ef") + R(71, 58, 6, 16, 3, "#c79a6a"), 35, 74, 52),
  butter: (c) =>
    shadow(64, 42) +
    E(64, 92, 42, 10, "#d7ecf7") + E(64, 90, 38, 8, "#f4fbff") +
    P("M34 70L50 58H94L80 70Z", "#fff4b8") +
    R(34, 70, 46, 20, 2, c.lg("#ffe88f", "#f4cd52")) + P("M80 70L94 58V78L80 90Z", "#eec04a") +
    S("M54 62Q62 56 70 62Q74 66 68 66", "#fff8d6", 3),
  eggs: (c) => {
    const egg = (x, y, col, deg) => rot(E(x, y, 15, 19, c.rg(col[0], col[1])) + hl(x - 5, y - 7, 4, 6, 20, 0.5), deg, x, y);
    return shadow(64, 42) + egg(40, 78, ["#fff6ea", "#e8d4ba"], -12) + egg(88, 78, ["#f6d2a8", "#d39c62"], 12) + egg(64, 72, ["#ffffff", "#ebe1d4"], 0);
  },
  "plant-milk": (c) =>
    carton(c, {
      x: 58, y: 46, w: 36, h: 54, d: 14, front: ["#fbf3e2", "#ead9b6"], side: "#dcc69c", top: ["#f6ead0", "#e3cfa6"], band: "#cfe7b8",
      art: S("M58 92V68", "#c9a15a", 2) + [0, 1, 2, 3].map((i) => E(58 + (i % 2 ? 4 : -4), 70 + i * 5, 3, 2, "#e0b866", `transform="rotate(${i % 2 ? 30 : -30} ${58 + (i % 2 ? 4 : -4)} ${70 + i * 5})"`)).join("") + E(58, 66, 2, 3, "#e0b866"),
    }),
};
