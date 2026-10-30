// Фрукты и ягоды.
import { C, E, G, P, R, S, hl, rot, seeded, shadow } from "./lib.mjs";

const leafAt = (x, y, deg, s, fill = "#6fb35a") =>
  `<path transform="translate(${x} ${y}) rotate(${deg}) scale(${s})" d="M0 0C3-5 10-7 15-5C11 1 5 3 0 0Z" fill="${fill}"/>`;

export default {
  apples: (c) =>
    shadow(64, 36) +
    P("M64 44Q76 34 88 42Q100 52 97 72Q94 94 78 100Q70 103 64 98Q58 103 50 100Q34 94 31 72Q28 52 40 42Q52 34 64 44Z", c.rg("#ff7a6a", "#c22f2f", 0.38, 0.35)) +
    S("M64 46Q64 36 68 28", "#8a5a34", 3.2) + leafAt(67, 33, -30, 1.4) +
    hl(46, 58, 6, 11, 25, 0.45),
  pears: (c) =>
    shadow(64, 32) +
    P("M64 30Q74 30 76 44Q78 56 88 66Q98 80 90 94Q82 104 64 104Q46 104 38 94Q30 80 40 66Q50 56 52 44Q54 30 64 30Z", c.rg("#f2ec8c", "#a8c14a", 0.4, 0.4)) +
    [[56, 80], [72, 86], [66, 70], [50, 92], [78, 96]].map(([x, y]) => C(x, y, 0.9, "#9a8a3a", `opacity=".5"`)).join("") +
    S("M64 31Q64 22 60 16", "#8a5a34", 3) + leafAt(62, 22, -20, 1.2) +
    hl(52, 74, 5, 11, 20, 0.45),
  bananas: (c) => {
    const ban = (deg) =>
      rot(
        P("M34 56Q40 92 76 98Q94 100 102 90Q96 92 80 88Q52 80 44 54Z", c.lg("#ffe680", "#f0b52a", 0, 0, 0, 1)) +
          S("M44 58Q52 82 82 90", "#d99a1a", 1.2, `opacity=".45"`) +
          C(102, 90, 2.4, "#6b4a2a") + R(30, 50, 9, 8, 2, "#8a6a2a", `transform="rotate(-20 34 54)"`),
        deg,
        40,
        56,
      );
    return shadow(68, 38) + ban(-12) + ban(2) + ban(16);
  },
  oranges: (c) =>
    shadow(64, 40) +
    C(54, 70, 27, c.rg("#ffbf5a", "#f0821a")) +
    [...Array(16)].map((_, i) => { const r = seeded("or" + i); return C(36 + r() * 36, 52 + r() * 36, 0.8, "#e07510", `opacity=".45"`); }).join("") +
    C(54, 44, 2.5, "#7aa64a") + hl(44, 58, 7, 4, -35, 0.45) +
    C(90, 86, 16, "#f7a33c") + C(90, 86, 13.5, "#ffd27a") +
    [0, 45, 90, 135, 180, 225, 270, 315].map((a) => S(`M90 86l${(Math.cos((a * Math.PI) / 180) * 12).toFixed(1)} ${(Math.sin((a * Math.PI) / 180) * 12).toFixed(1)}`, "#f6b04a", 1.4)).join("") +
    C(90, 86, 2, "#fff0c8"),
  mandarins: (c) => {
    const m = (x, y, s) => E(x, y, 20 * s, 16 * s, c.rg("#ffa94a", "#e9670f")) + C(x, y - 15 * s, 2 * s, "#5d8d3a") + hl(x - 8 * s, y - 6 * s, 5 * s, 3 * s, -30, 0.45);
    return (
      shadow(64, 40) +
      m(80, 66, 0.9) + leafAt(80, 52, -60, 1.3, "#5fa54c") + leafAt(80, 52, 20, 1.1, "#76b95c") +
      m(52, 80, 1) +
      P("M86 92Q98 86 104 94Q100 104 88 102Q82 98 86 92Z", c.lg("#ffc775", "#f39a2e")) +
      S("M90 93Q95 96 99 98", "#fff3d4", 1.2)
    );
  },
  lemons: (c) =>
    shadow(64, 40) +
    rot(P("M24 66Q28 56 36 54Q48 40 66 44Q82 48 88 60Q94 62 96 68Q92 72 86 74Q78 90 58 90Q40 90 32 76Q26 74 24 66Z", c.rg("#fff58a", "#f0c419")), -14, 60, 66) +
    hl(48, 58, 9, 4, -25, 0.5) +
    C(90, 90, 15, "#f2d23c") + C(90, 90, 12.5, "#fff5b8") +
    [0, 60, 120, 180, 240, 300].map((a) => P(`M90 90l${(Math.cos(((a - 22) * Math.PI) / 180) * 10.5).toFixed(1)} ${(Math.sin(((a - 22) * Math.PI) / 180) * 10.5).toFixed(1)}A10.5 10.5 0 0 1 ${(90 + Math.cos(((a + 22) * Math.PI) / 180) * 10.5).toFixed(1)} ${(90 + Math.sin(((a + 22) * Math.PI) / 180) * 10.5).toFixed(1)}Z`, "#ffe46a")).join(""),
  grapes: (c) => {
    const g = [[48, 50], [62, 48], [76, 50], [54, 62], [68, 62], [82, 62], [46, 63], [60, 75], [74, 75], [52, 87], [66, 87], [60, 99]];
    return (
      shadow(64, 26) +
      S("M64 42Q64 30 70 24", "#7a5a34", 3) + leafAt(66, 34, -10, 1.8, "#72b35a") +
      g.map(([x, y]) => C(x, y, 8, c.rg("#c39ae6", "#6a3c9a")) + C(x - 2.5, y - 2.5, 2, "#fff", `opacity=".45"`)).join("")
    );
  },
  strawberries: (c) => {
    const berry = (x, y, s, id) => {
      const rnd = seeded(id);
      let t = P(`M${x} ${y + 30 * s}Q${x - 26 * s} ${y + 10 * s} ${x - 22 * s} ${y - 8 * s}Q${x - 16 * s} ${y - 20 * s} ${x} ${y - 16 * s}Q${x + 16 * s} ${y - 20 * s} ${x + 22 * s} ${y - 8 * s}Q${x + 26 * s} ${y + 10 * s} ${x} ${y + 30 * s}Z`, c.rg("#ff6a6a", "#c81f3a", 0.4, 0.35));
      for (let i = 0; i < 14; i++) t += E(x - 14 * s + rnd() * 28 * s, y - 8 * s + rnd() * 30 * s * (1 - rnd() * 0.3), 1 * s, 1.5 * s, "#ffe48a");
      t += [-60, -20, 20, 60, -100].map((a) => leafAt(x, y - 16 * s, a - 90, 1.2 * s, "#4f9a45")).join("");
      return t + hl(x - 10 * s, y - 4 * s, 4 * s, 7 * s, 20, 0.4);
    };
    return shadow(64, 40) + berry(86, 76, 0.7, "s2") + berry(52, 64, 1, "s1");
  },
  raspberries: (c) => {
    const rasp = (x, y, s) => {
      let t = "";
      const pts = [[0, -12], [-7, -8], [7, -8], [-10, 0], [0, -3], [10, 0], [-7, 8], [7, 8], [0, 6], [-3, 15], [4, 15]];
      for (const [dx, dy] of pts) t += C(x + dx * s, y + dy * s, 5.4 * s, c.rg("#ff8aa0", "#c4284c")) + C(x + dx * s - 1.5 * s, y + dy * s - 1.5 * s, 1.3 * s, "#fff", `opacity=".5"`);
      return t;
    };
    return shadow(64, 38) + leafAt(84, 50, -40, 2, "#5fa54c") + rasp(84, 74, 1) + rasp(50, 70, 1.15);
  },
  blueberries: (c) => {
    const b = [[48, 80], [64, 84], [80, 80], [56, 68], [72, 68], [40, 92], [88, 92], [64, 54], [56, 96], [74, 96]];
    return (
      shadow(64, 38) +
      b.map(([x, y]) => C(x, y, 9, c.rg("#7f9fe8", "#2c4a9e")) + C(x, y - 5, 2.6, "#1f3577") + S(`M${x - 2} ${y - 5}l4 0M${x} ${y - 7}v4`, "#8fa8e8", 0.8) + E(x - 3, y + 1, 2.2, 3, "#c9d6ff", `opacity=".35"`)).join("") +
      leafAt(80, 50, -30, 1.6, "#6fb35a")
    );
  },
  cherries: (c) =>
    shadow(64, 34) +
    S("M50 76Q56 46 74 28M80 80Q80 52 74 28", "#6f8a3a", 2.6) + leafAt(74, 28, -20, 1.7, "#5fa54c") +
    C(50, 80, 15, c.rg("#f05068", "#8e1430")) + hl(44, 74, 4, 3, -30, 0.55) +
    C(80, 84, 15, c.rg("#f05068", "#8e1430")) + hl(74, 78, 4, 3, -30, 0.55),
  peaches: (c) =>
    shadow(64, 36) +
    C(64, 70, 31, c.rg("#ffd29a", "#f0717a", 0.35, 0.3, 0.85)) +
    S("M64 42Q50 64 62 100", "#e0606a", 2, `opacity=".45"`) +
    S("M64 41Q64 34 66 30", "#7a5a34", 3) + leafAt(66, 34, -40, 1.6, "#6fb35a") +
    hl(48, 58, 7, 10, 25, 0.35),
  plums: (c) => {
    const p = (x, y, s) => E(x, y, 18 * s, 21 * s, c.rg("#9d8ae0", "#3d2f86")) + S(`M${x} ${y - 20 * s}Q${x - 6 * s} ${y} ${x} ${y + 20 * s}`, "#33276f", 1.4, `opacity=".5"`) + E(x - 7 * s, y - 4 * s, 4 * s, 9 * s, "#d4ccf5", `opacity=".35"`) + S(`M${x} ${y - 20 * s}q2-6 6-8`, "#6b5a34", 2.4);
    return shadow(64, 38) + p(80, 66, 0.85) + p(52, 74, 1);
  },
  kiwi: (c) => {
    let s = shadow(64, 38) + E(80, 64, 22, 17, c.rg("#b08a5a", "#6e4f2e"), `transform="rotate(-20 80 64)"`);
    s += C(54, 78, 24, "#8a6a40") + C(54, 78, 21.5, c.rg("#bfe86c", "#6fb33a", 0.5, 0.5));
    s += E(54, 78, 7, 5, "#f4f9dc");
    for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; s += E(54 + Math.cos(a) * 11, 78 + Math.sin(a) * 9.5, 1.3, 0.8, "#2a2a1a", `transform="rotate(${(a * 180) / Math.PI} ${54 + Math.cos(a) * 11} ${78 + Math.sin(a) * 9.5})"`); }
    return s;
  },
  pineapple: (c) => {
    let s = shadow(64, 30);
    for (const [deg, l] of [[-40, 26], [-20, 32], [0, 36], [20, 32], [40, 26]]) s += G(P(`M0 0C-5-${l * 0.5}-2-${l * 0.8} 0-${l}C2-${l * 0.8} 5-${l * 0.5} 0 0Z`, c.lg("#7fc463", "#3f8a3a")), `transform="translate(64 50) rotate(${deg})"`);
    s += E(64, 76, 22, 28, c.rg("#ffd56a", "#d99520"));
    let net = "";
    for (let i = -3; i <= 3; i++) net += S(`M${64 + i * 10 - 22} 50L${64 + i * 10 + 22} 102M${64 + i * 10 + 22} 50L${64 + i * 10 - 22} 102`, "#c27f16", 1.2, `opacity=".5"`);
    s += G(net, `clip-path="${c.clip(E(64, 76, 22, 28, "#000"))}"`);
    return s + hl(54, 66, 4, 10, 15, 0.4);
  },
  watermelon: (c) => {
    let s = shadow(64, 40);
    s += P("M22 52Q64 112 106 52Z", "#3f8a3a");
    s += P("M26 52Q64 104 102 52Z", "#f4fbe6");
    s += P("M30 52Q64 98 98 52Z", c.lg("#ff7b7b", "#e33b4e"));
    for (const [x, y] of [[46, 60], [58, 66], [70, 66], [82, 60], [64, 76], [52, 72], [76, 72]]) s += E(x, y, 1.6, 2.6, "#3a2a2a");
    return s + R(32, 50, 64, 4, 2, "#ffb0b0", `opacity=".5"`);
  },
  melon: (c) => {
    const body = E(64, 70, 36, 26, "#000", `transform="rotate(-12 64 70)"`);
    let s = shadow(64, 40) + E(64, 70, 36, 26, c.rg("#fbe58e", "#d4a93a"), `transform="rotate(-12 64 70)"`);
    let net = "";
    for (let i = -4; i <= 4; i++) net += S(`M${64 + i * 10 - 12} 40Q${64 + i * 10} 70 ${64 + i * 10 + 12} 100M${64 + i * 10 + 12} 40Q${64 + i * 10} 70 ${64 + i * 10 - 12} 100`, "#f9f1cc", 0.9, `opacity=".75"`);
    s += G(net, `clip-path="${c.clip(body)}"`);
    return s + S("M98 58q6-4 6-10", "#8a6a34", 3) + hl(46, 60, 8, 4, -30, 0.45);
  },
  mango: (c) =>
    shadow(64, 36) +
    P("M40 52Q56 32 82 40Q104 50 98 76Q92 100 64 100Q40 100 34 82Q30 66 40 52Z", c.lg("#8fcf5c", "#ff7a3a", 0.1, 0, 0.9, 1)) +
    P("M60 92Q86 92 94 74Q90 92 70 98Q62 98 60 92Z", "#e8572a", `opacity=".45"`) +
    S("M80 40Q84 32 90 30", "#7a5a34", 3) + leafAt(88, 32, -10, 1.8, "#4f9a45") +
    hl(50, 56, 6, 10, 40, 0.4),
};
