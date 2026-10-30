// Напитки.
import { C, E, P, R, S, bottle, box, can, carton, hl, jar, mini, pouch, rot, shadow } from "./lib.mjs";

const leafAt = (x, y, deg, s, fill = "#6fb35a") =>
  `<path transform="translate(${x} ${y}) rotate(${deg}) scale(${s})" d="M0 0C3-5 10-7 15-5C11 1 5 3 0 0Z" fill="${fill}"/>`;
const glass = (c, x, top, w, h, drink, level = 0.2) =>
  P(`M${x - w / 2} ${top}H${x + w / 2}L${x + w / 2 - 4} ${top + h}H${x - w / 2 + 4}Z`, "#ffffff", `opacity=".55"`) +
  P(`M${x - w / 2 + 2} ${top + h * level}H${x + w / 2 - 2}L${x + w / 2 - 5} ${top + h - 2}H${x - w / 2 + 5}Z`, c.lg(drink[0], drink[1])) +
  R(x - w / 2 + 4, top + 4, 3, h - 10, 1.5, "#fff", `opacity=".6"`);
const mug = (c, x, y, col, drink) =>
  R(x - 22, y, 44, 40, 10, c.lg(col[0], col[1])) + P(`M${x + 20} ${y + 8}Q${x + 34} ${y + 8} ${x + 34} ${y + 20}Q${x + 34} ${y + 32} ${x + 20} ${y + 32}`, "none", `stroke="${col[1]}" stroke-width="5"`) + E(x, y + 2, 20, 5, drink) + R(x - 18, y + 8, 4, 26, 2, "#fff", `opacity=".35"`);

