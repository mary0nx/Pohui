// Соусы, специи и консервы.
import { C, E, P, R, S, bottle, bowl, can, hl, jar, mini, rot, seeded, shadow, sprig } from "./lib.mjs";

const leafAt = (x, y, deg, s, fill = "#6fb35a") =>
  `<path transform="translate(${x} ${y}) rotate(${deg}) scale(${s})" d="M0 0C3-5 10-7 15-5C11 1 5 3 0 0Z" fill="${fill}"/>`;
const tomato = (x, y, r) => C(x, y, r, "#e8473a") + [0, 72, 144, 216, 288].map((a) => leafAt(x, y - r + 1, a - 90, r / 16, "#4f9a45")).join("") + C(x - r * 0.35, y - r * 0.3, r * 0.25, "#fff", `opacity=".5"`);
const squeeze = (c, body, cap, label, art) =>
  shadow(64, 28) +
  P("M44 40Q44 34 52 34H76Q84 34 84 40L86 96Q86 104 78 104H50Q42 104 42 96Z", c.lg(body[0], body[1], 0, 0, 1, 0)) +
  P("M54 34L58 22H70L74 34Z", c.lg(cap[0], cap[1])) + R(61, 14, 6, 10, 2, cap[1]) +
  R(46, 56, 36, 30, 4, label) + art + R(48, 42, 4, 54, 2, "#fff", `opacity=".35"`);

