// Рыба и морепродукты.
import { C, E, P, R, S, filletPath, fish, hl, rot, shadow, sprig } from "./lib.mjs";

export default {
  salmon: (c) =>
    shadow(64, 40) +
    P("M64 34Q98 34 100 64Q102 96 64 98Q44 98 40 84L62 70L38 60Q40 34 64 34Z", "#c9cfd6") +
    P("M64 38Q94 38 96 64Q98 92 64 94Q48 94 44 84L64 70L42 60Q44 38 64 38Z", c.rg("#ffb07a", "#f0703e")) +
    S("M70 42Q60 56 70 66M84 46Q70 62 84 76M90 64Q76 78 82 90M56 86Q66 80 72 88", "#ffe0c8", 2.2) +
    C(64, 70, 3, "#fff1e2"),
  cod: (c) =>
    shadow(64, 42) +
    rot(P(filletPath(60, 70, 78, 42), "#b8b0a4") + P(filletPath(60, 67, 74, 36), c.rg("#ffffff", "#ece4d6")) + S("M34 64Q56 56 84 62M38 74Q60 68 82 72", "#e0d6c4", 1.6) + hl(46, 60, 9, 3, -10, 0.6), -6) +
    C(94, 92, 12, "#f2d23c") + C(94, 92, 10, "#fff5b8") + S("M86 92H102M94 84V100M88 86L100 98M100 86L88 98", "#f6e27a", 1),
  pollock: (c) => {
    // A long tapering fillet: broad head end, thin tail, grey skin showing along the lower edge.
    const shape = "M22 60Q24 44 46 46Q78 48 100 60Q108 64 104 70Q80 80 48 82Q24 82 22 60Z";
    return (
      shadow(64, 42) +
      rot(
        P("M22 64Q24 86 48 86Q80 84 106 72L104 66Q80 78 48 80Q26 80 22 64Z", c.lg("#8d96a2", "#5f6873")) +
          P(shape, c.rg("#fff6f2", "#efd8d0", 0.35, 0.35)) +
          S("M40 50Q34 64 40 78M54 49Q48 64 54 80M68 51Q62 64 68 79M82 55Q77 65 82 75", "#ead2c8", 1.4) +
          hl(40, 56, 9, 3, -5, 0.6),
        -10,
      ) +
      sprig(88, 100, 24, 64, "#5fa54c", "#5f9e4a", 0.75, 6)
    );
  },
  herring: (c) =>
    fish(c, { body: ["#5b7fb2", "#c9d6e6"], belly: "#eef3f9", fin: "#7f98bc", pattern: "", deg: -6 }),
  mackerel: (c) =>
    fish(c, {
      body: ["#2f7d7a", "#cfe0dc"], belly: "#f2f6f4", fin: "#3f8a86", deg: -6,
      pattern: S("M42 54q4 6 0 10M50 52q4 6 0 10M58 52q4 6 0 10M66 52q4 6 0 10M74 53q4 6 0 10M82 55q4 6 0 9", "#1f3f45", 2),
    }),
  trout: (c) =>
    fish(c, {
      body: ["#7f8f4a", "#e8e2c8"], belly: "#fbf2ea", fin: "#9a8a5a", deg: -6,
      pattern: R(36, 63, 56, 5, 2.5, "#f39a9a", `opacity=".85"`) + [[44, 56], [54, 54], [64, 55], [74, 57], [84, 58], [50, 60], [70, 60]].map(([x, y]) => C(x, y, 1.4, "#3a3a24")).join(""),
    }),
  "fish-fillet": (c) =>
    shadow(64, 44) +
    R(20, 58, 88, 42, 10, c.lg("#cfe4f5", "#93bde0")) + R(24, 62, 80, 34, 8, "#e9f4fc") +
    rot(P(filletPath(52, 78, 50, 22), c.rg("#ffffff", "#efe6dc")) + S("M34 76Q50 72 70 76", "#e3d8cc", 1.2), -8, 52, 78) +
    rot(P(filletPath(80, 80, 46, 20), c.rg("#ffffff", "#efe6dc")) + S("M64 79Q78 75 96 78", "#e3d8cc", 1.2), 6, 80, 80),
  shrimp: (c) => {
    const sh = (x, y, s, deg) =>
      rot(
        [0, 1, 2, 3, 4].map((i) => E(x + Math.cos(((180 + i * 45) * Math.PI) / 180) * 16 * s, y + Math.sin(((180 + i * 45) * Math.PI) / 180) * 16 * s, 8.5 * s - i * 0.6 * s, 7 * s, i % 2 ? "#ff9a7a" : "#ffb08f")).join("") +
          P(`M${x + 16 * s} ${y}l${10 * s} ${-4 * s}l${-2 * s} ${8 * s}Z`, "#f27a5a") +
          S(`M${x - 18 * s} ${y - 4 * s}q${-10 * s} ${-10 * s} ${-4 * s} ${-22 * s}M${x - 16 * s} ${y - 6 * s}q${-2 * s} ${-14 * s} ${8 * s} ${-18 * s}`, "#f27a5a", 1.2 * s) +
          C(x - 14 * s, y - 2 * s, 1.6 * s, "#2f2a2a"),
        deg,
        x,
        y,
      );
    return shadow(64, 40) + sh(52, 72, 1, -10) + sh(82, 86, 0.8, 30);
  },
  squid: (c) => {
    const grad = c.lg("#fffaf2", "#f0d8c0");
    const ring = (x, y, s) =>
      E(x, y, 15 * s, 11 * s, "none", `stroke="${grad}" stroke-width="${7 * s}"`) +
      E(x, y, 18 * s, 14 * s, "none", `stroke="#f5c9a8" stroke-width="${1.2 * s}" opacity=".7"`) +
      E(x, y, 15 * s, 11 * s, "none", `stroke="#fff" stroke-width="${2 * s}" opacity=".6" stroke-dasharray="6 14"`);
    return shadow(64, 42) + ring(46, 66, 1) + ring(78, 64, 0.9) + ring(62, 86, 1.05);
  },
  "crab-sticks": (c) => {
    const stick = (x, y, deg) => rot(R(x - 34, y - 7, 68, 14, 4, "#ffffff") + R(x - 34, y - 7, 68, 7, 3.5, c.lg("#ff8a76", "#e8473a")) + S(`M${x - 30} ${y + 3}H${x + 30}`, "#efe6dc", 1) + R(x - 30, y - 5, 54, 2, 1, "#fff", `opacity=".5"`), deg, x, y);
    return shadow(64, 42) + stick(62, 58, -12) + stick(66, 76, -4) + stick(62, 94, 4);
  },
};
