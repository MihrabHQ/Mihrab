#!/usr/bin/env python3
"""Measure how far each page's FIRST and LAST lines' ink reaches, per page.

`measure_ink_overshoot.py` gives the reader one worst case over all 604
fonts — a maddah stacked on an alif on page 556, a swash on page 519 —
and the reader reserves that much above the first line and below the
last of EVERY page, so that whatever clips the page clips outside the ink.
On a portrait page that reserve, plus the half-leading of the first and
last lines, was a band of nothing between the header and the text and
between the text and the page bar.

This script measures what each page's edge lines actually reach: the
tallest ink on the first line, in ems above the baseline, and the deepest
on the last, below it. With that the reader can put the first line's ink
at the top of its box and the last line's at the bottom, exactly, and
give the leading back to the lines (`fitLinesWithInk`, the tight mode).

A page whose first line is a surah band or a basmalah gets null for that
edge: those rows are drawn inside their own height, and the text starts
on the next line, which has a neighbour above it to overshoot into.

Two glyph sets, since they are two sets of fonts: the plain QPC v2 pages
(`QCF2{page}.ttf`, layout `mushafLayoutV2.json`) and the tajwīd v4 pages
(`p{page}.ttf`, layout `mushafLayoutV4.json`). The output has both:

  { "v2": [[above, below], …604], "tajweed": [[above, below], …604] }

    python3 scripts/mushaf/measure_edge_ink.py
    python3 scripts/mushaf/measure_edge_ink.py --pages 1,571 --out -

Requires: fonttools  (pip install fonttools)
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_qcf_assets import PAGES  # noqa: E402
from build_tajweed_assets import raw_font_path as tajweed_font_path  # noqa: E402
from measure_ink_overshoot import raw_font as v2_font  # noqa: E402

OUT = "src/quran/data/mushafEdgeInk.json"
LAYOUT_V2 = "src/quran/data/mushafLayoutV2.json"
LAYOUT_V4 = "src/quran/data/mushafLayoutV4.json"


def line_reach(line: dict, font) -> tuple[float, float] | None:
    """(above, below) of a text line's ink, in ems; None for a band or basmalah."""
    if line["t"] != "a":
        return None
    from fontTools.pens.boundsPen import BoundsPen

    upem = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    above = 0.0
    below = 0.0
    for ch in line["x"]:
        if ch in "| ":
            continue
        name = cmap.get(ord(ch))
        if name is None:
            continue
        pen = BoundsPen(glyphs)
        glyphs[name].draw(pen)
        if not pen.bounds:
            continue
        _, y0, _, y1 = pen.bounds
        above = max(above, y1 / upem)
        below = max(below, -y0 / upem)
    return (round(above, 4), round(below, 4))


def edges(page: dict, font) -> list:
    lines = page["l"]
    first = line_reach(lines[0], font)
    last = line_reach(lines[-1], font)
    return [first[0] if first else None, last[1] if last else None]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-v2", default="/tmp/qcf/raw")
    ap.add_argument("--raw-v4", default="/tmp/qcf/raw-v4")
    ap.add_argument("--pages", default="", help="comma-separated; default all")
    ap.add_argument("--out", default=OUT, help="- for stdout")
    args = ap.parse_args()

    from fontTools.ttLib import TTFont

    with open(LAYOUT_V2, encoding="utf-8") as fh:
        v2 = {p["p"]: p for p in json.load(fh)}
    with open(LAYOUT_V4, encoding="utf-8") as fh:
        v4 = {p["p"]: p for p in json.load(fh) if p}
    pages = (
        [int(x) for x in args.pages.split(",") if x]
        if args.pages
        else list(range(1, PAGES + 1))
    )
    out: dict[str, list] = {"v2": [None] * PAGES, "tajweed": [None] * PAGES}
    for i, page in enumerate(pages, 1):
        out["v2"][page - 1] = edges(v2[page], v2_font(page, args.raw_v2))
        layout = v4.get(page, v2[page])
        out["tajweed"][page - 1] = edges(
            layout, TTFont(tajweed_font_path(page, args.raw_v4))
        )
        if i % 50 == 0 or i == len(pages):
            print(f"  {i}/{len(pages)}", file=sys.stderr)

    text = json.dumps(out, separators=(",", ":"))
    if args.out == "-":
        print(text)
    else:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
        print(f"wrote {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
