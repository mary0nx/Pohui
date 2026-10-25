"""Imports brand logos from Wikimedia Commons that are marked public domain (usually logos too
simple for copyright, "PD-textlogo"; they stay trademarks of their owners).

    python3 -I scripts/import-commons-logos.py <dir with downloaded files> <hits.json>

hits.json: [{"brand": "<catalogue id>", "title": "File:…svg", "license": "Public domain", "url": …}]
Each SVG is parsed as XML and reduced to drawing elements only (no scripts, event handlers,
external links, embedded images or editor metadata), then placed in a white 64×64 circle like
the other logos. Afterwards run scripts/brand-logos.mjs so brandLogos.ts lists the new files.
"""

from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

SVG = "http://www.w3.org/2000/svg"
XLINK = "http://www.w3.org/1999/xlink"
ET.register_namespace("", SVG)
ET.register_namespace("xlink", XLINK)

DROP = {"script", "foreignObject", "image", "metadata", "title", "desc", "a", "audio", "video", "iframe", "animate", "set"}
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "brands"
NAME = re.compile(r"^[a-z0-9_]+$")


def local(tag: str) -> tuple[str, str]:
    if tag.startswith("{"):
        ns, _, name = tag[1:].partition("}")
        return ns, name
    return "", tag


def clean(el: ET.Element) -> None:
    for child in list(el):
        if not isinstance(child.tag, str):
            el.remove(child)  # comments, processing instructions
            continue
        ns, name = local(child.tag)
        if ns not in ("", SVG) or name in DROP:
            el.remove(child)
            continue
        if name == "style" and re.search(r"@import|url\(\s*['\"]?(?!#)", child.text or "", re.I):
            el.remove(child)
            continue
        clean(child)
    for attr in list(el.attrib):
        ns, name = local(attr)
        value = el.attrib[attr]
        if name.lower().startswith("on"):
            del el.attrib[attr]
        elif ns == XLINK or name == "href":
            if not value.startswith("#"):
                del el.attrib[attr]
        elif ns:
            del el.attrib[attr]  # inkscape:/sodipodi:/… editor data
        elif re.search(r"url\(\s*['\"]?(?!#)", value, re.I):
            del el.attrib[attr]


def view_box(root: ET.Element) -> str:
    vb = root.get("viewBox")
    if vb:
        return " ".join(vb.replace(",", " ").split())
    def num(v: str | None) -> float:
        return float(re.match(r"[\d.]+", v or "0").group(0)) if v and re.match(r"[\d.]+", v) else 0.0
    w, h = num(root.get("width")), num(root.get("height"))
    if not (w and h):
        raise ValueError("no viewBox or size")
    return f"0 0 {w:g} {h:g}"


def main() -> None:
    src, hits_path = Path(sys.argv[1]), Path(sys.argv[2])
    hits = json.loads(hits_path.read_text())
    rows = []
    for hit in hits:
        brand = hit["brand"]
        if not NAME.match(brand) or not str(hit.get("license", "")).lower().startswith(("public domain", "pd")):
            continue
        file = src / f"{brand}.svg"
        if not file.exists():
            print("missing download:", brand)
            continue
        root = ET.fromstring(file.read_bytes())
        if local(root.tag) != (SVG, "svg"):
            print("not an svg:", brand)
            continue
        vb = view_box(root)
        clean(root)
        inner = "".join(ET.tostring(child, encoding="unicode") for child in root)
        inner = re.sub(r'\sxmlns(:\w+)?="[^"]*"', "", inner)
        title = hit["title"].removeprefix("File:").removesuffix(".svg")
        # The logo's box is fitted into the circle by its diagonal (radius 28): square marks get
        # ≈40 px, wide wordmarks up to ≈55 px wide.
        _, _, vw, vh = (float(v) for v in vb.split())
        width = 56 / (1 + (vh / vw) ** 2) ** 0.5
        height = width * vh / vw
        svg = (
            f'<svg xmlns="{SVG}" xmlns:xlink="{XLINK}" viewBox="0 0 64 64"><title>{title}</title>'
            '<circle cx="32" cy="32" r="31.25" fill="#FFFFFF" stroke="#E7DED5" stroke-width="1.5"/>'
            f'<svg x="{32 - width / 2:.2f}" y="{32 - height / 2:.2f}" width="{width:.2f}" height="{height:.2f}" viewBox="{vb}" preserveAspectRatio="xMidYMid meet">{inner}</svg></svg>\n'
        )
        ET.fromstring(svg)  # must still be well-formed
        if re.search(r"<script|\son\w+=|href=\"(?!#)", svg, re.I):
            raise ValueError(f"unsafe content left in {brand}")
        (OUT / f"{brand}.svg").write_text(svg)
        rows.append(f"| {brand} | [{hit['title']}](https://commons.wikimedia.org/wiki/{hit['title'].replace(' ', '_')}) | {hit['license']} |")
    (OUT / "ATTRIBUTION-COMMONS.md").write_text(
        "# Brand logos from Wikimedia Commons\n\n"
        "Imported by `scripts/import-commons-logos.py`. Each file is marked public domain on Wikimedia Commons\n"
        "(a logo too simple for copyright) and remains a trademark of its owner; it is used only to label\n"
        "transactions made at that shop.\n\n| Brand id | Commons file | Licence |\n|---|---|---|\n" + "\n".join(rows) + "\n"
    )
    print(f"{len(rows)} logos imported")


if __name__ == "__main__":
    main()
