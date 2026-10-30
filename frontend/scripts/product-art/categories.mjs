// Fallback pictures for shopping items that are not in the catalogue: a paper grocery bag with
// what that category usually holds peeking out. Deliberately generic, so they never pass for a
// specific product. File name: category-<category key>.svg.
import { C, E, P, R, S, mini, rot } from "./lib.mjs";

const leafAt = (x, y, deg, s, fill = "#6fb35a") =>
  `<path transform="translate(${x} ${y}) rotate(${deg}) scale(${s})" d="M0 0C3-5 10-7 15-5C11 1 5 3 0 0Z" fill="${fill}"/>`;

const bag = (c, inside, mark = "") =>
  E(64, 106, 34, 5, "#6b4f3a", `opacity=".1"`) +
  inside +
  P("M32 54H96L92 104H36Z", c.lg("#e8c89a", "#c99a62")) +
  P("M32 54H96L94 62H34Z", "#d9b07a") +
  R(56, 74, 16, 16, 8, "#f6e2c4") + mark +
  R(38, 64, 4, 34, 2, "#fff", `opacity=".25"`);

export default {
  "category-vegetables": (c) => bag(c, rot(R(42, 22, 10, 40, 5, "#ff9a3a"), -15, 47, 42) + C(66, 44, 13, "#7fb85a") + C(84, 46, 11, "#e8473a") + leafAt(48, 22, -100, 1.2, "#5fa54c"), mini.leaf(66, 82, 0.6, "#6fae8c")),
  "category-fruits": (c) => bag(c, C(50, 44, 12, "#e8473a") + C(70, 40, 12, "#ffb84a") + rot(P("M76 50Q86 26 100 30Q92 34 84 52Z", "#ffe27a"), 0) + leafAt(50, 32, -60, 1, "#5fa54c"), mini.berry(64, 82, 4, "#e8473a")),
  "category-dairy": (c) => bag(c, R(42, 22, 18, 36, 3, "#ffffff") + R(42, 22, 18, 8, 2, "#7fb2f0") + P("M66 50L88 38V56H66Z", "#ffe07a") + C(78, 50, 2.4, "#e9a82a"), mini.drop(64, 82, 0.8, "#7fb2f0")),
  "category-meat": (c) => bag(c, E(54, 44, 16, 11, "#ef8f86") + E(54, 44, 12, 8, "#ffc4bc") + R(70, 30, 6, 22, 3, "#fbf3e6") + C(70, 30, 4, "#fbf3e6") + C(76, 30, 4, "#fbf3e6") + E(80, 50, 10, 8, "#e88a7a"), C(64, 82, 3.5, "#ef8f86")),
  "category-fish": (c) => bag(c, rot(E(64, 44, 22, 9, "#7f98bc") + P("M84 44L96 34V54Z", "#7f98bc") + C(48, 42, 2, "#2f3b46"), -18, 64, 44), mini.drop(64, 82, 0.8, "#7f98bc")),
  "category-bakery": (c) => bag(c, rot(R(40, 20, 16, 44, 8, "#e0a050"), -12, 48, 42) + E(74, 46, 16, 11, "#f2c27a") + S("M66 44q8-6 16 0", "#fbe6b8", 2.4), mini.star(64, 82, 0.6, "#e0a050")),
  "category-grocery": (c) => bag(c, R(40, 26, 20, 32, 3, "#fff3dc") + R(40, 34, 20, 8, 0, "#e8a82a") + R(64, 30, 22, 28, 3, "#f2d27a") + C(75, 44, 5, "#ffffff"), C(64, 82, 3, "#e8a82a")),
  "category-frozen": (c) => bag(c, R(42, 30, 22, 26, 4, "#bfe0ff") + R(66, 26, 22, 30, 4, "#d8c4ff") + mini.snow(53, 43, 0.8, "#ffffff") + mini.snow(77, 41, 0.8, "#ffffff"), mini.snow(64, 82, 0.8, "#9fc2ef")),
  "category-drinks": (c) => bag(c, R(44, 18, 12, 40, 5, "#a9d6f5") + R(47, 12, 6, 8, 2, "#2f7ad0") + R(64, 24, 14, 34, 5, "#e8473a") + R(80, 30, 10, 28, 4, "#7fc49c"), mini.drop(64, 82, 0.8, "#5fa8ec")),
  "category-sweets": (c) => bag(c, R(40, 30, 24, 26, 3, "#8a5236") + C(76, 38, 10, "#f49fb6") + R(75, 46, 2.5, 14, 1, "#ffffff") + mini.star(52, 40, 0.6, "#ffd25a"), mini.star(64, 82, 0.7, "#f49fb6")),
  "category-pantry": (c) => bag(c, R(40, 28, 16, 30, 4, "#e8473a") + R(44, 22, 8, 8, 2, "#ffffff") + R(60, 34, 24, 24, 3, "#d9dfe8") + R(60, 40, 24, 12, 0, "#7fc463"), C(64, 82, 3, "#e8473a")),
  "category-household": (c) => bag(c, R(42, 28, 18, 30, 5, "#7fb8f0") + R(46, 20, 10, 10, 3, "#ffffff") + R(64, 38, 26, 14, 4, "#ffe27a") + R(64, 32, 26, 8, 3, "#7fc463"), mini.bubbles(62, 84, 0.7, "#7fb8f0")),
  "category-hygiene": (c) => bag(c, R(42, 24, 18, 34, 6, "#d8c4ff") + R(44, 18, 14, 8, 3, "#ffffff") + rot(R(66, 34, 28, 10, 5, "#ffffff") + R(66, 34, 28, 4, 2, "#5fa8ec"), -20, 80, 39), mini.flower(64, 82, 2.6, "#f49fb6")),
};
