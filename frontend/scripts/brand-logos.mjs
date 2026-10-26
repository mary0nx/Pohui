// Builds the brand logos for transaction icons from a downloaded Simple Icons package
// (https://simpleicons.org, CC0-1.0; the trademarks belong to their owners — see DISCLAIMER.md
// of the package). Each logo is the brand's official glyph in a circle of its official colour.
//
//   npm pack simple-icons@16.36.0 && tar xzf simple-icons-16.36.0.tgz
//   node scripts/brand-logos.mjs ./package
//
// Output: public/assets/brands/<brand-id>.svg, public/assets/brands/ATTRIBUTION.md and
// src/features/finance/merchants/brandLogos.ts (the list of brands that really have a file).
// Only brands verified to be the same company as in Poland are listed below; e.g. Simple Icons'
// "Netto" (German Netto Marken-Discount), "CCC" (a Chinese certificate) and "Odido" (a Dutch
// telecom) are different companies and are deliberately left out (Polish Netto has its own
// badge from scripts/wordmark-logo.py).
import { readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = {
  lidl: "lidl", zabka: "zabka", kaufland: "kaufland", carrefour: "carrefour", auchan: "auchan", intermarche: "intermarche",
  e_leclerc: "edotleclerc", aldi: "aldinord", allegro: "allegro", aliexpress: "aliexpress", vinted: "vinted", zalando: "zalando",
  ebay: "ebay", etsy: "etsy", hm: "handm", zara: "zara", ikea: "ikea", leroy_merlin: "leroymerlin", castorama: "castorama",
  mediamarkt: "mediamarkt", apple: "apple", samsung: "samsung", playstation: "playstation", steam: "steam", rossmann: "rossmann",
  dm: "dm", mcdonalds: "mcdonalds", kfc: "kfc", burger_king: "burgerking", starbucks: "starbucks", uber_eats: "ubereats",
  glovo: "glovo", uber: "uber", shell: "shell", orange: "orange", t_mobile: "deutschetelekom", netflix: "netflix",
  spotify: "spotify", youtube: "youtube", google: "google", hbo_max: "hbomax", apple_pay: "applepay", google_pay: "googlepay",
  paypal: "paypal", revolut: "revolut", wise: "wise", dpd: "dpd", dhl: "dhl", ups: "ups", booking: "bookingdotcom",
  airbnb: "airbnb", ryanair: "ryanair", lot: "lotpolishairlines", google_play: "googleplay", wizz_air: "wizzair",
  deezer: "deezer", tidal: "tidal", duolingo: "duolingo", lufthansa: "lufthansa", easyjet: "easyjet",
};

const pkg = process.argv[2];
if (!pkg) throw new Error("usage: node scripts/brand-logos.mjs <path to the unpacked simple-icons package>");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "assets", "brands");
const data = JSON.parse(readFileSync(join(pkg, "data", "simple-icons.json"), "utf8"));
const version = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")).version;
const bySlug = new Map(data.map((i) => [i.slug ?? i.title.toLowerCase().replace(/[^a-z0-9]/g, ""), i]));

// WCAG relative luminance → pick the glyph colour with the better contrast on the brand colour.
const lum = (hex) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const glyphColour = (hex) => ((1.05) / (lum(hex) + 0.05) >= (lum(hex) + 0.05) / (lum("1D1D1F") + 0.05) ? "#FFFFFF" : "#1D1D1F");

