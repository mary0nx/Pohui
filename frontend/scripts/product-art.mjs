// Generates the product illustrations of the shopping catalogue: original vector drawings in one
// Family OS style (pastel rounded tile, soft light, no outlines), one file per product id.
// Output: public/products/<id>.svg.  Run: node scripts/product-art.mjs [--gallery <file.html>]
// The ids must match backend/app/modules/catalog/data.py; backend tests check that every product
// has its own file and that no two products share one.
import { readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { tile } from "./product-art/lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = join(root, "public", "products");

// One module per catalogue category (file name = category key); "categories" holds the fallback
// pictures for items that are not in the catalogue.
const modules = readdirSync(join(here, "product-art")).filter((n) => n.endsWith(".mjs") && n !== "lib.mjs");
const written = [];
for (const name of modules.sort()) {
  const category = name.replace(/\.mjs$/, "");
  const { default: items } = await import(pathToFileURL(join(here, "product-art", name)).href);
  for (const [id, draw] of Object.entries(items)) {
    const tileCategory = category === "categories" ? id.replace(/^category-/, "") : category;
    const svg = tile(tileCategory, id, draw);
    if (svg.includes("NaN") || svg.includes("undefined")) throw new Error(`${id}: broken drawing`);
    writeFileSync(join(out, `${id}.svg`), svg);
    written.push([category, id, svg.length]);
  }
}
console.log(`${written.length} illustrations, ${Math.round(written.reduce((a, [, , n]) => a + n, 0) / 1024)} KB`);

const gi = process.argv.indexOf("--gallery");
if (gi > 0) {
  const cells = written
    .map(([cat, id]) => `<figure><img src="${pathToFileURL(join(out, `${id}.svg`)).href}"><figcaption>${cat}<br><b>${id}</b></figcaption></figure>`)
    .join("");
  writeFileSync(
    process.argv[gi + 1],
    `<!doctype html><meta charset="utf-8"><style>body{margin:12px;font:11px system-ui;background:#fff7ed}main{display:grid;grid-template-columns:repeat(10,110px);gap:10px}figure{margin:0;text-align:center}img{width:110px;height:110px;border-radius:24px}figcaption{color:#7a6a5a}</style><main>${cells}</main>`,
  );
}
