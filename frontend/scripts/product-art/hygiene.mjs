// Гигиена и уход.
import { C, E, P, R, S, bottle, box, can, jar, mini, rot, shadow, tube } from "./lib.mjs";

export default {
  toothpaste: (c) =>
    tube(c, { body: ["#ffffff", "#dfe6ee"], cap: ["#5fa8ec", "#2f7ad0"], art: R(40, 58, 40, 12, 3, "#5fa8ec") + mini.star(60, 64, 0.7, "#ffffff") }) +
    S("M96 40Q104 36 108 42Q104 46 96 44", "#ffffff", 4) + S("M96 40Q104 36 108 42", "#7fc0f0", 1.6),
  toothbrush: (c) =>
    shadow(64, 40) +
    rot(R(18, 60, 74, 10, 5, c.lg("#7fd0c0", "#2fa08a")) + R(26, 62, 40, 3, 1.5, "#fff", `opacity=".45"`) + R(86, 52, 26, 8, 3, "#ffffff") + [88, 93, 98, 103, 108].map((x) => R(x, 40, 3.5, 13, 1.5, x % 2 ? "#7fc0f0" : "#ffffff")).join(""), -24),
  "dental-floss": (c) =>
    shadow(60, 32) +
    R(36, 50, 48, 50, 14, c.lg("#cfeef0", "#6fc0c8")) + R(36, 50, 48, 18, 10, c.lg("#ffffff", "#dfeef0")) + C(60, 78, 7, "#ffffff", `opacity=".7"`) + mini.leaf(64, 80, 0.7, "#3f9a8a") +
    S("M80 58Q96 46 100 30", "#ffffff", 2) + S("M80 58Q96 46 100 30", "#bfe6f0", 0.8),
  shampoo: (c) =>
    bottle(c, { x: 60, top: 30, w: 38, h: 74, nw: 18, nh: 6, shoulder: 8, body: ["#d8c4ff", "#8f6ae0"], cap: ["#ffffff", "#e3dcf0"], capH: 12, label: "#ffffff", labelH: 26, art: mini.flower(60, 82, 4, "#b89af0") }),
  conditioner: (c) =>
    shadow(64, 28) +
    P("M44 24H84Q88 24 88 30L84 98Q84 104 78 104H50Q44 104 44 98L40 30Q40 24 44 24Z", c.lg("#ffd6c4", "#f08a6a", 0, 0, 1, 0)) +
    R(46, 20, 36, 10, 4, c.lg("#ffffff", "#f2e2da")) + R(48, 54, 32, 30, 4, "#ffffff") +
    S("M54 62q10 8 20 0M54 70q10 8 20 0M54 78q10 8 20 0", "#f08a6a", 1.6) + R(48, 30, 4, 66, 2, "#fff", `opacity=".35"`),
  "shower-gel": (c) =>
    shadow(64, 28) +
    P("M42 34Q42 28 48 28H80Q86 28 86 34V96Q86 104 78 104H50Q42 104 42 96Z", c.lg("#9fe0c4", "#3fae88", 0, 0, 1, 0)) +
    P("M48 28V20Q48 16 52 16H76Q80 16 80 20V28Z", c.lg("#ffffff", "#d9e8e2")) + R(70, 12, 8, 6, 2, "#c9d6d0") +
    R(46, 54, 36, 28, 5, "#ffffff") + mini.drop(64, 68, 1.2, "#3fae88") + mini.bubbles(74, 76, 0.6, "#9fe0c4") +
    mini.bubbles(98, 50, 1.3) + R(46, 34, 4, 62, 2, "#fff", `opacity=".35"`),
  soap: (c) =>
    shadow(64, 40) +
    R(30, 60, 64, 36, 16, c.lg("#ffd2e0", "#f08aa8")) + R(34, 56, 56, 34, 15, c.lg("#ffe6ee", "#f6a8c0")) +
    S("M50 72H74", "#ffffff", 3, `opacity=".6"`) + mini.flower(62, 72, 3, "#ffffff") +
    mini.bubbles(92, 46, 1.6) + mini.bubbles(36, 46, 1) + C(92, 46, 6, "#cfe8ff", `opacity=".45"`),
  deodorant: (c) =>
    shadow(64, 24) +
    R(48, 40, 32, 64, 10, c.lg("#cfe2ff", "#6f9ae0", 0, 0, 1, 0)) + R(46, 22, 36, 22, 9, c.lg("#ffffff", "#d9dfe8")) +
    R(52, 60, 24, 26, 4, "#ffffff") + mini.leaf(66, 74, 0.8, "#5f8ad8") + R(52, 44, 4, 54, 2, "#fff", `opacity=".35"`),
  razor: (c) =>
    shadow(64, 40) +
    rot(R(58, 44, 12, 62, 6, c.lg("#7fb8f0", "#3f7ac8")) + R(60, 50, 3, 50, 1.5, "#fff", `opacity=".45"`) + [58, 66, 74, 82, 90].map((y) => R(58, y, 12, 2, 1, "#2f6ab8")).join("") + R(42, 30, 44, 16, 4, c.lg("#e3e8ef", "#8f9aa8")) + R(44, 40, 40, 3, 1, "#ffffff") + R(60, 44, 8, 4, 1, "#5a6470"), -20),
  "shaving-foam": (c) =>
    can(c, { x: 58, y: 38, w: 38, h: 66, metal: ["#eef0f2", "#9aa4b1"], label: ["#5a7fd8", "#2f4fa8"], labelH: 50, art: S("M44 66Q58 58 72 70", "#ffffff", 3) + R(50, 76, 16, 3, 1.5, "#bfd0f5") }) +
    R(50, 26, 16, 14, 4, c.lg("#ffffff", "#d9dfe8")) + R(62, 22, 12, 6, 3, "#c9d0da") +
    C(84, 30, 9, "#ffffff") + C(94, 36, 7, "#ffffff") + C(88, 42, 6, "#f4f7fb") + C(80, 40, 5, "#ffffff"),
  "hand-cream": (c) =>
    shadow(64, 38) +
    rot(P("M24 64H78L90 70V80L78 86H24L20 80V70Z", c.lg("#fff3dc", "#f2d9b0")) + R(16, 66, 6, 18, 1.5, "#e8c89a") + R(88, 68, 14, 14, 3, c.lg("#f2a28a", "#d8705a")) + mini.flower(48, 75, 3.4, "#f2a28a") + R(28, 67, 40, 3, 1.5, "#fff", `opacity=".5"`), -16) +
    S("M84 44Q92 36 100 40Q98 50 88 50", "#ffffff", 5),
  "cotton-pads": (c) => {
    let s = shadow(64, 40);
    for (let i = 0; i < 5; i++) s += E(54, 92 - i * 6, 26, 9, i === 4 ? c.rg("#ffffff", "#ece8f2") : "#f2eef6") + E(54, 92 - i * 6, 26, 9, "none", `stroke="#e3dcec" stroke-width="1"`);
    s += E(88, 66, 16, 15, c.rg("#ffffff", "#ece8f2")) + C(88, 66, 11, "none", `stroke="#e3dcec" stroke-width="1" stroke-dasharray="2 3"`);
    return s;
  },
  tissues: (c) =>
    box(c, { x: 56, y: 56, w: 56, h: 40, d: 16, front: ["#bfe6d4", "#6fbe9a"], side: "#5aa886", topc: "#d9f2e6", art: mini.flower(56, 76, 4, "#ffffff") }) +
    P("M58 46Q54 30 64 24Q70 30 78 22Q84 34 76 46Z", c.lg("#ffffff", "#ece8f2")),
  "wet-wipes": (c) =>
    shadow(64, 44) +
    R(18, 56, 92, 42, 16, c.lg("#9fdcf0", "#3fa8d0")) + R(18, 56, 92, 42, 16, "none", `stroke="#ffffff" stroke-width="1.5" opacity=".5"`) +
    R(44, 52, 40, 18, 7, c.lg("#ffffff", "#e3eef4")) + R(50, 56, 28, 8, 4, "#cfe2ea") +
    mini.drop(40, 84, 1.1, "#ffffff") + mini.bubbles(86, 84, 0.8) + S("M58 60Q64 48 72 60", "#ffffff", 3),
  diapers: (c) =>
    // A diaper seen from the front: waistband, side tapes, narrowing to the crotch, ruffled leg cuffs.
    shadow(64, 36) +
    P("M26 42H102V58Q100 70 88 76Q82 96 64 100Q46 96 40 76Q28 70 26 58Z", c.lg("#ffffff", "#cfe2f7")) +
    R(26, 40, 76, 12, 5, c.lg("#9fcaf5", "#6aa6e8")) + R(28, 43, 72, 2, 1, "#fff", `opacity=".5"`) +
    R(20, 44, 12, 14, 4, "#ffd25a") + R(96, 44, 12, 14, 4, "#ffd25a") +
    S("M40 76Q46 90 64 94Q82 90 88 76", "#9fcaf5", 3, `stroke-dasharray="3 3"`) +
    mini.star(52, 64, 0.8, "#ffb84a") + mini.star(66, 72, 0.65, "#f49fb6") + mini.star(78, 62, 0.75, "#7fc463") +
    R(34, 54, 3, 18, 1.5, "#fff", `opacity=".7"`),
  pads: (c) =>
    shadow(64, 38) +
    rot(
      R(26, 48, 76, 34, 17, c.lg("#f4e6ff", "#c9b0ee")) + P("M50 48L58 36H70L78 48ZM50 82L58 94H70L78 82Z", c.lg("#ece0fb", "#c9b0ee")) +
        R(34, 54, 60, 22, 11, "#ffffff") + R(42, 59, 44, 12, 6, "#ffe0ec") + mini.flower(64, 65, 3, "#f49fb6") +
        S("M34 65H40M88 65H94", "#c9b0ee", 1.4, `stroke-dasharray="2 2"`),
      -12,
    ),
  plasters: (c) => {
    const pl = (deg) => rot(R(24, 54, 80, 22, 11, c.lg("#f7c9a0", "#e0a070")) + R(52, 56, 24, 18, 3, "#fff3e2") + [32, 40, 88, 96].map((x) => C(x, 62, 1, "#d08a5a")).join("") + [32, 40, 88, 96].map((x) => C(x, 68, 1, "#d08a5a")).join(""), deg);
    return shadow(64, 40) + pl(-30) + pl(30);
  },
  painkillers: (c) => {
    let s = shadow(64, 42) + rot(R(22, 50, 72, 44, 6, c.lg("#e3e8ef", "#b8c2cf")), -10);
    let pills = "";
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) pills += E(34 + i * 16, 62 + j * 18, 6, 6, c.rg("#ffffff", "#dfe4ec")) + E(34 + i * 16, 62 + j * 18, 4, 4, i === 3 && j === 1 ? "#cfd6df" : "#ffffff");
    s += rot(pills, -10);
    return s + rot(R(86, 82, 22, 11, 5.5, "#ffffff") + R(86, 82, 11, 11, 5.5, "#f2603a"), 30, 97, 88);
  },
  vitamins: (c) =>
    jar(c, { x: 56, y: 44, w: 44, h: 56, lid: ["#ffb84a", "#e0781a"], fill: c.lg("#fff3dc", "#f2d9b0"), fillTop: 0.1, glass: "#ffffff", label: "#ffffff", art: C(56, 76, 8, "#ffb84a") + S("M52 76h8M56 72v8", "#ffffff", 2) }) +
    rot(R(84, 84, 22, 10, 5, "#ffb84a") + R(84, 84, 11, 10, 5, "#ffe08a"), -20, 95, 89) + C(98, 72, 5, "#f2603a") + C(96, 70, 1.4, "#fff", `opacity=".6"`),
};
