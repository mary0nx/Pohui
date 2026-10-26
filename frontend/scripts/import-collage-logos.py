"""Logos cut out of the family's logo collage (a picture of shop logos in circles, 1536×1024).

    python3 scripts/import-collage-logos.py <collage.png>

scripts/collage-logos.txt lists each logo's centre and radius. A logo is imported when the brand
has no official vector logo yet (Simple Icons / Wikimedia Commons files listed in
ATTRIBUTION*.md stay, they are sharper) — i.e. it replaces a name badge or is a new brand.
Each logo is cut as a circle with a transparent outside, enlarged 2× and saved as
public/assets/brands/<id>.webp; a name badge of the same brand is removed. Afterwards update
brandLogos.ts: node scripts/brand-logos.mjs --list-only.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "brands"
SPEC = Path(__file__).with_name("collage-logos.txt")
SCALE = 2
SUPER = 4  # supersampling for a smooth circle edge


def official_ids() -> set[str]:
    ids: set[str] = set()
    for name in ("ATTRIBUTION.md", "ATTRIBUTION-COMMONS.md"):
        f = OUT / name
        if f.exists():
            ids |= set(re.findall(r"^\| ([a-z0-9_]+) \|", f.read_text(), re.M))
    return ids


def main() -> None:
    src = Image.open(sys.argv[1]).convert("RGBA")
    keep = official_ids()
    rows = []
    for line in SPEC.read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        brand, x, y, r, label = line.split(maxsplit=4)
        if not re.match(r"^[a-z0-9_]+$", brand):
            raise SystemExit(f"bad id {brand}")
        if brand in keep:
            continue
        x, y, r = int(x), int(y), int(r)
        size = 2 * r * SCALE
        logo = src.crop((x - r, y - r, x + r, y + r)).resize((size, size), Image.LANCZOS)
        mask = Image.new("L", (size * SUPER, size * SUPER), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size * SUPER - 1, size * SUPER - 1), fill=255)
        logo.putalpha(mask.resize((size, size), Image.LANCZOS))
        logo.save(OUT / f"{brand}.webp", "WEBP", quality=88, method=6)
        (OUT / f"{brand}.svg").unlink(missing_ok=True)  # the name badge it replaces
        rows.append(f"| {brand} | {label} |")
    (OUT / "ATTRIBUTION-COLLAGE.md").write_text(
        "# Logos from the family's logo collage\n\n"
        "Cut out by `scripts/import-collage-logos.py` from the logo collage the family provided,\n"
        "for brands without a freely licensed vector logo. The logos are trademarks of their owners\n"
        "and are used only to label transactions made at these shops.\n\n"
        "| Brand id | Label |\n|---|---|\n" + "\n".join(rows) + "\n"
    )
    print(f"{len(rows)} logos imported")


if __name__ == "__main__":
    main()
