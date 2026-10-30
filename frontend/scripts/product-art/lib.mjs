// Shared drawing kit for the product illustrations: one tile, one light, one shadow, one set of
// shapes, so ~200 pictures read as a single collection. Soft gradients, no outlines; details are
// darker tones of the object's own colour. Canvas 128×128, the object sits around (64, 64).

// Pastel tile + its inner glow, per catalogue category (Family OS mint / peach / lemon / lavender).
export const TILES = {
  vegetables: ["#d9f0e4", "#f2faf6"],
  fruits: ["#ffe0d2", "#fff5ef"],
  dairy: ["#e8dffd", "#f8f5ff"],
  meat: ["#ffe0d2", "#fff5ef"],
  fish: ["#e8dffd", "#f8f5ff"],
  bakery: ["#fbedb8", "#fefae9"],
  grocery: ["#fbedb8", "#fefae9"],
  frozen: ["#e8dffd", "#f8f5ff"],
  drinks: ["#d9f0e4", "#f2faf6"],
  sweets: ["#ffe0d2", "#fff5ef"],
  pantry: ["#fbedb8", "#fefae9"],
  household: ["#e8dffd", "#f8f5ff"],
  hygiene: ["#d9f0e4", "#f2faf6"],
};

const f = (n) => (Math.round(n * 10) / 10).toString();

/** A drawing context: collects gradient definitions (ids are local to one SVG file). */
export function makeCtx() {
  let n = 0;
  const defs = [];
  return {
    /** Vertical (default) linear gradient, light → dark. */
    lg(c1, c2, x1 = 0, y1 = 0, x2 = 0, y2 = 1) {
      const id = `g${n++}`;
      defs.push(`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`);
      return `url(#${id})`;
    },
    /** Soft round light from the upper left. */
    rg(c1, c2, cx = 0.35, cy = 0.3, r = 0.75) {
      const id = `g${n++}`;
      defs.push(`<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>`);
      return `url(#${id})`;
    },
    /** Clip path from shape markup; use as `clip-path="${ctx.clip(...)}"`. */
    clip(shape) {
      const id = `k${n++}`;
      defs.push(`<clipPath id="${id}">${shape}</clipPath>`);
      return `url(#${id})`;
    },
    defs: () => defs.join(""),
  };
}

// ---- primitives ---------------------------------------------------------------------------
export const P = (d, fill, extra = "") => `<path d="${d}" fill="${fill}"${extra ? " " + extra : ""}/>`;
export const S = (d, color, w = 2, extra = "") =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra ? " " + extra : ""}/>`;
export const C = (cx, cy, r, fill, extra = "") => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}"${extra ? " " + extra : ""}/>`;
export const E = (cx, cy, rx, ry, fill, extra = "") =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra ? " " + extra : ""}/>`;
export const R = (x, y, w, h, rx, fill, extra = "") =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(rx)}" fill="${fill}"${extra ? " " + extra : ""}/>`;
export const G = (inner, attrs) => `<g ${attrs}>${inner}</g>`;
export const rot = (inner, deg, cx = 64, cy = 64) => G(inner, `transform="rotate(${deg} ${cx} ${cy})"`);
export const at = (inner, x, y, s = 1) => G(inner, `transform="translate(${f(x)} ${f(y)})${s !== 1 ? ` scale(${s})` : ""}"`);

/** Glossy highlight. */
export const hl = (cx, cy, rx, ry, deg = -30, o = 0.5) =>
  E(cx, cy, rx, ry, "#fff", `opacity="${o}" transform="rotate(${deg} ${f(cx)} ${f(cy)})"`);
/** Contact shadow under the object. */
export const shadow = (cx = 64, rx = 36, cy = 105, o = 0.1) => E(cx, cy, rx, 5.5, "#6b4f3a", `opacity="${o}"`);

