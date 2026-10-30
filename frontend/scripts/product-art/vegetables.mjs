// Овощи и зелень.
import { C, E, G, P, R, S, hl, rot, seeded, shadow, sprig } from "./lib.mjs";

const leafPath = "M0 0C3-5 10-7 15-5C11 1 5 3 0 0Z";
const leafAt = (x, y, deg, s, fill) => `<path transform="translate(${x} ${y}) rotate(${deg}) scale(${s})" d="${leafPath}" fill="${fill}"/>`;

function carrot(c, x, y, deg, len = 62) {
  let t = "";
  for (const [dx, a] of [[-3, -110], [0, -90], [3, -70], [-1, -100], [2, -80]]) t += leafAt(x + dx, y - 2, a, 1.1, a === -90 ? "#5fa856" : "#78bb63");
  t += P(`M${x - 9} ${y}Q${x} ${y - 4} ${x + 9} ${y}L${x + 1.5} ${y + len}Q${x} ${y + len + 3} ${x - 1.5} ${y + len}Z`, c.lg("#ffa64d", "#f0761f", 0, 0, 1, 0));
  for (let i = 1; i < 5; i++) t += S(`M${x - 7 + i * 0.9} ${y + i * 12}h${5 - i * 0.6}`, "#d9631a", 1.4, `opacity=".55"`);
  t += R(x - 5.5, y + 4, 2.6, len * 0.6, 1.3, "#fff", `opacity=".35"`);
  return rot(t, deg, x, y + len / 2);
}

function wavyLeaf(c, len, w, colors, waves = 6) {
  // A lettuce-like leaf pointing up from (0,0), with a ruffled edge.
  let d = `M0 0`;
  for (let i = 0; i <= waves; i++) {
    const t = i / waves, yy = -len * t, xx = -w * Math.sin(Math.PI * t * 0.95) - (i % 2 ? 3 : 0);
    d += `Q${(xx - 4).toFixed(1)} ${(yy + len / waves / 2).toFixed(1)} ${xx.toFixed(1)} ${yy.toFixed(1)}`;
  }
  for (let i = waves; i >= 0; i--) {
    const t = i / waves, yy = -len * t, xx = w * Math.sin(Math.PI * t * 0.95) + (i % 2 ? 3 : 0);
    d += `Q${(xx + 4).toFixed(1)} ${(yy - len / waves / 2).toFixed(1)} ${xx.toFixed(1)} ${yy.toFixed(1)}`;
  }
  return P(d + "Z", c.lg(colors[0], colors[1])) + S(`M0 0V${-len * 0.85}`, colors[2], 2, `opacity=".7"`);
}

