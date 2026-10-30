// Крупы, макароны и бакалея.
import { C, E, P, R, S, bottle, bowl, heap, hl, jar, mini, pouch, rot, seeded, shadow } from "./lib.mjs";

const blueBowl = ["#9cc3ef", "#5b8fd6"];
const leafAt = (x, y, deg, s, fill = "#6fb35a") =>
  `<path transform="translate(${x} ${y}) rotate(${deg}) scale(${s})" d="M0 0C3-5 10-7 15-5C11 1 5 3 0 0Z" fill="${fill}"/>`;
const wheat = (x, y, deg, s = 1, col = "#e0b866") =>
  rot(S(`M${x} ${y}V${y - 34 * s}`, "#c9a15a", 1.6 * s) + [0, 1, 2, 3, 4].map((i) => E(x - 3.5 * s, y - 12 * s - i * 5 * s, 2.4 * s, 4 * s, col, `transform="rotate(-30 ${x - 3.5 * s} ${y - 12 * s - i * 5 * s})"`) + E(x + 3.5 * s, y - 12 * s - i * 5 * s, 2.4 * s, 4 * s, col, `transform="rotate(30 ${x + 3.5 * s} ${y - 12 * s - i * 5 * s})"`)).join("") + E(x, y - 38 * s, 2.2 * s, 4 * s, col), deg, x, y);