/** Deterministic small random from a string — decor varies between products but never between builds. */
export function seeded(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const leafShape = (x, y, deg, s, fill) =>
  `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(deg)}) scale(${s})" d="M0 0C3-5 10-7 15-5C11 1 5 3 0 0Z" fill="${fill}"/>`;
const dash = (x, y, deg, fill) => R(x - 1.4, y - 4, 2.8, 8, 1.4, fill, `transform="rotate(${f(deg)} ${f(x)} ${f(y)})"`);

/** The little leaves and peach dashes floating around every illustration (as on the reference art). */
export function decor(id) {
  const rnd = seeded(id);
  const flip = rnd() > 0.5;
  const L1 = flip ? [20, 34] : [104, 30];
  const L2 = flip ? [104, 92] : [22, 90];
  const D1 = flip ? [100, 24] : [26, 22];
  const D2 = flip ? [24, 98] : [104, 100];
  return (
    leafShape(L1[0], L1[1], flip ? -40 + rnd() * 20 : 200 + rnd() * 20, 0.8, "#9fcaa9") +
    leafShape(L2[0], L2[1], flip ? 150 + rnd() * 30 : -20 + rnd() * 30, 0.65, "#b5d8bd") +
    dash(D1[0], D1[1], 20 + rnd() * 30, "#f6c4aa") +
    dash(D2[0], D2[1], -20 - rnd() * 30, "#f6c4aa")
  );
}

/** Wrap one drawing into the finished tile. */
export function tile(category, id, draw) {
  const ctx = makeCtx();
  const body = draw(ctx);
  const [bg, glow] = TILES[category];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">` +
    (ctx.defs() ? `<defs>${ctx.defs()}</defs>` : "") +
    R(0, 0, 128, 128, 30, bg) +
    C(64, 62, 47, glow, `opacity=".85"`) +
    decor(id) +
    G(body, `transform="translate(64 66) scale(1.1) translate(-64 -66)"`) +
    `</svg>`
  );
}

// ---- reusable shapes ------------------------------------------------------------------------
// Each takes the context, a position and colours; callers add what makes the product itself.

/** A bottle: neck, shoulders, body. Returns the outline path for reuse (labels, glass). */
export function bottlePath(x, top, w, h, nw, nh, shoulder = 12) {
  const l = x - w / 2, r = x + w / 2, nl = x - nw / 2, nr = x + nw / 2, sy = top + nh, by = top + h;
  return `M${f(nl)} ${f(top)}H${f(nr)}V${f(sy)}C${f(nr)} ${f(sy + shoulder * 0.5)} ${f(r)} ${f(sy + shoulder * 0.4)} ${f(r)} ${f(sy + shoulder)}V${f(by - 6)}Q${f(r)} ${f(by)} ${f(r - 6)} ${f(by)}H${f(l + 6)}Q${f(l)} ${f(by)} ${f(l)} ${f(by - 6)}V${f(sy + shoulder)}C${f(l)} ${f(sy + shoulder * 0.4)} ${f(nl)} ${f(sy + shoulder * 0.5)} ${f(nl)} ${f(sy)}Z`;
}

export function bottle(ctx, o) {
  const { x = 64, top = 22, w = 34, h = 80, nw = 12, nh = 14, shoulder = 14, body, cap, capH = 9, label, labelY, labelH = 26, art = "", gloss = true } = o;
  const by = top + h;
  let s = shadow(x, w * 0.75);
  s += P(bottlePath(x, top, w, h, nw, nh, shoulder), ctx.lg(body[0], body[1], 0, 0, 1, 0));
  if (cap) s += R(x - nw / 2 - 1.5, top - capH + 2, nw + 3, capH, 2.5, ctx.lg(cap[0], cap[1]));
  if (label) {
    const ly = labelY ?? by - labelH - 10;
    s += R(x - w / 2, ly, w, labelH, 2, label);
  }
  s += art;
  if (gloss) s += R(x - w / 2 + 4, top + nh + shoulder, 4, h - nh - shoulder - 12, 2, "#fff", `opacity=".35"`);
  return s;
}