export default {
  water: (c) =>
    bottle(c, { x: 64, top: 22, w: 32, h: 82, nw: 12, nh: 12, shoulder: 12, body: ["#e6f5ff", "#a9d6f5"], cap: ["#5fa8ec", "#2f7ad0"], label: "#5fa8ec", labelH: 20, art: mini.drop(64, 84, 1.2, "#ffffff") + S("M48 52H80M48 58H80", "#cde9fb", 1.2) }),
  "sparkling-water": (c) =>
    bottle(c, { x: 64, top: 22, w: 32, h: 82, nw: 12, nh: 16, shoulder: 12, body: ["#d8f2e2", "#7fc49c"], cap: ["#4f9a6a", "#2f6e4a"], label: "#ffffff", labelH: 22, art: mini.bubbles(60, 88, 1.1, "#7fc49c") + mini.bubbles(64, 56, 0.9) + mini.bubbles(72, 70, 0.7) }),
  juice: (c) =>
    shadow(56, 26) + glass(c, 56, 40, 34, 64, ["#ff9a5a", "#e8502a"]) +
    rot(R(62, 18, 5, 40, 2.5, "#f49fb6"), 14, 64, 40) +
    mini.berry(86, 90, 6, "#e23a4a") + C(98, 96, 7, "#7fc463") + mini.orange(86, 74, 8),
  "orange-juice": (c) =>
    carton(c, { x: 58, y: 46, w: 36, h: 54, d: 14, front: ["#ffd27a", "#f7a33c"], side: "#e8902a", top: ["#ffe2a8", "#f2b75a"], band: "#ffffff", art: mini.orange(58, 72, 9) + leafAt(62, 62, -30, 0.8, "#5fa54c") }),
  kompot: (c) =>
    jar(c, { x: 64, y: 40, w: 50, h: 62, lid: ["#d9dfe8", "#9aa4b1"], fill: c.lg("#f7a3b8", "#d2546e"), fillTop: 0.18, art: mini.berry(52, 72, 5, "#a8102a") + mini.berry(70, 80, 5, "#a8102a") + mini.berry(60, 90, 4.5, "#5a1f6a") + E(76, 64, 6, 4, "#ffd27a") + mini.berry(80, 92, 4, "#a8102a") }),
  coffee: (c) => {
    const bean = (x, y, deg, col = "#6a3c22") => rot(E(x, y, 6, 8.5, col) + S(`M${x} ${y - 7}Q${x - 3} ${y} ${x} ${y + 7}`, "#3a1f12", 1.4), deg, x, y);
    return pouch(c, { x: 60, y: 28, w: 54, h: 74, body: ["#d9b88a", "#a8794a"], crimp: "#8a5f34", art: R(42, 56, 36, 30, 4, "#fbf3e6") + bean(60, 71, 20) }) + bean(96, 92, -30) + bean(86, 100, 40);
  },
  "instant-coffee": (c) =>
    jar(c, { x: 62, y: 40, w: 48, h: 60, lid: ["#e2585a", "#a8283a"], fill: c.lg("#7a4a2a", "#3a1f12"), fillTop: 0.1, label: "#fbf3e6", art: E(62, 74, 9, 6, "#6a3c22") + S("M54 74Q58 68 62 74T70 74", "#fbf3e6", 1.2) + S("M60 60q2-5-1-9M65 60q2-5-1-9", "#c9b49a", 1.6) }),
  tea: (c) =>
    box(c, { x: 56, y: 44, w: 46, h: 54, d: 14, front: ["#9fd4a8", "#5fa86a"], side: "#4f9058", topc: "#b8e2bd", art: leafAt(48, 74, -30, 1.8, "#2f6e3a") + leafAt(58, 70, -60, 1.4, "#3f8a4a") }) +
    S("M86 40Q96 52 92 70", "#e8e2d6", 1.2) + R(86, 68, 12, 14, 2, "#ffffff") + R(88, 70, 8, 4, 1, "#e9b98f"),
  "green-tea": (c) =>
    shadow(60, 34) +
    P("M32 58H88Q88 98 60 100Q32 98 32 58Z", c.lg("#ffffff", "#e3e8ef")) +
    E(60, 58, 28, 6, "#ffffff") + E(60, 59, 25, 4.5, c.lg("#d8ec9a", "#a8c85a")) +
    leafAt(62, 58, -20, 1.2, "#5fa54c") + R(36, 64, 4, 26, 2, "#fff", `opacity=".6"`) +
    S("M52 48q3-6 0-12M62 46q3-6 0-12", "#b8d8c4", 1.8),
  cocoa: (c) =>
    shadow(60, 34) + mug(c, 58, 56, ["#f49fb6", "#d86a8c"], "#8a5a3a") +
    R(46, 50, 9, 8, 2.5, "#ffffff") + R(57, 48, 9, 8, 2.5, "#ffe0ea") + R(66, 51, 8, 7, 2.5, "#ffffff") +
    S("M50 40q3-6 0-12M62 38q3-6 0-12", "#e8d8cc", 1.8),
  cola: (c) =>
    can(c, { x: 62, y: 30, w: 40, h: 72, metal: ["#eef0f2", "#b7bfc6"], label: ["#e8473a", "#a8202a"], labelH: 58, art: S("M44 66Q62 56 80 70", "#ffffff", 3) + mini.bubbles(60, 86, 1, "#ffd2cc") }) +
    rot(R(68, 18, 3, 16, 1.5, "#ffffff") + R(68, 18, 3, 16, 1.5, "#f49fb6", `opacity=".5"`), 10, 70, 26),
  lemonade: (c) =>
    shadow(60, 26) + glass(c, 58, 34, 38, 70, ["#fff5a8", "#f2d23c"], 0.15) +
    R(48, 46, 10, 10, 2, "#ffffff", `opacity=".6"`) + R(60, 52, 9, 9, 2, "#ffffff", `opacity=".6"`) +
    C(78, 36, 11, "#f2d23c") + C(78, 36, 9, "#fff5b8") + S("M70 36H86M78 28V44", "#f6e27a", 1) +
    leafAt(52, 34, -60, 1.2, "#5fa54c") + mini.bubbles(56, 84, 0.7),
  beer: (c) =>
    shadow(58, 34) +
    R(34, 44, 44, 58, 6, "#ffffff", `opacity=".55"`) + R(37, 50, 38, 49, 4, c.lg("#ffd25a", "#e89a1a")) +
    P("M76 56Q92 56 92 72Q92 88 76 88", "none", `stroke="#ffffff" stroke-width="6" opacity=".75"`) +
    P("M32 50Q30 38 42 38Q46 30 56 34Q64 28 72 36Q82 36 80 50Z", "#fffaf0") +
    mini.bubbles(48, 80, 0.8) + mini.bubbles(64, 70, 0.6) + R(40, 54, 3, 40, 1.5, "#fff", `opacity=".5"`),
  wine: (c) =>
    bottle(c, { x: 50, top: 18, w: 28, h: 86, nw: 9, nh: 26, shoulder: 12, body: ["#7a2a4a", "#3a1022"], cap: ["#c94a5a", "#8a2030"], capH: 12, label: "#fbf3e6", labelH: 24, art: mini.leaf(50, 80, 0.9, "#7a2a4a") }) +
    P("M80 60H100Q100 78 90 80Q80 78 80 60Z", "#ffffff", `opacity=".6"`) + P("M81 66H99Q98 77 90 78Q82 77 81 66Z", "#a8203a") +
    R(89, 80, 2, 18, 1, "#ffffff", `opacity=".8"`) + E(90, 100, 8, 2.5, "#ffffff", `opacity=".8"`),
};
