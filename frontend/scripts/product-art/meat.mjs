// Мясо и птица.
import { C, E, G, P, R, S, bowl, filletPath, hl, rot, seeded, shadow, sprig } from "./lib.mjs";

const raw = ["#ffc9bd", "#ef8f86"];
const skin = ["#ffe2c4", "#f2b48c"];
const bone = (x, y, deg) => rot(R(x - 3, y - 12, 6, 16, 3, "#fbf3e6") + C(x - 3, y - 13, 3.6, "#fbf3e6") + C(x + 3, y - 13, 3.6, "#fbf3e6"), deg, x, y);

export default {
  "chicken-breast": (c) =>
    shadow(64, 40) +
    rot(P(filletPath(64, 70, 76, 40), c.rg(raw[0], raw[1])) + S("M36 66Q60 58 90 64M40 76Q64 70 88 74", "#f6b0a6", 1.6, `opacity=".8"`) + hl(52, 60, 10, 3, -10, 0.45), -10),
  "chicken-thighs": (c) => {
    const thigh = (x, y, deg) => rot(bone(x + 22, y - 2, 70) + P(`M${x - 22} ${y}Q${x - 24} ${y - 22} ${x} ${y - 20}Q${x + 22} ${y - 18} ${x + 22} ${y - 2}Q${x + 20} ${y + 18} ${x} ${y + 18}Q${x - 20} ${y + 18} ${x - 22} ${y}Z`, c.rg(skin[0], skin[1])) + hl(x - 8, y - 10, 7, 3, -20, 0.45), deg, x, y);
    return shadow(64, 42) + thigh(50, 64, -14) + thigh(74, 86, 10);
  },
  "chicken-wings": (c) => {
    // A wing as a "V": drumette and flat joined at the elbow, with a pointed tip.
    const wing = (x, y, deg) =>
      rot(
        P(`M${x - 24} ${y - 2}Q${x - 26} ${y - 12} ${x - 16} ${y - 13}L${x} ${y - 8}Q${x + 6} ${y - 16} ${x + 14} ${y - 22}L${x + 26} ${y - 26}L${x + 22} ${y - 14}Q${x + 16} ${y} ${x + 4} ${y + 6}Q${x - 6} ${y + 10} ${x - 16} ${y + 8}Q${x - 24} ${y + 6} ${x - 24} ${y - 2}Z`, c.rg(skin[0], skin[1])) +
          S(`M${x} ${y - 7}Q${x - 2} ${y} ${x + 2} ${y + 5}`, "#e8a27c", 1.6) +
          hl(x - 14, y - 6, 6, 2.5, -10, 0.5),
        deg,
        x,
        y,
      );
    return shadow(64, 42) + wing(52, 60, -8) + wing(76, 78, 14) + wing(50, 96, -4);
  },
  chicken: (c) => {
    const leg = (x, deg) => rot(E(x, 52, 9, 15, c.rg(skin[0], skin[1])) + R(x - 2.5, 30, 5, 12, 2.5, "#fbf3e6") + C(x - 2.5, 30, 3.4, "#fbf3e6") + C(x + 2.5, 30, 3.4, "#fbf3e6"), deg, x, 60);
    return (
      shadow(64, 42) +
      leg(44, -28) + leg(84, 28) +
      P("M26 74Q28 52 64 52Q100 52 102 74Q102 100 64 102Q26 100 26 74Z", c.rg("#fff0dc", "#efb084", 0.4, 0.35)) +
      E(30, 80, 8, 13, "#f6c49e", `transform="rotate(25 30 80)"`) + E(98, 80, 8, 13, "#f6c49e", `transform="rotate(-25 98 80)"`) +
      S("M64 58V96", "#f0c09c", 1.6, `opacity=".7"`) +
      hl(50, 64, 10, 5, -20, 0.45)
    );
  },
  turkey: (c) =>
    shadow(60, 42) +
    P("M24 70Q24 52 40 50H88Q102 50 102 66V82Q102 96 86 96H38Q24 96 24 82Z", c.lg("#f8d7c4", "#e2a58c")) +
    P("M24 70Q24 52 40 50H88Q102 50 102 66Q90 58 64 60Q36 62 24 70Z", "#fbe6d8") +
    S("M36 74H88M40 84H80", "#e9b8a2", 1.6) +
    sprig(96, 50, 30, -60, "#4f8f45", "#6b5a34", 0.9, 7),
  "minced-meat": (c) =>
    bowl(c, {
      x: 64, y: 70, w: 76, depth: 28, color: ["#f1eee8", "#c9c2b6"], rim: "#ffffff",
      content: (() => {
        const rnd = seeded("mince");
        let s = P("M30 70Q64 40 98 70Z", "#f2948a");
        for (let i = 0; i < 40; i++) { const t = rnd() * 2 - 1, x = 64 + t * 30, y = 70 - rnd() * 22 * (1 - t * t); s += S(`M${x.toFixed(1)} ${y.toFixed(1)}q2-3 4 0t4 0`, i % 3 ? "#d8665e" : "#ffd0c6", 1.4); }
        return s;
      })(),
    }),
  pork: (c) =>
    shadow(64, 40) +
    P("M28 66Q30 42 62 42Q96 42 100 64Q102 90 72 96Q40 100 30 84Q26 76 28 66Z", "#fff1e6") +
    P("M34 66Q36 48 62 48Q92 48 94 66Q94 86 70 90Q42 92 36 80Q32 74 34 66Z", c.rg("#ffc4bc", "#ec8a86")) +
    R(86, 62, 18, 9, 4.5, "#fbf3e6") + C(104, 62, 5, "#fbf3e6") + C(104, 70, 5, "#fbf3e6") +
    S("M44 62Q60 56 80 62", "#f9b2aa", 1.6) + hl(50, 58, 9, 3, -10, 0.45),
  "pork-loin": (c) =>
    shadow(64, 42) +
    R(28, 50, 62, 44, 14, c.lg("#ffc9bf", "#e8857e")) +
    R(28, 50, 62, 12, 10, "#fff1e2") +
    E(90, 72, 12, 22, "#f8a99e") + E(90, 72, 9, 18, "#ffd2ca") + P("M84 52Q90 50 96 54Q92 58 86 56Z", "#fff1e2") +
    S("M44 50V94M60 50V94M76 50V94", "#d9a46c", 2.2),
  beef: (c) =>
    shadow(64, 40) +
    P("M26 70Q24 46 52 44Q72 42 86 48Q104 56 100 76Q96 96 66 98Q30 98 26 70Z", "#fbe9dc") +
    P("M32 70Q30 52 54 50Q72 48 84 54Q98 60 94 76Q90 92 66 92Q36 92 32 70Z", c.rg("#e2555a", "#9e1f2e")) +
    S("M40 66Q54 60 66 68T90 66M44 80Q60 74 74 82M58 56Q66 60 78 58", "#fbd4cc", 1.4, `opacity=".85"`) +
    hl(48, 60, 8, 3, -15, 0.35),
  ham: (c) => {
    const slice = (x, y, deg) => rot(E(x, y, 26, 20, "#fbe3dc") + E(x, y, 23, 17, c.rg("#ffb3b6", "#ee7f88")) + S(`M${x - 12} ${y - 4}Q${x} ${y - 10} ${x + 12} ${y - 4}`, "#ffd2d4", 1.4), deg, x, y);
    return shadow(64, 42) + slice(48, 64, -20) + slice(80, 66, 18) + slice(64, 82, 0);
  },
  bacon: (c) => {
    const strip = (y, deg) =>
      rot(P(`M24 ${y}Q38 ${y - 8} 52 ${y}T80 ${y}T108 ${y}V${y + 14}Q94 ${y + 6} 80 ${y + 14}T52 ${y + 14}T24 ${y + 14}Z`, c.lg("#f07c6e", "#b8323a")) + S(`M24 ${y + 5}Q38 ${y - 3} 52 ${y + 5}T80 ${y + 5}T108 ${y + 5}`, "#fff0e6", 3) + S(`M24 ${y + 10}Q38 ${y + 2} 52 ${y + 10}T80 ${y + 10}T108 ${y + 10}`, "#ffd9cc", 1.4), deg);
    return shadow(64, 42) + strip(46, -8) + strip(64, -4) + strip(82, 0);
  },
  sausages: (c) => {
    const s1 = (x, y, deg) => rot(R(x - 34, y - 8, 68, 16, 8, c.lg("#ffb08a", "#e0704e")) + R(x - 28, y - 5, 54, 3, 1.5, "#fff", `opacity=".4"`) + C(x - 34, y, 2, "#c95a3a") + C(x + 34, y, 2, "#c95a3a"), deg, x, y);
    return shadow(64, 42) + s1(62, 56, -14) + s1(66, 74, -6) + s1(62, 92, 2);
  },
  kielbasa: (c) =>
    shadow(64, 42) +
    S("M34 88Q22 54 52 40Q84 30 98 58Q106 76 94 92", c.lg("#c4584a", "#7e2a26"), 15) +
    S("M38 80Q32 56 54 46Q80 38 92 60", "#e58a72", 2, `opacity=".55"`) +
    S("M34 88Q34 96 42 98M94 92Q96 100 90 102", "#d9b07a", 2) + S("M30 92q-6 6 0 10", "#d9b07a", 1.6),
  salami: (c) => {
    const rnd = seeded("salami");
    let fat = "";
    for (let i = 0; i < 14; i++) { const a = rnd() * Math.PI * 2, r = rnd() * 13; fat += C(86 + Math.cos(a) * r * 0.65, 70 + Math.sin(a) * r, 1.4 + rnd(), "#fff1ea"); }
    return (
      shadow(64, 42) +
      R(20, 52, 66, 36, 18, c.lg("#b8463e", "#7a2422")) + S("M24 70H82", "#d9b48a", 1, `opacity=".5"`) + S("M40 52V88M58 52V88", "#e8d0b0", 1.4, `opacity=".6"`) +
      E(86, 70, 13, 18, "#9a3530") + E(86, 70, 11, 16, c.rg("#e86a6a", "#b8343c")) + fat +
      rot(E(100, 92, 10, 13, "#d84f55") + C(98, 90, 1.5, "#fff1ea") + C(103, 95, 1.3, "#fff1ea"), 20, 100, 92)
    );
  },
};