/** Gable-top carton (milk, juice) in three-quarter view. */
export function carton(ctx, o) {
  const { x = 58, y = 40, w = 34, h = 58, d = 14, front, side, top, art = "", band } = o;
  const l = x - w / 2, r = x + w / 2;
  let s = shadow(x + d / 2, w * 0.8);
  s += P(`M${f(l)} ${f(y)}H${f(r)}V${f(y + h)}H${f(l)}Z`, ctx.lg(front[0], front[1]));
  s += P(`M${f(r)} ${f(y)}L${f(r + d)} ${f(y - 6)}V${f(y + h - 6)}L${f(r)} ${f(y + h)}Z`, side);
  s += P(`M${f(l)} ${f(y)}L${f(x)} ${f(y - 14)}L${f(r)} ${f(y)}Z`, top[0]);
  s += P(`M${f(x)} ${f(y - 14)}L${f(x + d)} ${f(y - 20)}L${f(r + d)} ${f(y - 6)}L${f(r)} ${f(y)}Z`, top[1]);
  s += P(`M${f(x)} ${f(y - 14)}L${f(x + d)} ${f(y - 20)}V${f(y - 25)}L${f(x)} ${f(y - 19)}Z`, top[0]);
  if (band) s += R(l, y + h * 0.28, w, h * 0.44, 0, band);
  s += art;
  s += R(l + 3, y + 4, 3.5, h - 8, 1.75, "#fff", `opacity=".35"`);
  return s;
}

/** A glass jar with a lid; `fill` is what is inside. */
export function jar(ctx, o) {
  const { x = 64, y = 44, w = 46, h = 54, lid, fill, art = "", label, fillTop = 0.12, glass = "#ffffff" } = o;
  const l = x - w / 2;
  let s = shadow(x, w * 0.7);
  s += R(l, y, w, h, 10, glass, `opacity=".55"`);
  s += R(l + 3, y + h * fillTop, w - 6, h * (1 - fillTop) - 3, 8, fill);
  if (label) s += R(l, y + h * 0.36, w, h * 0.38, 2, label);
  s += art;
  s += R(l - 2, y - 10, w + 4, 12, 4, ctx.lg(lid[0], lid[1]));
  s += R(l, y - 2, w, 4, 1, lid[1], `opacity=".6"`);
  s += R(l + 5, y + 6, 4, h - 14, 2, "#fff", `opacity=".45"`);
  return s;
}

/** A bowl seen from slightly above; `content` is drawn into the opening. */
export function bowl(ctx, o) {
  const { x = 64, y = 70, w = 76, depth = 30, color, content = "", rim } = o;
  const l = x - w / 2, r = x + w / 2;
  let s = shadow(x, w * 0.42, y + depth + 3);
  s += E(x, y, w / 2, 9, rim ?? color[0]);
  s += content;
  s += P(`M${f(l)} ${f(y)}Q${f(l + 2)} ${f(y + depth)} ${f(x)} ${f(y + depth)}Q${f(r - 2)} ${f(y + depth)} ${f(r)} ${f(y)}Q${f(x)} ${f(y + 11)} ${f(l)} ${f(y)}Z`, ctx.lg(color[0], color[1]));
  s += P(`M${f(l + 8)} ${f(y + 6)}Q${f(l + 12)} ${f(y + depth - 6)} ${f(x - 8)} ${f(y + depth - 3)}`, "none", `stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".45"`);
  return s;
}

/** A heaped mound of grains/food inside a bowl opening: dots of `colors` over a base ellipse. */
export function heap(x, y, w, base, colors, id, count = 46, grain = 1.6, rise = 13) {
  const rnd = seeded(id + "heap");
  let s = P(`M${f(x - w / 2)} ${f(y)}Q${f(x)} ${f(y - rise * 2)} ${f(x + w / 2)} ${f(y)}Z`, base);
  for (let i = 0; i < count; i++) {
    const t = rnd() * 2 - 1;
    const px = x + (t * w) / 2.2;
    const maxUp = rise * (1 - t * t) * 0.95;
    const py = y - rnd() * maxUp - 1;
    s += E(px, py, grain, grain * 0.7, colors[i % colors.length], `transform="rotate(${f(rnd() * 180)} ${f(px)} ${f(py)})"`);
  }
  return s;
}