export default {
  ketchup: (c) => squeeze(c, ["#f2554a", "#b8202a"], ["#ffffff", "#d9dfe8"], "#ffffff", tomato(64, 72, 9)),
  mayonnaise: (c) => squeeze(c, ["#fffbea", "#ece0c0"], ["#5fa8ec", "#2f7ad0"], "#cfe2fb", E(64, 72, 7, 9, "#ffffff") + E(64, 74, 3.6, 3.6, "#ffd25a")),
  mustard: (c) =>
    jar(c, { x: 60, y: 48, w: 48, h: 52, lid: ["#ffe08a", "#e0a82a"], fill: c.lg("#f7d23a", "#d8a01a"), label: "#ffffff", art: C(56, 76, 3, "#e8b42a") + C(64, 74, 2.5, "#e8b42a") + C(60, 80, 2.2, "#c9941a") }) +
    rot(R(86, 30, 6, 46, 3, "#d9b07a") + E(89, 76, 6, 9, "#d9b07a") + E(89, 78, 4, 6, "#f2c23a"), 22, 89, 54),
  "soy-sauce": (c) =>
    bottle(c, { x: 52, top: 24, w: 30, h: 80, nw: 12, nh: 14, shoulder: 10, body: ["#6a3a2a", "#2a120a"], cap: ["#ff6a5a", "#c42a2a"], capH: 10, label: "#fbf3e6", labelH: 26, art: S("M44 80H60M44 86H56", "#c42a2a", 2) }) +
    E(90, 96, 14, 5, "#ffffff") + E(90, 95, 11, 3.5, "#3a1a10"),
  "tomato-paste": (c) =>
    can(c, { x: 60, y: 54, w: 46, h: 44, label: ["#f2554a", "#b8202a"], labelH: 32, art: R(46, 68, 28, 18, 9, "#ffffff") + tomato(60, 78, 6) }) +
    E(60, 54, 23, 5, "#c4302a") + E(92, 98, 9, 3, "#c4302a") + S("M84 88Q90 94 92 98", "#c4302a", 3),
  "canned-tomatoes": (c) =>
    can(c, { x: 64, y: 36, w: 46, h: 64, label: ["#fff3dc", "#f2d9b0"], art: tomato(56, 70, 10) + tomato(74, 74, 8) + leafAt(64, 86, -20, 0.8, "#5fa54c") }),
  "canned-corn": (c) =>
    can(c, { x: 64, y: 36, w: 46, h: 64, label: ["#7fc463", "#3f8a3a"], art: E(64, 70, 9, 16, "#ffd25a") + [...Array(9)].map((_, i) => R(60 + (i % 2) * 5 - 2, 58 + Math.floor(i / 2) * 5, 4, 4, 1.5, "#f2b42a")).join("") + leafAt(56, 82, -120, 1, "#bfe6a0") + leafAt(72, 82, -60, 1, "#bfe6a0") }),
  "green-peas": (c) =>
    shadow(64, 42) +
    rot(
      P("M22 66Q64 40 106 62Q100 80 64 82Q32 82 22 66Z", c.lg("#9bd27a", "#4f9a45")) +
        P("M26 66Q64 54 102 62Q96 72 64 74Q34 74 26 66Z", "#d9f0b8") +
        [36, 48, 60, 72, 84, 94].map((x, i) => C(x, 66 - (i === 5 ? 1 : 0), 6, c.rg("#b8e890", "#5aa045"))).join("") +
        S("M106 62q6-6 4-12", "#5aa045", 2.4),
      -12,
    ),
  "canned-tuna": (c) =>
    shadow(64, 42) +
    E(64, 82, 36, 14, c.lg("#cfd6df", "#8f9aa8")) + R(28, 72, 72, 10, 0, c.lg("#5fa8ec", "#2f7ad0")) + E(64, 72, 36, 13, "#d9dfe8") + E(64, 72, 31, 10.5, c.rg("#f6d2b4", "#d8a07a")) +
    S("M44 70Q54 64 62 72M66 68Q76 62 84 70M50 78Q60 74 70 78", "#c48a62", 1.6) +
    P("M60 60Q64 40 86 36Q96 36 98 44Q92 50 74 56Z", c.lg("#e3e8ef", "#a8b2bf")),
  pickles: (c) =>
    jar(c, { x: 64, y: 42, w: 52, h: 60, lid: ["#ffd25a", "#e0a82a"], fill: c.lg("#e9f3c8", "#c4dc8a"), fillTop: 0.12, glass: "#ffffff", art: [[52, 72, -8], [64, 70, 4], [76, 74, 10]].map(([x, y, d]) => rot(R(x - 6, y - 20, 12, 40, 6, c.lg("#7fb85a", "#3f7a32")) + C(x - 1, y - 8, 1, "#cfe7a8") + C(x + 2, y + 4, 1, "#cfe7a8"), d, x, y)).join("") + sprig(84, 96, 26, -15, "#5fa54c", "#5f9e4a", 0.6, 6) }),
  olives: (c) =>
    bowl(c, { x: 64, y: 74, w: 76, depth: 26, color: ["#ffffff", "#d9dfe8"], rim: "#ffffff", content: [[48, 68], [62, 64], [76, 68], [56, 58], [70, 56]].map(([x, y]) => E(x, y, 8, 6.5, c.rg("#b8c84a", "#6f8a22")) + C(x + 1, y, 2.2, "#e8473a") + C(x - 3, y - 2.5, 1.4, "#fff", `opacity=".5"`)).join("") }) +
    leafAt(86, 44, -30, 1.5, "#7fa65a"),
  "black-pepper": (c) => {
    const rnd = seeded("pepper");
    let s = shadow(56, 28) + R(42, 52, 28, 52, 8, c.lg("#5a4a3a", "#2a2018")) + R(46, 30, 20, 24, 6, c.lg("#c9a87a", "#8a6a44")) + C(56, 26, 5, "#3a2a1e") + R(46, 56, 3, 44, 1.5, "#fff", `opacity=".25"`);
    for (let i = 0; i < 12; i++) s += C(78 + rnd() * 22, 86 + rnd() * 16, 3, c.rg("#5a4a3a", "#1f1812")) + C(77 + rnd() * 22, 85 + rnd() * 16, 0.8, "#8a7a6a");
    return s;
  },
  "paprika-spice": (c) =>
    shadow(64, 42) +
    P("M30 94Q64 60 98 94Z", c.lg("#ff6a3a", "#c4301a")) +
    [...Array(14)].map((_, i) => { const r = seeded("pap" + i); return C(40 + r() * 48, 86 + r() * 8, 1, "#ffb08a"); }).join("") +
    rot(R(50, 46, 46, 10, 5, "#e3e8ef") + E(46, 51, 14, 9, "#d9dfe8") + E(46, 50, 11, 6, "#e8473a"), -20, 60, 52) +
    rot(P("M84 30Q96 26 98 40Q98 52 88 60Q84 50 84 40Z", c.lg("#ff5a3a", "#b8201a")) + S("M88 30q-2-6 2-10", "#4f9a45", 2.4), 20, 90, 44),
  spices: (c) => {
    const sj = (x, h, cap, fill) => R(x - 9, 104 - h, 18, h, 4, "#ffffff", `opacity=".6"`) + R(x - 7, 104 - h + 8, 14, h - 10, 3, fill) + R(x - 10, 104 - h - 8, 20, 10, 3, cap) + R(x - 9, 104 - h + 12, 18, 10, 1, "#fffaf0");
    return shadow(64, 40) + sj(42, 50, "#e8473a", "#d84a2a") + sj(64, 58, "#4f9a45", "#7fa65a") + sj(86, 46, "#f2b42a", "#f2c23a");
  },
  vinegar: (c) =>
    bottle(c, { x: 62, top: 18, w: 30, h: 86, nw: 10, nh: 26, shoulder: 10, body: ["#f7faff", "#cfdcea"], cap: ["#c9a87a", "#8a6a44"], capH: 12, label: "#ffe08a", labelH: 22, art: S("M50 86q12-10 24 0", "#c9941a", 2) }) +
    mini.drop(90, 92, 1.1, "#d9e8f5"),
  bouillon: (c) => {
    const cube = (x, y, s, col) => P(`M${x} ${y}l${14 * s} ${-7 * s}l${14 * s} ${7 * s}l${-14 * s} ${7 * s}Z`, col[0]) + P(`M${x} ${y}l${14 * s} ${7 * s}v${16 * s}l${-14 * s} ${-7 * s}Z`, col[1]) + P(`M${x + 14 * s} ${y + 7 * s}l${14 * s} ${-7 * s}v${16 * s}l${-14 * s} ${7 * s}Z`, col[2]);
    return shadow(64, 40) + cube(34, 74, 1.1, ["#ffe27a", "#f2b42a", "#d99a1a"]) + cube(66, 78, 1, ["#ffd25a", "#e8a82a", "#c98a1a"]) + cube(52, 56, 0.9, ["#e3e8ef", "#c4ccd6", "#a8b2bf"]) + S("M58 60L74 66", "#ffffff", 1.2);
  },
};
