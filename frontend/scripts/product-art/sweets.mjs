// Сладости и снеки.
import { C, E, P, R, S, hl, jar, mini, pouch, rot, seeded, shadow } from "./lib.mjs";

export default {
  chocolate: (c) => {
    let bar = R(28, 40, 56, 64, 5, c.lg("#8a5236", "#5a2f1e"));
    for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) bar += R(32 + i * 26, 44 + j * 15, 22, 12, 2.5, c.lg("#9a6246", "#6a3a26"));
    bar += P("M26 72H86V106H26Z", c.lg("#e8473a", "#b8283a")) + P("M26 72L36 66L46 74L56 66L66 74L76 66L86 72Z", "#e8473a") + R(26, 84, 60, 4, 0, "#ffd25a");
    return shadow(60, 36) + rot(bar, -10, 56, 72) + rot(R(88, 50, 20, 13, 3, c.lg("#9a6246", "#6a3a26")), 25, 98, 56);
  },
  candies: (c) => {
    const candy = (x, y, deg, col) => rot(P(`M${x - 26} ${y - 9}L${x - 14} ${y}L${x - 26} ${y + 9}Z`, col[1]) + P(`M${x + 26} ${y - 9}L${x + 14} ${y}L${x + 26} ${y + 9}Z`, col[1]) + E(x, y, 15, 11, c.lg(col[0], col[1])) + S(`M${x - 8} ${y - 9}Q${x - 4} ${y} ${x - 8} ${y + 9}M${x + 2} ${y - 11}Q${x + 6} ${y} ${x + 2} ${y + 11}`, "#ffffff", 2, `opacity=".6"`), deg, x, y);
    return shadow(64, 42) + candy(52, 62, -20, ["#ffd25a", "#f0a02a"]) + candy(76, 86, 15, ["#f49fb6", "#d8507a"]);
  },
  cookies: (c) => {
    const ck = (x, y, r, id) => { const rnd = seeded(id); let t = C(x, y, r, c.rg("#f2c27a", "#c98a3a")); for (let i = 0; i < 7; i++) { const a = rnd() * Math.PI * 2, d = rnd() * r * 0.7; t += E(x + Math.cos(a) * d, y + Math.sin(a) * d, 3, 2.4, "#5a2f1e"); } return t; };
    return shadow(64, 42) + ck(80, 62, 20, "ck2") + ck(50, 80, 24, "ck1");
  },
  wafers: (c) => {
    const w = (x, y, deg) => { let t = R(x - 28, y - 10, 56, 20, 3, c.lg("#f7d28a", "#d9a04a")); for (let i = -24; i <= 24; i += 6) t += S(`M${x + i} ${y - 9}V${y + 9}`, "#c98a3a", 0.9, `opacity=".6"`); t += S(`M${x - 27} ${y - 3}H${x + 27}M${x - 27} ${y + 3}H${x + 27}`, "#c98a3a", 0.9, `opacity=".6"`); return rot(t, deg, x, y); };
    return shadow(64, 42) + w(64, 58, -10) + w(64, 82, -4) + R(36, 66, 56, 5, 2, "#8a5236", `transform="rotate(-7 64 68)"`);
  },
  crackers: (c) => {
    const cr = (x, y, deg) => rot(R(x - 18, y - 18, 36, 36, 4, c.lg("#fbd68a", "#e2a447")) + [[-9, -9], [0, -9], [9, -9], [-9, 0], [0, 0], [9, 0], [-9, 9], [0, 9], [9, 9]].map(([dx, dy]) => C(x + dx, y + dy, 1.4, "#c48632")).join("") + R(x - 18, y - 18, 36, 36, 4, "none", `stroke="#f0c070" stroke-width="2"`), deg, x, y);
    return shadow(64, 42) + cr(50, 76, -12) + cr(80, 70, 14) + cr(62, 54, 4);
  },
  chips: (c) =>
    pouch(c, { x: 56, y: 26, w: 54, h: 72, body: ["#ffd25a", "#f29a1a"], crimp: "#e0851a", art: E(56, 66, 16, 12, "#fff3c4") + E(56, 66, 12, 8, "#ffd77a") + S("M48 64Q56 60 64 66", "#e8a82a", 1.2) }) +
    rot(E(96, 92, 11, 8, c.rg("#ffe08a", "#e8a82a")), -20, 96, 92) + rot(E(88, 102, 9, 6, c.rg("#ffe08a", "#e8a82a")), 25, 88, 102),
  popcorn: (c) => {
    let s = shadow(64, 30);
    const rnd = seeded("pop");
    for (let i = 0; i < 16; i++) { const x = 44 + rnd() * 40, y = 30 + rnd() * 24; s += C(x, y, 6 + rnd() * 2, c.rg("#fffbe8", "#f2d27a")); }
    s += P("M40 52H88L82 104H46Z", "#ffffff");
    for (let i = 0; i < 4; i++) s += P(`M${44 + i * 12} 52H${50 + i * 12}L${49.5 + i * 10.5} 104H${44.5 + i * 10.5}Z`, "#e8473a");
    return s;
  },
  pretzels: (c) => {
    const pz = (x, y, s, deg) => rot(S(`M${x} ${y + 18 * s}Q${x - 26 * s} ${y + 8 * s} ${x - 20 * s} ${y - 10 * s}Q${x - 14 * s} ${y - 22 * s} ${x} ${y - 6 * s}Q${x + 14 * s} ${y - 22 * s} ${x + 20 * s} ${y - 10 * s}Q${x + 26 * s} ${y + 8 * s} ${x} ${y + 18 * s}M${x - 10 * s} ${y + 14 * s}L${x + 8 * s} ${y - 4 * s}M${x + 10 * s} ${y + 14 * s}L${x - 8 * s} ${y - 4 * s}`, c.lg("#c47a3a", "#7e4a22"), 7 * s) + [[-14, -6], [12, -10], [-4, 10], [16, 4]].map(([dx, dy]) => R(x + dx * s, y + dy * s, 2.4, 1.6, 0.4, "#ffffff")).join(""), deg, x, y);
    return shadow(64, 42) + pz(80, 64, 0.8, 15) + pz(52, 80, 1, -10);
  },
  gummies: (c) => {
    const bear = (x, y, col) => E(x, y + 6, 9, 11, col) + C(x, y - 8, 7.5, col) + C(x - 6, y - 14, 3, col) + C(x + 6, y - 14, 3, col) + C(x - 7, y + 2, 3, col) + C(x + 7, y + 2, 3, col) + E(x - 3, y - 2, 2.5, 5, "#ffffff", `opacity=".45"`);
    return shadow(64, 42) + bear(44, 78, "#f2603a") + bear(64, 70, "#7fc463") + bear(84, 80, "#ffd25a") + bear(56, 92, "#d84a8a");
  },
  marshmallow: (c) => {
    const z = (x, y, s, a, b) => {
      let t = C(x, y, 17 * s, c.rg(a, b));
      for (let i = 0; i < 8; i++) { const ang = (i / 8) * Math.PI * 2; t += S(`M${x} ${y}Q${x + Math.cos(ang + 0.5) * 10 * s} ${y + Math.sin(ang + 0.5) * 10 * s} ${x + Math.cos(ang) * 16 * s} ${y + Math.sin(ang) * 16 * s}`, "#ffffff", 1.4 * s, `opacity=".55"`); }
      return t;
    };
    return shadow(64, 42) + z(48, 78, 1, "#ffe6ee", "#f4a8c0") + z(80, 78, 1, "#ffffff", "#ece4ea") + z(64, 56, 0.9, "#ffe6ee", "#f4a8c0");
  },
  lollipops: (c) => {
    let d = "M64 52";
    for (let t = 0; t < 5 * Math.PI; t += 0.25) { const r = 1 + t * 1.45; d += `L${(64 + Math.cos(t) * r).toFixed(1)} ${(52 + Math.sin(t) * r).toFixed(1)}`; }
    return shadow(64, 24, 106) + R(62, 72, 4, 34, 2, "#ffffff") + C(64, 52, 24, c.rg("#ffd2e0", "#f06a9a")) + S(d, "#ffffff", 3.4, `opacity=".85"`) + S("M58 36q12-4 20 6", "#ffffff", 2, `opacity=".5"`);
  },
  "snack-bar": (c) =>
    shadow(64, 44) +
    rot(R(20, 54, 88, 26, 6, c.lg("#7fb8f0", "#3f7ac8")) + P("M84 54L92 50V84L84 80Z", "#9cc8f4") + R(26, 60, 52, 14, 4, "#fbf3e6") + mini.star(36, 67, 0.8, "#f2a02a") + R(44, 64, 28, 3, 1.5, "#c9a15a") + R(44, 69, 20, 3, 1.5, "#c9a15a"), -14) +
    rot(R(70, 84, 30, 14, 4, c.lg("#d9a066", "#9a6430")) + C(78, 90, 2.4, "#f4e2bc") + C(88, 88, 2, "#7a4a2a") + C(94, 93, 2.2, "#f4e2bc"), -14, 85, 91),
  "dried-fruit": (c) => {
    let s = shadow(64, 42);
    for (const [x, y, deg] of [[46, 70, -20], [66, 64, 15], [80, 80, -10]]) s += rot(E(x, y, 13, 10, c.rg("#ffb84a", "#e0781a")) + S(`M${x - 6} ${y}Q${x} ${y - 4} ${x + 6} ${y}`, "#c96a12", 1.4), deg, x, y);
    for (const [x, y] of [[54, 88], [62, 92], [70, 96], [46, 94], [40, 84]]) s += E(x, y, 4, 5, c.rg("#9a6a8a", "#4a2a4a"));
    s += E(88, 98, 9, 7, c.rg("#5a3a4a", "#2a1a22"));
    return s;
  },
  jam: (c) =>
    jar(c, { x: 62, y: 46, w: 48, h: 54, lid: ["#ffffff", "#e8d6c8"], fill: c.lg("#e8475a", "#9e1430"), label: "#fff3dc", art: mini.berry(58, 76, 5, "#d42a4a") + mini.berry(68, 78, 4.5, "#d42a4a") + mini.leaf(63, 70, 0.6, "#5fa54c") }) +
    P("M36 34Q62 28 88 34L92 44Q62 38 32 44Z", "#f49fb6") + [40, 50, 60, 70, 80].map((x) => C(x, 38, 2, "#ffffff")).join(""),
};
