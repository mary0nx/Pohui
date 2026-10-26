"""Brand badges from the brand's colours and its name set in Inter (SIL Open Font License),
for shops whose official logo file is not available under a free licence.

    PYTHONPATH=<fonttools> python3 scripts/wordmark-logo.py scripts/wordmarks.json <font.otf>

wordmarks.json: [{"id": "<catalogue id>", "text": "Name" (\\n = second line), "bg": "#RRGGBB",
"ink": "#RRGGBB"}]. Writes public/assets/brands/<id>.svg (64×64 circle, the words as outlines,
so no font is needed on the device) and ATTRIBUTION-WORDMARKS.md. Brands that already have an
official logo file (Simple Icons, Wikimedia Commons) are left alone. Afterwards run
`node scripts/brand-logos.mjs --list-only` so the app knows the files exist.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "brands"
COLOR = re.compile(r"^#[0-9A-Fa-f]{6}$")
ID = re.compile(r"^[a-z0-9_]+$")
LINE_GAP = 1.18  # line height in em for two-line names


def luminance(hex_color: str) -> float:
    def channel(c: int) -> float:
        v = c / 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

    r, g, b = (int(hex_color[i : i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def badge(font: TTFont, text: str, bg: str, ink: str) -> str:
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    lines = text.split("\n")[:2]
    placed: list[tuple[str, float, float]] = []
    widths = []
    for row, line in enumerate(lines):
        x = 0.0
        row_glyphs = []
        for ch in line:
            name = cmap[ord(ch)]
            row_glyphs.append((name, x))
            x += glyphs[name].width
        widths.append(x)
        dy = -row * LINE_GAP * upm
        placed += [(name, gx, dy) for name, gx in row_glyphs]
    # Centre each line horizontally within the widest one.
    widest = max(widths)
    shifted = []
    for name, gx, dy in placed:
        row = round(-dy / (LINE_GAP * upm))
        shifted.append((name, gx + (widest - widths[row]) / 2, dy))
    bounds = BoundsPen(glyphs)
    for name, dx, dy in shifted:
        glyphs[name].draw(TransformPen(bounds, (1, 0, 0, 1, dx, dy)))
    x0, y0, x1, y1 = bounds.bounds
    w, h = x1 - x0, y1 - y0
    k = min((48 if len(lines) > 1 else 52) / w, (34 if len(lines) > 1 else 28) / h)
    tx = 32 - (x0 + w / 2) * k
    ty = 32 + (y0 + h / 2) * k  # font y grows upwards
    pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.1f}")
    for name, dx, dy in shifted:
        glyphs[name].draw(TransformPen(pen, (1, 0, 0, 1, dx, dy)))
    ring = ' stroke="#E7DED5" stroke-width="1.5"' if luminance(bg) > 0.8 else ""
    radius = "31.25" if ring else "32"
    title = text.replace("\n", " ").replace("&", "&amp;").replace("<", "&lt;")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>{title}</title>'
        f'<circle cx="32" cy="32" r="{radius}" fill="{bg}"{ring}/>'
        f'<path transform="translate({tx:.2f} {ty:.2f}) scale({k:.5f} {-k:.5f})" fill="{ink}" d="{pen.getCommands()}"/></svg>\n'
    )


def main() -> None:
    spec_path, font_path = sys.argv[1:3]
    spec = json.loads(Path(spec_path).read_text())
    font = TTFont(font_path)
    official = set()
    for name in ("ATTRIBUTION.md", "ATTRIBUTION-COMMONS.md"):
        f = OUT / name
        if f.exists():
            official |= set(re.findall(r"^\| ([a-z0-9_]+) \|", f.read_text(), re.M))
    rows = []
    for entry in spec:
        brand, text, bg, ink = entry["id"], entry["text"], entry["bg"], entry["ink"]
        if not ID.match(brand) or not COLOR.match(bg) or not COLOR.match(ink) or not text.strip():
            raise SystemExit(f"bad entry: {entry}")
        if brand in official or (OUT / f"{brand}.webp").exists():
            print("logo kept:", brand)
            continue
        (OUT / f"{brand}.svg").write_text(badge(font, text, bg, ink))
        rows.append(f"| {brand} | {text.replace(chr(10), ' ')} | {bg} | {ink} |")
    (OUT / "ATTRIBUTION-WORDMARKS.md").write_text(
        "# Brand badges (name in brand colours)\n\n"
        "Made by `scripts/wordmark-logo.py` from `scripts/wordmarks.json` where no freely licensed\n"
        "official logo file is available: the brand name set in Inter (SIL Open Font License 1.1)\n"
        "on the brand colour. The names are trademarks of their owners and are used only to label\n"
        "transactions made at these shops. Colours are the brands' recognisable main colours;\n"
        "correct one in wordmarks.json and run the script again.\n\n"
        "| Brand id | Text | Background | Ink |\n|---|---|---|---|\n" + "\n".join(rows) + "\n"
    )
    print(f"{len(rows)} badges written")


if __name__ == "__main__":
    main()