// Bounding box of a path from all its points (control points included: a slight overestimate,
// good enough to fit wide wordmarks larger than square marks).
function bbox(d) {
  let pos = 0;
  const skip = () => { while (pos < d.length && /[\s,]/.test(d[pos])) pos++; };
  const num = () => {
    skip();
    const m = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/.exec(d.slice(pos));
    if (!m) return NaN;
    pos += m[0].length;
    return parseFloat(m[0]);
  };
  const flag = () => { skip(); return Number(d[pos++]); }; // arc flags may be written without separators: "011"
  let cmd = "", x = 0, y = 0, sx = 0, sy = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const see = (px, py) => ((minX = Math.min(minX, px)), (maxX = Math.max(maxX, px)), (minY = Math.min(minY, py)), (maxY = Math.max(maxY, py)));
  const ARGS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  for (;;) {
    skip();
    if (pos >= d.length) break;
    if (/[a-zA-Z]/.test(d[pos])) cmd = d[pos++];
    const lc = cmd.toLowerCase(), rel = cmd === lc;
    if (lc === "z") { x = sx; y = sy; continue; }
    const args = lc === "a" ? [num(), num(), num(), flag(), flag(), num(), num()] : Array.from({ length: ARGS[lc] }, num);
    if (args.some(Number.isNaN)) break;
    const pt = (ax, ay) => [rel ? x + ax : ax, rel ? y + ay : ay];
    if (lc === "h") x = rel ? x + args[0] : args[0];
    else if (lc === "v") y = rel ? y + args[0] : args[0];
    else if (lc === "a") {
      // The arc can bulge beyond its end points by up to its radius.
      const [ex, ey] = pt(args[5], args[6]);
      const r = Math.max(Math.abs(args[0]), Math.abs(args[1]));
      const mx = (x + ex) / 2, my = (y + ey) / 2, half = Math.hypot(ex - x, ey - y) / 2;
      const reach = Math.min(r, Math.max(half, r));
      see(mx - reach, my - reach), see(mx + reach, my + reach);
      [x, y] = [ex, ey];
    } else {
      for (let k = 0; k < args.length - 2; k += 2) see(...pt(args[k], args[k + 1]));
      [x, y] = pt(args[args.length - 2], args[args.length - 1]);
    }
    see(x, y);
    if (lc === "m") { [sx, sy] = [x, y]; cmd = rel ? "l" : "L"; }
  }
  // Never larger than the 24×24 icon box Simple Icons draws in.
  minX = Math.max(minX, 0), minY = Math.max(minY, 0), maxX = Math.min(maxX, 24), maxY = Math.min(maxY, 24);
  return { minX, minY, w: maxX - minX, h: maxY - minY };
}
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");

mkdirSync(out, { recursive: true });
for (const id of Object.keys(SOURCE)) rmSync(join(out, `${id}.svg`), { force: true }); // Commons logos stay
const rows = [];
for (const [id, slug] of Object.entries(SOURCE)) {
  const icon = bySlug.get(slug);
  if (!icon) throw new Error(`Simple Icons has no "${slug}" (brand ${id})`);
  const svg = readFileSync(join(pkg, "icons", `${slug}.svg`), "utf8");
  const path = /<path d="([^"]+)"/.exec(svg)?.[1];
  if (!path) throw new Error(`no path in ${slug}.svg`);
  const fill = `#${icon.hex}`;
  // 64×64 circle; the glyph's bounding box is scaled so its diagonal is 44 px (square marks
  // ≈31 px, wide wordmarks up to ≈42 px) and centred.
  const b = bbox(path);
  const k = Math.min(44 / Math.hypot(b.w, b.h), 42 / b.w, 34 / b.h);
  const tx = 32 - (b.minX + b.w / 2) * k, ty = 32 - (b.minY + b.h / 2) * k;
  writeFileSync(
    join(out, `${id}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>${esc(icon.title)}</title><circle cx="32" cy="32" r="32" fill="${fill}"/><path transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(4)})" fill="${glyphColour(icon.hex)}" d="${path}"/></svg>\n`,
  );
  rows.push(`| ${id} | ${icon.title} | ${fill} | ${icon.source ?? ""} |`);
}
writeFileSync(
  join(out, "ATTRIBUTION.md"),
  `# Brand logos\n\nGenerated by \`scripts/brand-logos.mjs\` from [Simple Icons](https://simpleicons.org) ${version} (CC0-1.0).\n` +
    `Each file shows the brand's own glyph in a circle of the brand colour. The logos and names are trademarks of their owners;\n` +
    `they are used only to label transactions with the shop where they were made. See the Simple Icons DISCLAIMER for details.\n\n` +
    `| Brand id | Simple Icons title | Colour | Source |\n|---|---|---|---|\n${rows.join("\n")}\n`,
);
writeFileSync(
  join(root, "src", "features", "finance", "merchants", "brandLogos.ts"),
  // Every logo file really present: Simple Icons ones and those imported from Wikimedia Commons.
  `// Generated by scripts/brand-logos.mjs — brands with a logo file in public/assets/brands.\nexport const BRAND_LOGOS: ReadonlySet<string> = new Set(${JSON.stringify(readdirSync(out).filter((f) => f.endsWith(".svg")).map((f) => f.slice(0, -4)).sort())});\n`,
);
console.log(`${rows.length} logos → ${out}`);