export default {
  potatoes: (c) => {
    const eyes = (x, y, deg) => [[-8, -4], [6, 3], [-2, 7], [9, -6]].map(([dx, dy]) => E(x + dx, y + dy, 1.6, 1, "#9a6b3a", `opacity=".55" transform="rotate(${deg} ${x} ${y})"`)).join("");
    return (
      shadow(66, 40) +
      E(80, 80, 21, 15, c.rg("#ecc996", "#b0824a"), `transform="rotate(18 80 80)"`) + eyes(80, 80, 18) + hl(74, 73, 7, 3, 18, 0.35) +
      E(52, 72, 25, 18, c.rg("#f0cf9d", "#b98a52"), `transform="rotate(-14 52 72)"`) + eyes(52, 72, -14) + hl(44, 64, 9, 4, -14, 0.4)
    );
  },
  carrots: (c) => shadow(64, 36) + carrot(c, 52, 30, -24) + carrot(c, 72, 34, 18, 58),
  onions: (c) =>
    shadow(64, 30) +
    S("M58 99 Q56 104 52 106 M64 100 V107 M70 99 Q72 104 76 106", "#c9a27a", 1.6) +
    P("M64 32Q70 44 84 58Q96 74 84 90Q74 101 64 101Q54 101 44 90Q32 74 44 58Q58 44 64 32Z", c.rg("#f8d08f", "#c9802f", 0.4, 0.45)) +
    S("M64 34Q52 60 54 99M64 34Q76 60 74 99M64 34Q40 66 48 96M64 34Q88 66 80 96", "#b06f27", 1.4, `opacity=".45"`) +
    S("M64 33Q62 24 57 18M64 33Q67 25 72 20", "#78b85f", 3) +
    hl(52, 64, 5, 12, 20, 0.4),
  garlic: (c) =>
    shadow(60, 34) +
    P("M56 36Q62 46 76 56Q90 70 84 88Q78 101 58 101Q38 101 32 88Q26 70 40 56Q52 46 56 36Z", c.rg("#ffffff", "#e3d9cc", 0.4, 0.4)) +
    S("M56 38Q44 66 48 100M56 38Q68 66 66 100M56 40Q34 70 38 96M56 40Q80 70 78 96", "#cdbfae", 1.6) +
    S("M44 70Q46 86 50 96M70 70Q70 86 68 96", "#c9a3d6", 3, `opacity=".45"`) +
    S("M56 37Q56 28 54 22", "#d8ccb8", 3.5) +
    P("M90 78Q100 84 98 96Q94 102 86 101Q82 98 84 90Q86 82 90 78Z", c.rg("#ffffff", "#e0d4c4")) +
    S("M90 79Q90 90 87 100", "#cdbfae", 1.2) +
    hl(44, 66, 4, 12, 15, 0.6),
  tomatoes: (c) => {
    const calyx = (x, y, s) => [0, 72, 144, 216, 288].map((a) => leafAt(x, y, a - 90, 0.75 * s, "#4f9a45")).join("") + S(`M${x} ${y}q1-5 4-7`, "#4f9a45", 2.2 * s);
    return (
      shadow(66, 40) +
      E(94, 90, 12, 11, c.rg("#ff8a76", "#d13a2c")) + calyx(94, 80, 0.55) + hl(90, 86, 3, 2, -30, 0.5) +
      E(58, 70, 31, 27, c.rg("#ff8a76", "#cf3427")) +
      S("M44 50Q40 70 46 88M72 50Q78 70 72 90", "#b52a20", 1.4, `opacity=".35"`) +
      calyx(58, 45, 1) + hl(44, 60, 8, 4, -35, 0.5)
    );
  },
  cucumbers: (c) => {
    const cuc = (x, y, len, deg) => {
      const rnd = seeded("cuc" + x);
      let t = R(x - len / 2, y - 10, len, 20, 10, c.lg("#7fc463", "#3f8a3a"));
      for (let i = 0; i < 14; i++) t += C(x - len / 2 + 8 + rnd() * (len - 16), y - 6 + rnd() * 12, 1.1, "#d8f0b8", `opacity=".8"`);
      t += E(x + len / 2 - 4, y, 4, 7, "#b7df8f", `opacity=".7"`);
      t += R(x - len / 2 + 8, y - 7, len - 18, 3, 1.5, "#fff", `opacity=".35"`);
      return rot(t, deg, x, y);
    };
    return shadow(64, 40) + cuc(60, 58, 72, -20) + cuc(68, 80, 70, -8);
  },
  "bell-pepper": (c) =>
    shadow(64, 34) +
    P("M80 44Q92 40 98 52Q104 66 98 82Q94 94 86 95Q82 95 80 90", c.lg("#ffd85a", "#e9a91c", 0, 0, 1, 0)) +
    P("M62 40Q78 34 88 46Q96 60 90 80Q86 98 74 100Q68 101 62 96Q56 101 50 100Q38 98 34 80Q28 60 36 46Q46 34 62 40Z", c.rg("#ff7564", "#c42d22", 0.4, 0.35)) +
    S("M62 44Q60 70 62 96M48 46Q42 70 48 96M76 46Q82 70 76 96", "#a42419", 1.4, `opacity=".35"`) +
    P("M56 42Q62 36 70 42Q66 46 62 44Q58 46 56 42Z", "#4f9a45") +
    S("M63 40Q63 30 70 26", "#4f9a45", 3.5) +
    hl(44, 58, 5, 14, 15, 0.45),
  cabbage: (c) =>
    shadow(64, 40) +
    P("M28 82Q22 60 36 46Q30 70 44 92Z", "#7fb963") + P("M100 82Q106 60 92 46Q98 70 84 92Z", "#7fb963") +
    C(64, 68, 32, c.rg("#e2f5c3", "#8fc36a", 0.45, 0.35)) +
    S("M64 38Q54 58 58 98M64 38Q80 54 74 98M42 52Q56 66 50 94M86 52Q72 66 80 94", "#f2fbe4", 2, `opacity=".8"`) +
    P("M34 70Q38 96 64 101Q48 92 44 72Q40 60 34 70Z", "#a6d47f", `opacity=".9"`) +
    P("M94 70Q90 96 64 101Q80 92 84 72Q88 60 94 70Z", "#a6d47f", `opacity=".9"`) +
    hl(52, 52, 9, 5, -30, 0.45),
  broccoli: (c) => {
    let s = shadow(64, 30);
    s += P("M56 74Q58 90 52 102H76Q70 90 72 74Z", c.lg("#b9e08a", "#7fb85a", 0, 0, 1, 0));
    s += S("M60 80Q54 74 46 72M68 80Q74 74 82 72", "#9ccf72", 5);
    const fl = [[64, 46, 15], [46, 56, 13], [82, 56, 13], [54, 40, 11], [76, 40, 11], [64, 62, 13], [40, 66, 9], [88, 66, 9]];
    for (const [x, y, r] of fl) s += C(x, y, r, c.rg("#7cc062", "#3f8a3e"));
    const rnd = seeded("broc");
    for (let i = 0; i < 40; i++) s += C(36 + rnd() * 56, 32 + rnd() * 38, 1.6 + rnd() * 1.2, "#2f7334", `opacity=".35"`);
    return s + hl(52, 38, 6, 3, -30, 0.35);
  },
  cauliflower: (c) => {
    let s = shadow(64, 40);
    s += P("M26 84Q20 62 38 54Q36 76 52 96Z", c.lg("#8cc96c", "#4f9a45")) + P("M102 84Q108 62 90 54Q92 76 76 96Z", c.lg("#8cc96c", "#4f9a45"));
    s += P("M36 88Q50 104 64 104Q78 104 92 88Q78 96 64 94Q50 96 36 88Z", "#6fb35a");
    const fl = [[64, 50, 15], [48, 58, 13], [80, 58, 13], [56, 44, 11], [72, 44, 11], [64, 68, 14], [44, 72, 11], [84, 72, 11], [56, 78, 10], [72, 78, 10]];
    for (const [x, y, r] of fl) s += C(x, y, r, c.rg("#fffaf0", "#e7d9b6"));
    const rnd = seeded("caul");
    for (let i = 0; i < 34; i++) s += C(38 + rnd() * 52, 36 + rnd() * 48, 1.5 + rnd(), "#d9c79c", `opacity=".45"`);
    return s + hl(54, 44, 6, 3, -30, 0.5);
  },
  zucchini: (c) => {
    let t = R(26, 50, 76, 22, 11, c.lg("#5aa04a", "#2c6a2e"));
    for (let i = 0; i < 6; i++) t += S(`M${34 + i * 11} 53q4 8 0 16`, "#9fd27e", 1.4, `opacity=".55"`);
    t += R(94, 55, 12, 12, 4, "#6c8f3a") + R(34, 54, 50, 3, 1.5, "#fff", `opacity=".3"`);
    return shadow(64, 40) + rot(t, -18, 64, 61) +
      E(86, 90, 15, 13, "#3f8a3a") + E(86, 90, 13, 11, c.rg("#f4f8d2", "#d8e8a0")) +
      [0, 60, 120, 180, 240, 300].map((a) => E(86 + Math.cos((a * Math.PI) / 180) * 5, 90 + Math.sin((a * Math.PI) / 180) * 4, 1.3, 0.8, "#c9d98a")).join("");
  },
  eggplant: (c) =>
    shadow(62, 32) +
    P("M70 40Q92 44 92 70Q92 98 66 102Q40 104 36 82Q32 64 50 54Q60 48 62 40Z", c.rg("#a37ad8", "#4b2a7a", 0.4, 0.35)) +
    P("M56 34Q64 46 76 40Q82 48 72 50Q66 54 60 50Q52 52 50 46Q50 38 56 34Z", c.lg("#7cbf5f", "#3f8a3a")) +
    S("M64 38Q64 28 70 22", "#3f8a3a", 4) +
    hl(54, 70, 6, 16, 25, 0.35),
  mushrooms: (c) => {
    const mush = (x, y, s) =>
      R(x - 7 * s, y, 14 * s, 26 * s, 6 * s, c.lg("#fbf4e8", "#e2d2b8", 0, 0, 1, 0)) +
      P(`M${x - 24 * s} ${y + 2 * s}Q${x - 22 * s} ${y - 22 * s} ${x} ${y - 22 * s}Q${x + 22 * s} ${y - 22 * s} ${x + 24 * s} ${y + 2 * s}Q${x} ${y + 8 * s} ${x - 24 * s} ${y + 2 * s}Z`, c.rg("#fbf3e6", "#d6bf9b")) +
      E(x, y + 3 * s, 17 * s, 3 * s, "#c9ad84", `opacity=".5"`) + hl(x - 10 * s, y - 12 * s, 6 * s, 3 * s, -25, 0.6);
    return shadow(64, 40) + mush(84, 72, 0.75) + mush(46, 68, 0.85) + mush(66, 80, 0.7);
  },
  lettuce: (c) =>
    shadow(64, 38) +
    G(
      [[-55, 46, 26, ["#b7e07f", "#62a845", "#4f9a3d"]], [55, 46, 26, ["#b7e07f", "#62a845", "#4f9a3d"]], [-25, 54, 26, ["#c9ea92", "#74b852", "#5aa043"]], [25, 54, 26, ["#c9ea92", "#74b852", "#5aa043"]], [0, 58, 24, ["#dcf3ad", "#86c55c", "#68ad4a"]]]
        .map(([deg, len, w, col]) => G(wavyLeaf(c, len, w / 2, col), `transform="rotate(${deg})"`))
        .join(""),
      `transform="translate(64 100)"`,
    ),
  dill: (c) => {
    let s = shadow(64, 30);
    const rnd = seeded("dill");
    const branch = (x, y, deg, len) => {
      let t = S(`M0 0Q${-4} ${-len / 2} 0 ${-len}`, "#5f9e4a", 1.8);
      for (let i = 0; i < 9; i++) {
        const yy = -len * (0.25 + i * 0.085), sp = 7 + rnd() * 6;
        for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) t += S(`M0 ${yy.toFixed(1)}l${(sx * sp * (0.5 + k * 0.25)).toFixed(1)} ${(-4 - k * 3).toFixed(1)}`, k ? "#86c46a" : "#6fb35a", 1);
      }
      return G(t, `transform="translate(${x} ${y}) rotate(${deg})"`);
    };
    s += branch(64, 104, -4, 76) + branch(56, 104, -24, 64) + branch(72, 104, 20, 66);
    return s + R(54, 90, 20, 6, 3, "#e9b98f");
  },
  parsley: (c) => {
    let s = shadow(64, 32);
    const lobe = (x, y, deg, sc) =>
      G(
        P("M0 0C-6-2-10-8-7-13C-4-16 0-13 0-10C0-14 4-17 7-14C10-11 8-5 4-3C8-4 12-1 11 3C9 7 4 6 0 0Z", c.lg("#5bb35a", "#2f7a38")) +
          S("M0 0L-4-10M0 0L4-10M0 0L7 1", "#2a6c33", 0.8, `opacity=".6"`),
        `transform="translate(${x} ${y}) rotate(${deg}) scale(${sc})"`,
      );
    s += S("M64 104Q62 80 52 50M64 104Q66 76 78 46M64 104Q64 84 64 40M64 104Q58 86 40 68M64 104Q70 86 88 70", "#5a9e44", 2.2);
    s += lobe(52, 50, -20, 1.5) + lobe(78, 46, 20, 1.5) + lobe(64, 40, 0, 1.6) + lobe(40, 68, -50, 1.3) + lobe(88, 70, 50, 1.3);
    return s;
  },
  "green-onion": (c) => {
    let s = shadow(64, 30);
    const stalks = [[-14, -10], [-8, -5], [-2, 0], [4, 4], [10, 9], [15, 14]];
    for (const [dx, deg] of stalks) {
      const t = R(-3.5, -78, 7, 78, 3.5, c.lg("#82c95f", "#3f8e3c", 0, 0, 1, 0)) + R(-4, -18, 8, 18, 4, c.lg("#ffffff", "#e5efd7", 0, 0, 1, 0)) + R(-2, -74, 2, 50, 1, "#fff", `opacity=".35"`);
      s += G(t, `transform="translate(${64 + dx * 0.6} 100) rotate(${deg})"`);
    }
    s += S("M56 101l-4 5M62 102l-1 6M68 102l2 6M73 101l5 4", "#d8c7a6", 1.4);
    return s + R(48, 76, 32, 7, 3, "#f2a28a");
  },
  beetroot: (c) =>
    shadow(60, 36) +
    leafAt(58, 40, -120, 2, "#6aa84f") + leafAt(62, 40, -70, 1.9, "#7fb963") +
    S("M58 40Q54 30 44 24M62 40Q68 30 78 28", "#a3335e", 2.4) +
    P("M58 42Q82 42 84 66Q86 90 62 96Q58 106 54 110Q52 100 50 96Q30 90 32 66Q34 42 58 42Z", c.rg("#c8457a", "#6e1238")) +
    hl(46, 58, 6, 10, 25, 0.35) +
    C(90, 90, 15, "#7e1745") + C(90, 90, 12, "#c23d70") + C(90, 90, 8, "#d96a93") + C(90, 90, 4, "#c23d70"),
  avocado: (c) =>
    shadow(64, 38) +
    rot(P("M84 40Q100 44 100 66Q100 92 84 96Q70 98 68 84Q66 72 72 56Q76 42 84 40Z", c.rg("#5b7f3a", "#2f4a22")), 14, 84, 68) +
    P("M48 40Q62 40 66 58Q72 70 70 84Q66 100 48 100Q30 100 28 84Q26 70 32 58Q36 40 48 40Z", "#3d6b2c") +
    P("M48 44Q60 44 63 60Q68 71 66 84Q62 96 48 96Q34 96 32 84Q30 71 35 60Q38 44 48 44Z", c.rg("#eef5a8", "#b9d66a", 0.5, 0.6)) +
    C(48, 78, 11, c.rg("#c79a6a", "#7e512b")) + hl(44, 74, 3, 2, -30, 0.6),
  "corn-fresh": (c) => {
    let t = E(0, 0, 15, 38, c.lg("#ffe58a", "#f2bb2c", 0, 0, 1, 0));
    for (let r = -32; r <= 30; r += 6.5) for (let k = -12; k <= 12; k += 6) if (k * k / 196 + r * r / 1300 < 1) t += R(k - 2.5, r - 2.6, 5, 5.2, 2, "#ffd85a", `stroke="#e9a91c" stroke-width=".6"`);
    t += P("M-16 10Q-30 30-10 46Q-14 30-4 18Z", c.lg("#9bd27a", "#5aa045")) + P("M16 10Q30 30 10 46Q14 30 4 18Z", c.lg("#9bd27a", "#5aa045"));
    t += P("M-2 30Q0 50 4 50Q6 40 2 30Z", "#5aa045");
    return shadow(64, 30) + G(t, `transform="translate(64 62) rotate(-25)"`);
  },
  celery: (c) => {
    let s = shadow(64, 30);
    for (const [dx, deg, len] of [[-12, -8, 66], [-4, -3, 72], [4, 3, 70], [12, 8, 64]]) {
      let t = R(-5, -len, 10, len, 4, c.lg("#d4ecaa", "#8fc46a", 0, 0, 1, 0));
      t += S(`M-2 -4V${-len + 6}M2 -4V${-len + 6}`, "#7fb35b", 1, `opacity=".6"`);
      t += leafAt(0, -len, -130, 1, "#5fa54c") + leafAt(0, -len, -50, 1, "#6fb35a") + leafAt(0, -len - 2, -90, 0.9, "#7fbf63");
      s += G(t, `transform="translate(${64 + dx} 102) rotate(${deg})"`);
    }
    return s;
  },
  ginger: (c) => {
    const k = c.rg("#f1d4a2", "#c29052");
    return (
      shadow(64, 40) +
      E(60, 76, 30, 14, k, `transform="rotate(-8 60 76)"`) + E(40, 62, 12, 10, k) + E(78, 60, 11, 14, k, `transform="rotate(25 78 60)"`) + E(92, 76, 10, 9, k) +
      S("M44 74q2 6 0 12M60 70q2 7 0 14M76 72q2 6 0 12M36 58q4 3 9 2M74 52q4 2 8 0", "#a87538", 1.4, `opacity=".5"`) +
      E(98, 76, 4, 7, "#f7e7b4") + hl(50, 70, 9, 3, -10, 0.35)
    );
  },
  spinach: (c) => {
    const big = (x, y, deg, s) =>
      G(
        P("M0 0C-14-8-18-30-10-44C-4-54 4-54 10-44C18-30 14-8 0 0Z", c.lg("#5aa652", "#2b6a33")) +
          S("M0 2V-46M0-14L-9-22M0-14L9-22M0-26L-8-34M0-26L8-34M0-36L-5-41M0-36L5-41", "#8fd07f", 1.2, `opacity=".7"`) +
          S("M0 0V12", "#6fae55", 2.4),
        `transform="translate(${x} ${y}) rotate(${deg}) scale(${s})"`,
      );
    return shadow(64, 36) + big(50, 88, -32, 1) + big(80, 88, 30, 0.95) + big(64, 92, 0, 1.12);
  },
};