export default {
  rice: (c) => bowl(c, { color: blueBowl, rim: "#eef5fd", content: heap(64, 70, 66, "#f7f4ec", ["#ffffff", "#ece6d6"], "rice", 70, 2.4, 15) }),
  buckwheat: (c) => bowl(c, { color: ["#f4e2c4", "#d2ad78"], rim: "#fbf3e6", content: heap(64, 70, 66, "#9a6038", ["#7e4a2a", "#a8693a", "#6a3c22"], "buck", 80, 2.2, 15) }),
  millet: (c) => bowl(c, { color: ["#c9e7d4", "#7fb898"], rim: "#eef8f2", content: heap(64, 70, 66, "#f6d35a", ["#f2c12e", "#ffe27a", "#e8b020"], "millet", 110, 1.4, 15) }),
  semolina: (c) =>
    shadow(64, 44, 98) +
    E(64, 82, 46, 14, c.lg("#ffffff", "#dfe6ee")) + E(64, 78, 38, 10, "#f2f4f8") + E(64, 77, 32, 8, c.rg("#fffbea", "#f3e6c0")) +
    R(58, 70, 12, 8, 2, "#ffe27a") + E(64, 78, 8, 2, "#ffe88f", `opacity=".7"`) +
    rot(R(84, 40, 7, 34, 3.5, "#d9dfe8") + E(87.5, 74, 6, 4, "#d9dfe8"), 30, 88, 60),
  oatmeal: (c) => {
    const rnd = seeded("oat");
    let flakes = P("M30 70Q64 42 98 70Z", "#e9d4a8");
    for (let i = 0; i < 30; i++) { const t = rnd() * 2 - 1, x = 64 + t * 30, y = 70 - rnd() * 20 * (1 - t * t); flakes += E(x, y, 4.5, 3, i % 2 ? "#f4e2bc" : "#dcc08a", `transform="rotate(${rnd() * 180} ${x} ${y})"`); }
    return bowl(c, { color: ["#f7c9a8", "#e09a6c"], rim: "#fff2e6", content: flakes }) + wheat(98, 56, 20, 0.7, "#d8b878");
  },
  cereal: (c) => {
    const rnd = seeded("loops");
    let loops = E(64, 70, 34, 7, "#f4f8ff");
    const col = ["#ff9a5a", "#ffd25a", "#8fd07a", "#f28aa8", "#7fb8f0"];
    for (let i = 0; i < 22; i++) { const t = rnd() * 2 - 1, x = 64 + t * 30, y = 70 - rnd() * 16 * (1 - t * t); loops += C(x, y, 4, "none", `stroke="${col[i % 5]}" stroke-width="3"`); }
    return bowl(c, { color: ["#ffffff", "#d9dfe8"], rim: "#ffffff", content: loops });
  },
  pasta: (c) => {
    const penne = (x, y, deg) => rot(P(`M${x - 13} ${y - 5}L${x + 9} ${y - 5}L${x + 13} ${y + 5}L${x - 9} ${y + 5}Z`, c.lg("#ffe08a", "#efb43a")) + E(x + 11, y, 2, 5, "#d99a20") + S(`M${x - 8} ${y - 2}L${x + 8} ${y - 2}M${x - 6} ${y + 2}L${x + 10} ${y + 2}`, "#f5c85a", 0.9), deg, x, y);
    return shadow(64, 42) + [[48, 82, -20], [70, 84, 15], [60, 70, 40], [84, 72, -35], [42, 66, 70], [64, 94, 0], [86, 92, 30], [54, 56, -10]].map(([x, y, d]) => penne(x, y, d)).join("");
  },
  spaghetti: (c) => {
    let s = shadow(64, 30);
    for (let i = -7; i <= 7; i++) s += S(`M${64 + i * 1.6} 102L${64 + i * 3.4} 22`, i % 2 ? "#f2c45a" : "#ffd97a", 2);
    return s + R(52, 60, 24, 10, 3, "#e8735a") + R(52, 63, 24, 3, 1.5, "#fff", `opacity=".4"`);
  },
  flour: (c) =>
    pouch(c, { x: 60, y: 30, w: 56, h: 72, body: ["#fffaf0", "#eadfca"], crimp: "#e2d4b8", art: wheat(60, 92, 0, 0.9, "#d9b465") }) +
    E(96, 98, 12, 4, "#ffffff") + C(92, 94, 4, "#ffffff", `opacity=".9"`) + C(100, 95, 3, "#ffffff", `opacity=".9"`),
  sugar: (c) => {
    const cube = (x, y, s) => P(`M${x} ${y}l${12 * s} ${-6 * s}l${12 * s} ${6 * s}l${-12 * s} ${6 * s}Z`, "#ffffff") + P(`M${x} ${y}l${12 * s} ${6 * s}v${14 * s}l${-12 * s} ${-6 * s}Z`, "#eef1f6") + P(`M${x + 12 * s} ${y + 6 * s}l${12 * s} ${-6 * s}v${14 * s}l${-12 * s} ${6 * s}Z`, "#d9dfe8");
    return shadow(64, 40) + cube(40, 78, 1) + cube(64, 78, 1) + cube(52, 72 - 14, 1) + cube(76, 90, 0.8) + C(36, 98, 1, "#fff") + C(92, 102, 1.2, "#fff");
  },
  salt: (c) =>
    shadow(60, 26) +
    P("M44 48H76L80 100Q80 104 76 104H44Q40 104 40 100Z", c.lg("#ffffff", "#e3e8ef", 0, 0, 1, 0)) +
    P("M44 48Q44 30 60 30Q76 30 76 48Z", c.lg("#cfd6df", "#9aa4b1")) +
    [[54, 38], [60, 36], [66, 38], [57, 43], [63, 43]].map(([x, y]) => C(x, y, 1.3, "#6f7a88")).join("") +
    R(46, 56, 4, 42, 2, "#fff", `opacity=".6"`) +
    C(92, 98, 1.6, "#fff") + C(96, 94, 1.2, "#fff") + C(88, 100, 1, "#fff"),
  "sunflower-oil": (c) =>
    bottle(c, { x: 62, top: 24, w: 34, h: 80, nw: 12, nh: 14, body: ["#ffe58a", "#f0b52a"], cap: ["#7fc463", "#3f8a3a"], label: "#ffffff", labelH: 28, art: [0, 40, 80, 120, 160, 200, 240, 280, 320].map((a) => E(62 + Math.cos((a * Math.PI) / 180) * 7, 82 + Math.sin((a * Math.PI) / 180) * 7, 3.6, 2, "#f6c21a", `transform="rotate(${a} ${62 + Math.cos((a * Math.PI) / 180) * 7} ${82 + Math.sin((a * Math.PI) / 180) * 7})"`)).join("") + C(62, 82, 4.5, "#7a4a2a") }),
  "olive-oil": (c) =>
    bottle(c, { x: 60, top: 20, w: 30, h: 84, nw: 10, nh: 22, shoulder: 10, body: ["#c9cf5a", "#6f7f2a"], cap: ["#4a5a2a", "#2f3a1a"], label: "#fbf6e6", labelH: 30, art: S("M50 92Q60 80 72 76", "#5f7a3a", 1.4) + E(56, 86, 3, 4, "#6f8a2a") + E(66, 80, 3, 4, "#4a5a22") + leafAt(60, 84, -40, 0.7, "#7fa65a") }),
  honey: (c) =>
    shadow(60, 36) +
    P("M34 62Q34 48 60 48Q86 48 86 62Q90 96 60 100Q30 96 34 62Z", c.rg("#ffd26a", "#e09a1a")) +
    R(36, 44, 48, 10, 4, "#c97f2c") + P("M40 54Q44 64 48 56Q52 66 56 56", "#ffe08a") +
    R(42, 70, 36, 18, 3, "#fff6e0") + C(60, 79, 5, "none", `stroke="#e09a1a" stroke-width="2"`) +
    rot(R(84, 26, 6, 40, 3, "#c4874a") + E(87, 66, 7, 9, "#d9a066") + S("M81 62h12M81 67h12", "#b8763a", 1.2), 25, 87, 50) +
    hl(42, 70, 4, 10, 15, 0.35),
  nuts: (c) =>
    shadow(64, 40) +
    C(52, 70, 22, c.rg("#e8c08a", "#b07a3e")) + S("M52 48V92M40 56Q48 66 40 78M64 56Q56 66 64 78M44 60Q36 70 44 84", "#9a6430", 1.6, `opacity=".7"`) +
    [[84, 66], [90, 86], [72, 92]].map(([x, y]) => E(x, y, 10, 11, c.rg("#c98a4a", "#7e4a22")) + E(x, y - 8, 7, 4, "#e8c896") + hl(x - 3, y - 2, 2.5, 4, 20, 0.4)).join(""),
  "peanut-butter": (c) =>
    jar(c, { x: 62, y: 46, w: 48, h: 54, lid: ["#ff8a6a", "#d84a3a"], fill: c.lg("#d9a066", "#a86a32"), label: "#fff3dc", art: E(62, 77, 9, 5.5, "#d9a066") + E(62, 77, 9, 5.5, "none", `stroke="#a86a32" stroke-width="1.2"`) + S("M58 74v6M66 74v6", "#a86a32", 1) }),
  lentils: (c) => bowl(c, { color: ["#c9e7d4", "#7fb898"], rim: "#eef8f2", content: heap(64, 70, 66, "#f08a4a", ["#f7a05a", "#e8783a", "#ffb878"], "lentil", 90, 2, 15) }),
  beans: (c) => {
    const rnd = seeded("beans");
    let s = shadow(64, 42);
    for (let i = 0; i < 16; i++) { const x = 34 + rnd() * 60, y = 62 + rnd() * 34; s += rot(P(`M${x - 8} ${y}Q${x - 9} ${y - 7} ${x - 2} ${y - 6}Q${x + 2} ${y - 4} ${x + 6} ${y - 6}Q${x + 11} ${y - 6} ${x + 9} ${y + 1}Q${x + 6} ${y + 7} ${x} ${y + 6}Q${x - 7} ${y + 6} ${x - 8} ${y}Z`, c.rg("#e2585a", "#8e1f2e")) + hl(x - 3, y - 3, 3, 1.5, -10, 0.45), rnd() * 180, x, y); }
    return s;
  },
  chickpeas: (c) => {
    const rnd = seeded("chick");
    let s = shadow(64, 42);
    for (let i = 0; i < 18; i++) { const x = 34 + rnd() * 60, y = 60 + rnd() * 38, r = 6.5 + rnd() * 1.5; s += C(x, y, r, c.rg("#fbe2b0", "#d9a85e")) + P(`M${x - 1} ${y - r}q3 3 1 6`, "none", `stroke="#c9944a" stroke-width="1.2"`) + C(x - 2, y - 2, 1.5, "#fff", `opacity=".5"`); }
    return s;
  },
};