/** A tin can with a label. */
export function can(ctx, o) {
  const { x = 64, y = 42, w = 44, h = 56, metal = ["#eef0f2", "#b7bfc6"], label, art = "", labelH } = o;
  const l = x - w / 2;
  let s = shadow(x, w * 0.7);
  s += R(l, y, w, h, 5, ctx.lg(metal[0], metal[1], 0, 0, 1, 0));
  s += R(l, y + 6, w, labelH ?? h - 12, 0, ctx.lg(label[0], label[1], 0, 0, 1, 0));
  s += E(x, y, w / 2, 5, metal[0]);
  s += E(x, y, w / 2 - 3, 3.5, metal[1], `opacity=".6"`);
  s += art;
  s += R(l + 4, y + 8, 3.5, h - 16, 1.75, "#fff", `opacity=".35"`);
  return s;
}

/** A soft pouch/bag with a crimped top. */
export function pouch(ctx, o) {
  const { x = 64, y = 30, w = 52, h = 70, body, crimp, art = "", window } = o;
  const l = x - w / 2, r = x + w / 2;
  let s = shadow(x, w * 0.65);
  s += P(`M${f(l + 3)} ${f(y + 6)}H${f(r - 3)}Q${f(r + 3)} ${f(y + h * 0.5)} ${f(r - 2)} ${f(y + h)}H${f(l + 2)}Q${f(l - 3)} ${f(y + h * 0.5)} ${f(l + 3)} ${f(y + 6)}Z`, ctx.lg(body[0], body[1], 0, 0, 1, 0));
  s += R(l + 1, y, w - 2, 9, 2, crimp);
  for (let i = 0; i < 9; i++) s += R(l + 4 + i * ((w - 9) / 8), y + 1.5, 1.2, 6, 0.6, "#000", `opacity=".08"`);
  if (window) s += window;
  s += art;
  s += R(l + 6, y + 14, 4, h - 24, 2, "#fff", `opacity=".3"`);
  return s;
}

/** A box in three-quarter view. */
export function box(ctx, o) {
  const { x = 58, y = 36, w = 44, h = 60, d = 14, front, side, topc, art = "" } = o;
  const l = x - w / 2, r = x + w / 2;
  let s = shadow(x + d / 2, w * 0.75);
  s += P(`M${f(l)} ${f(y)}L${f(l + d)} ${f(y - d * 0.6)}H${f(r + d)}L${f(r)} ${f(y)}Z`, topc);
  s += P(`M${f(r)} ${f(y)}L${f(r + d)} ${f(y - d * 0.6)}V${f(y + h - d * 0.6)}L${f(r)} ${f(y + h)}Z`, side);
  s += R(l, y, w, h, 2, ctx.lg(front[0], front[1]));
  s += art;
  return s;
}

/** A squeeze tube lying diagonally. */
export function tube(ctx, o) {
  const { body, cap, art = "", deg = -28 } = o;
  let s = shadow(64, 40);
  let t = P("M30 52H88L98 58V70L88 76H30L26 70V58Z", ctx.lg(body[0], body[1]));
  t += R(22, 54, 6, 20, 1.5, body[1]);
  t += R(96, 57, 14, 14, 3, ctx.lg(cap[0], cap[1]));
  t += art;
  t += R(34, 56, 48, 3, 1.5, "#fff", `opacity=".45"`);
  s += rot(t, deg);
  return s;
}

