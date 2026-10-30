// Бытовая химия и хозяйственные мелочи.
import { C, E, P, R, S, bottle, box, hl, jug, mini, rot, seeded, shadow, spray } from "./lib.mjs";

const roll = (c, x, y, w, h, col, core = "#d9c4a0") =>
  R(x - w / 2, y - h / 2, w, h, 5, c.lg(col[0], col[1], 0, 0, 1, 0)) + E(x + w / 2, y, 6, h / 2, col[0]) + E(x + w / 2, y, 3, h / 4.5, core);

export default {
  "dish-soap": (c) =>
    bottle(c, { x: 60, top: 26, w: 34, h: 78, nw: 14, nh: 10, shoulder: 8, body: ["#a8e08a", "#4fae4a"], cap: ["#ffffff", "#d9dfe8"], capH: 12, label: "#ffffff", labelH: 26, art: E(60, 82, 9, 6, "#ffd25a") + S("M54 80H66", "#e8a82a", 1) }) +
    mini.bubbles(92, 52, 1.6) + mini.bubbles(84, 70, 1) + C(92, 52, 5, "#bfe6ff", `opacity=".5"`),
  "dishwasher-tabs": (c) => {
    const tab = (x, y, deg) => rot(R(x - 16, y - 11, 32, 22, 5, c.lg("#ffffff", "#e3e8ef")) + R(x - 16, y - 11, 14, 22, 5, "#5fa8ec") + C(x + 6, y, 5, "#f2603a"), deg, x, y);
    return shadow(64, 42) + tab(48, 80, -10) + tab(80, 82, 8) + tab(64, 60, 2) + mini.bubbles(96, 50, 1);
  },
  "laundry-powder": (c) =>
    box(c, { x: 56, y: 36, w: 48, h: 62, d: 16, front: ["#ffffff", "#e3eef9"], side: "#bcd4ee", topc: "#f0f6fc", art: C(56, 66, 14, c.lg("#7fb8f0", "#3f7ac8")) + mini.bubbles(52, 64, 1) + R(40, 88, 32, 4, 2, "#f2603a") }) +
    E(96, 100, 10, 3.5, "#ffffff") + C(92, 98, 2, "#bfe0ff") + C(98, 99, 1.6, "#bfe0ff"),
  "laundry-gel": (c) => jug(c, { body: ["#8fc0ff", "#3f7ae0"], cap: ["#ffffff", "#d9dfe8"], label: "#ffffff", art: mini.drop(57, 80, 1.4, "#3f7ae0") + mini.bubbles(66, 72, 0.6, "#8fc0ff") }),
  softener: (c) => jug(c, { body: ["#ffc4dc", "#e870a0"], cap: ["#ffffff", "#e8d6e0"], label: "#ffffff", art: mini.flower(57, 77, 4, "#f49fb6") }),
  "bathroom-cleaner": (c) => spray(c, { body: ["#8fe0e0", "#2fa8b0"], head: ["#ffffff", "#c9d6dc"], label: "#ffffff", art: mini.drop(63, 74, 1.1, "#2fa8b0") + mini.bubbles(70, 82, 0.6, "#8fe0e0") }),
  "floor-cleaner": (c) =>
    shadow(54, 40) +
    rot(R(86, 18, 5, 70, 2.5, "#c9a87a") + R(70, 86, 36, 8, 3, "#5fa8ec") + [72, 78, 84, 90, 96, 102].map((x) => R(x, 92, 3, 12, 1.5, "#bfe0ff")).join(""), 14, 88, 60) +
    P("M30 60H70L66 104H34Z", c.lg("#ffd25a", "#e0a82a")) + E(50, 60, 20, 5, "#7fb8f0") + E(50, 60, 16, 3.5, "#bfe6ff") + mini.bubbles(44, 54, 0.8),
  "glass-cleaner": (c) =>
    spray(c, { body: ["#cfeaff", "#7fb8f0"], head: ["#5fa8ec", "#2f7ad0"], label: "#ffffff", art: R(53, 68, 20, 16, 2, "#bfe0ff") + S("M63 68V84M53 76H73", "#ffffff", 1.4) + mini.star(70, 68, 0.6, "#ffffff") }) + mini.star(98, 40, 1.2, "#ffe27a") + mini.star(92, 30, 0.7, "#ffe27a"),
  bleach: (c) => jug(c, { body: ["#ffffff", "#dfe6ee"], cap: ["#5fa8ec", "#2f7ad0"], label: "#bfe0ff", art: mini.drop(57, 80, 1.5, "#5fa8ec") + mini.star(66, 70, 0.6, "#ffffff") }),
  sponges: (c) => {
    const sp = (x, y, deg) => {
      const rnd = seeded("sp" + x);
      let t = R(x - 26, y - 4, 52, 18, 5, c.lg("#ffe27a", "#f2b42a")) + R(x - 26, y - 14, 52, 11, 4, c.lg("#7fc463", "#3f8a3a"));
      for (let i = 0; i < 10; i++) t += C(x - 22 + rnd() * 44, y + rnd() * 10, 1.2 + rnd(), "#e0a020", `opacity=".6"`);
      return rot(t, deg, x, y);
    };
    return shadow(64, 42) + sp(60, 88, -6) + sp(68, 62, 8) + mini.bubbles(98, 44, 1.2);
  },
  "trash-bags": (c) =>
    shadow(64, 40) +
    roll(c, 56, 78, 60, 34, ["#5a6470", "#2f363e"], "#9aa4b1") +
    P("M86 70Q100 66 104 76Q106 92 96 98Q90 96 90 86Z", "#4a525c") +
    S("M36 70H76M36 84H76", "#6f7a88", 1.2, `opacity=".7"`) + R(30, 64, 46, 4, 2, "#fff", `opacity=".25"`),
  "paper-towels": (c) =>
    shadow(64, 30) +
    R(42, 26, 44, 78, 6, c.lg("#ffffff", "#e8e2d6", 0, 0, 1, 0)) + E(64, 26, 22, 6, "#f7f4ee") + E(64, 26, 7, 2.5, "#c9a87a") +
    S("M42 52H86M42 78H86", "#e3dccd", 1.2) + [48, 56, 64, 72, 80].map((x) => C(x, 40, 1, "#d6cdbd")).join("") +
    P("M86 82Q100 84 98 104H86Z", "#ffffff"),
  "toilet-paper": (c) => {
    // Upright rolls: two below, one on top — a quilted cylinder with the cardboard core showing.
    const up = (x, y) =>
      R(x - 17, y - 20, 34, 40, 5, c.lg("#ffffff", "#e6dfd2", 0, 0, 1, 0)) +
      [-8, 0, 8].map((dx) => [-8, 2, 12].map((dy) => C(x + dx, y + dy, 0.9, "#ddd4c4")).join("")).join("") +
      E(x, y - 20, 17, 6, "#f8f6f1") + E(x, y - 20, 6, 2.3, "#c9a87a") + E(x, y - 20, 3.6, 1.3, "#8f7650") +
      R(x - 14, y - 14, 3, 30, 1.5, "#fff", `opacity=".7"`);
    return shadow(64, 40) + up(46, 84) + up(82, 84) + up(64, 48);
  },
  napkins: (c) => {
    let s = shadow(64, 40);
    for (let i = 0; i < 5; i++) s += P(`M28 ${90 - i * 7}L64 ${102 - i * 7}L100 ${90 - i * 7}L64 ${78 - i * 7}Z`, i === 4 ? c.lg("#ffffff", "#f1ece2") : i % 2 ? "#f6e6ec" : "#ffffff");
    return s + S("M46 61L64 67L82 61", "#f2c4d4", 1.4) + mini.flower(64, 56, 2.4, "#f49fb6");
  },
  "rubber-gloves": (c) => {
    const glove = (x, y, deg) => rot(P(`M${x - 14} ${y + 30}V${y}Q${x - 16} ${y - 20} ${x - 10} ${y - 22}Q${x - 6} ${y - 22} ${x - 6} ${y - 10}V${y - 26}Q${x - 6} ${y - 32} ${x - 1} ${y - 32}Q${x + 3} ${y - 32} ${x + 3} ${y - 26}V${y - 28}Q${x + 3} ${y - 34} ${x + 8} ${y - 34}Q${x + 12} ${y - 34} ${x + 12} ${y - 28}V${y - 20}Q${x + 14} ${y - 26} ${x + 18} ${y - 24}Q${x + 22} ${y - 20} ${x + 18} ${y - 8}L${x + 14} ${y + 4}V${y + 30}Z`, c.lg("#ffe27a", "#f2b42a")) + R(x - 16, y + 24, 32, 8, 3, "#e8a82a"), deg, x, y);
    return shadow(64, 40) + glove(50, 68, -14) + glove(80, 70, 14);
  },
  batteries: (c) => {
    const b = (x, y, deg, col) => rot(R(x - 11, y - 30, 22, 60, 5, c.lg(col[0], col[1], 0, 0, 1, 0)) + R(x - 11, y - 30, 22, 22, 5, c.lg("#3a3a3a", "#1a1a1a", 0, 0, 1, 0)) + R(x - 5, y - 36, 10, 7, 2, "#c9cfd6") + R(x - 7, y + 4, 14, 3, 1.5, "#ffffff", `opacity=".6"`) + S(`M${x - 3} ${y + 16}h6M${x} ${y + 13}v6`, "#ffffff", 1.6), deg, x, y);
    return shadow(64, 36) + b(52, 72, -12, ["#ffd25a", "#e0a020"]) + b(78, 72, 10, ["#7fd08a", "#3f9a55"]);
  },
  "light-bulb": (c) =>
    shadow(64, 22) +
    C(64, 48, 26, c.rg("#fff9d0", "#ffd25a", 0.4, 0.35)) + P("M50 64Q54 74 54 80H74Q74 74 78 64Z", "#ffe27a") +
    S("M58 62Q60 50 64 56Q68 50 70 62", "#e8a82a", 1.6) +
    R(54, 80, 20, 20, 3, c.lg("#d9dfe8", "#8f9aa8")) + S("M54 86H74M54 92H74", "#a8b2bf", 1.4) + P("M58 100H70L66 106H62Z", "#5a6470") +
    hl(54, 38, 6, 9, 25, 0.6) + S("M30 30l-6-6M98 30l6-6M22 52h-8M106 52h8", "#ffd25a", 2.6),
  candles: (c) => {
    const cd = (x, h, col) => R(x - 9, 104 - h, 18, h, 3, c.lg(col[0], col[1], 0, 0, 1, 0)) + S(`M${x} ${104 - h}v-6`, "#3a3a3a", 1.4) + P(`M${x} ${104 - h - 22}Q${x + 7} ${104 - h - 12} ${x} ${104 - h - 6}Q${x - 7} ${104 - h - 12} ${x} ${104 - h - 22}Z`, c.lg("#ffe27a", "#ff8a3a")) + E(x, 104 - h - 11, 2, 4, "#ffffff", `opacity=".8"`) + P(`M${x - 9} ${104 - h + 2}Q${x - 4} ${104 - h + 10} ${x - 2} ${104 - h + 2}`, col[0]);
    return shadow(64, 36) + cd(48, 48, ["#fff3e6", "#f2d9c4"]) + cd(70, 62, ["#ffd2e0", "#f0a0b8"]) + cd(90, 38, ["#d9ecff", "#a8c8ea"]);
  },
};