/** A trigger spray bottle. */
export function spray(ctx, o) {
  const { body, head, label, art = "" } = o;
  let s = shadow(64, 30);
  s += P("M46 52Q46 46 52 46H74Q80 46 80 52V100Q80 104 76 104H50Q46 104 46 100Z", ctx.lg(body[0], body[1], 0, 0, 1, 0));
  s += R(56, 38, 14, 10, 2, head[1]);
  s += P("M50 24H78Q84 24 84 30V34L90 38V42L80 40H66Q58 40 56 34L50 30Z", ctx.lg(head[0], head[1]));
  s += P("M62 40Q60 50 54 52L58 54Q64 50 68 40Z", head[1]);
  if (label) s += R(48, 62, 30, 28, 4, label);
  s += art;
  s += R(50, 54, 4, 44, 2, "#fff", `opacity=".35"`);
  return s;
}

/** A jug with a handle (laundry gel, bleach). */
export function jug(ctx, o) {
  const { body, cap, label, art = "" } = o;
  let s = shadow(64, 36);
  s += P("M36 46Q36 36 46 34H62V28H78V36Q90 40 92 52V98Q92 104 86 104H42Q36 104 36 98Z", ctx.lg(body[0], body[1], 0, 0, 1, 0));
  s += P("M76 46Q86 46 86 56V70Q86 76 80 76H76V68H79V56Q79 52 76 52Z", body[1], `opacity=".55"`);
  s += R(60, 20, 20, 10, 3, ctx.lg(cap[0], cap[1]));
  if (label) s += R(40, 62, 34, 30, 5, label);
  s += art;
  s += R(40, 46, 4, 50, 2, "#fff", `opacity=".35"`);
  return s;
}

/** A fish in side view; `pattern` decorates the body. */
export function fish(ctx, o) {
  const { x = 62, y = 66, len = 74, ht = 28, body, belly, fin, pattern = "", eye = "#2f3b46", deg = -8 } = o;
  const l = x - len / 2, r = x + len / 2;
  let t = P(`M${f(r - 4)} ${f(y)}L${f(r + 12)} ${f(y - 12)}Q${f(r + 8)} ${f(y)} ${f(r + 12)} ${f(y + 12)}Z`, fin);
  t += P(`M${f(x - 6)} ${f(y - ht / 2 + 1)}Q${f(x + 6)} ${f(y - ht / 2 - 9)} ${f(x + 16)} ${f(y - ht / 2 + 2)}Z`, fin);
  t += P(`M${f(l)} ${f(y)}Q${f(l + len * 0.3)} ${f(y - ht)} ${f(r)} ${f(y - 2)}Q${f(l + len * 0.3)} ${f(y + ht)} ${f(l)} ${f(y)}Z`, ctx.lg(body[0], body[1]));
  t += P(`M${f(l + 4)} ${f(y + 2)}Q${f(l + len * 0.35)} ${f(y + ht * 0.62)} ${f(r - 6)} ${f(y + 1)}Q${f(l + len * 0.35)} ${f(y + ht * 0.25)} ${f(l + 4)} ${f(y + 2)}Z`, belly, `opacity=".9"`);
  t += pattern;
  t += S(`M${f(l + 14)} ${f(y - 8)}Q${f(l + 19)} ${f(y)} ${f(l + 14)} ${f(y + 8)}`, body[1], 1.8, `opacity=".6"`);
  t += C(l + 9, y - 3, 2.6, "#fff") + C(l + 9.4, y - 3, 1.5, eye);
  return shadow(x, len * 0.5) + rot(t, deg, x, y);
}

/** A curved slice/fillet shape (fish fillet, chicken breast), returns path. */
export const filletPath = (x, y, len, ht) =>
  `M${f(x - len / 2)} ${f(y + 4)}Q${f(x - len / 2 - 4)} ${f(y - ht * 0.6)} ${f(x - len / 4)} ${f(y - ht / 2)}Q${f(x + len / 4)} ${f(y - ht * 0.75)} ${f(x + len / 2)} ${f(y - 4)}Q${f(x + len / 2 + 2)} ${f(y + ht * 0.45)} ${f(x + len / 5)} ${f(y + ht / 2)}Q${f(x - len / 4)} ${f(y + ht * 0.6)} ${f(x - len / 2)} ${f(y + 4)}Z`;

/** A leafy sprig: stem plus leaves along it (herbs, garnish). */
export function sprig(x, y, len, deg, leaf, stem, s = 1, step = 9) {
  let t = S(`M0 0V${-len}`, stem, 2 * s);
  for (let i = 1; i * step < len; i++) {
    const yy = -i * step;
    t += `<path transform="translate(0 ${yy}) rotate(${i % 2 ? -50 : 230}) scale(${0.55 * s})" d="M0 0C3-5 10-7 15-5C11 1 5 3 0 0Z" fill="${leaf}"/>`;
  }
  t += `<path transform="translate(0 ${-len}) rotate(-90) scale(${0.6 * s})" d="M0 0C3-5 10-7 15-5C11 1 5 3 0 0Z" fill="${leaf}"/>`;
  return G(t, `transform="translate(${f(x)} ${f(y)}) rotate(${deg})"`);
}

/** Tiny label icons used on packaging so similar packs stay recognisable. */
export const mini = {
  leaf: (x, y, s = 1, c = "#6fae8c") => `<path transform="translate(${f(x - 7 * s)} ${f(y + 3 * s)}) rotate(-30) scale(${s})" d="M0 0C3-5 10-7 15-5C11 1 5 3 0 0Z" fill="${c}"/>`,
  drop: (x, y, s = 1, c = "#7cc1e8") => `<path transform="translate(${f(x)} ${f(y - 6 * s)}) scale(${s})" d="M0 0C3 4 5 6.5 5 9A5 5 0 0 1-5 9C-5 6.5-3 4 0 0Z" fill="${c}"/>`,
  orange: (x, y, r = 7) => C(x, y, r, "#f7a33c") + C(x, y, r - 1.6, "#ffd27a") + S(`M${f(x - r + 2)} ${f(y)}H${f(x + r - 2)}M${f(x)} ${f(y - r + 2)}V${f(y + r - 2)}M${f(x - r * 0.6)} ${f(y - r * 0.6)}L${f(x + r * 0.6)} ${f(y + r * 0.6)}M${f(x + r * 0.6)} ${f(y - r * 0.6)}L${f(x - r * 0.6)} ${f(y + r * 0.6)}`, "#f7a33c", 0.9),
  berry: (x, y, r = 4, c = "#d9415a") => C(x, y, r, c) + C(x - r * 0.35, y - r * 0.35, r * 0.3, "#fff", `opacity=".6"`),
  star: (x, y, s = 1, c = "#f2c94c") => `<path transform="translate(${f(x)} ${f(y)}) scale(${s})" d="M0-6 1.8-1.8 6 0 1.8 1.8 0 6-1.8 1.8-6 0-1.8-1.8Z" fill="${c}"/>`,
  bubbles: (x, y, s = 1, c = "#ffffff") => C(x, y, 3 * s, c, `opacity=".8"`) + C(x + 5 * s, y - 4 * s, 2 * s, c, `opacity=".8"`) + C(x - 4 * s, y - 5 * s, 1.5 * s, c, `opacity=".8"`),
  flower: (x, y, r = 3, c = "#f49fb6") => [0, 72, 144, 216, 288].map((a) => C(x + Math.cos((a * Math.PI) / 180) * r, y + Math.sin((a * Math.PI) / 180) * r, r * 0.75, c)).join("") + C(x, y, r * 0.55, "#ffd66e"),
  snow: (x, y, s = 1, c = "#9fc2ef") => S(`M${f(x)} ${f(y - 6 * s)}V${f(y + 6 * s)}M${f(x - 5.2 * s)} ${f(y - 3 * s)}L${f(x + 5.2 * s)} ${f(y + 3 * s)}M${f(x - 5.2 * s)} ${f(y + 3 * s)}L${f(x + 5.2 * s)} ${f(y - 3 * s)}`, c, 1.6 * s),
};
