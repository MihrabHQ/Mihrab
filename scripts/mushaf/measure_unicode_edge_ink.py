#!/usr/bin/env python3
"""Measure how far the FIRST and LAST lines' ink reaches on each page of
the riwayat set from Unicode text — Warsh (and Qālūn, which shares its
line table) and Shuʿbah — in the face the app sets them in, Amiri Quran.

The Hafs pages have `measure_edge_ink.py`: their fonts carry the page's
glyphs and `mushafLayoutV2.json` says which are on which line, so the
reach is exact. The Unicode pages have neither. The text is not in the
repository (`riwayahStore.ts` says why), and the line table
(`mushafPrintedLines.ts`) is a statement about ayahs, not words: it says
which ayahs a line carries and how much of each.

So this shapes, with HarfBuzz and the bundled Amiri Quran, the WHOLE of
every ayah the edge line carries — a superset of the line's words — and
takes the furthest reach. The text shaped is the Hafs text the app ships
(`assets/quran/surahs`), standing in for the riwayah's own: the two differ
in orthography, in a handful of small marks, and not in the height of a
lām-alif or the depth of a final nūn; a hair is added for the difference.
Ayahs are numbered differently in Warsh and Qālūn (`madaniAyahMap.json`),
so each listed ayah is widened to its neighbours on both sides before
shaping. Every one of these choices only ever makes the reach larger,
which is the safe direction: the reader keeps at least this much room.

A page whose edge line is a surah band or basmalah (an empty line in the
table) gets null for that edge.

  { "warsh": { "571": [above, below], … }, "shubah": { … },
    "warsh@qpc": { … }, "qalun@qpc": { … }, "shubah@qpc": { … } }   ems

The `@qpc` tables are the same reach in each muṣḥaf's own KFGQPC face
(`src/quran/riwayahFonts.ts`), which the page is set in once that face is
on the device. Neither the faces nor the texts are in the repository, so
those tables are measured from local copies — the mirror's files — and
shaped from the riwayah's OWN text, ayah by ayah, so no window is needed:

    python3 scripts/mushaf/measure_unicode_edge_ink.py
    python3 scripts/mushaf/measure_unicode_edge_ink.py --pages 571,572 --out -
    python3 scripts/mushaf/measure_unicode_edge_ink.py --qpc <dir>
        (<dir> holds warsh.json, qalun.json, shubah.json from the
         data-riwayah-v1 release and the three faces it pins; the Amiri
         tables already in the output are kept)

Requires: uharfbuzz  (pip install uharfbuzz)
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys

FONT = "android/app/src/main/assets/fonts/AmiriQuran.ttf"
TEXT = "assets/quran/surahs"
TABLES = {
    "warsh": "src/quran/data/warshLines.json",
    "shubah": "src/quran/data/shubahLines.json",
}
OUT = "src/quran/data/unicodeEdgeInk.json"
# The riwayah's own marks (Warsh's small circles and dots, the ṣilah
# marks) sit on letters Amiri already carries marks on; a hair covers
# the difference between its marks and the Hafs text's.
HAIR_EM = 0.02
# Ayah numbering drifts between the riwayat by at most a few within a
# surah; widening by this many on each side covers it.
AYAH_WINDOW = 2
# The faces each muṣḥaf is set in once its own face is loaded, and the
# line table it reads (Qālūn reads Warsh's).
QPC = {
    "warsh": ("UthmanicWarsh_V21.ttf", "warsh"),
    "qalun": ("UthmanicQaloun_V21.ttf", "warsh"),
    "shubah": ("UthmanicShuba_V20.ttf", "shubah"),
}


def load_text() -> dict[int, list[str]]:
    out: dict[int, list[str]] = {}
    for path in sorted(glob.glob(os.path.join(TEXT, "*.json"))):
        with open(path, encoding="utf-8") as fh:
            d = json.load(fh)
        out[d["number"]] = d["arabic"]
    return out


def spans(line: list) -> list[tuple[int, int]]:
    """(surah, ayah) of every ayah on a printed line; a 3-tuple carries the surah."""
    out: list[tuple[int, int]] = []
    surah = 0
    for entry in line:
        if len(entry) == 3:
            surah, ayah, _ = entry
        else:
            ayah, _ = entry
        if surah:
            out.append((surah, ayah))
    return out


def own_text(path: str) -> dict[int, list[str]]:
    """A Quranpedia muṣḥaf record, as `load_text` returns the Hafs one."""
    with open(path, encoding="utf-8") as fh:
        d = json.load(fh)
    out: dict[int, list[str]] = {}
    for surah in d["surahs"]:
        ayahs = sorted(surah["ayahs"], key=lambda a: int(a["number"]))
        out[int(surah["id"])] = [a["text"] for a in ayahs]
    return out


def measure(hb, font_path: str, text: dict[int, list[str]], window: int, lines: dict, pages: list[str]) -> dict[str, list]:
    face = hb.Face(hb.Blob.from_file_path(font_path))
    font = hb.Font(face)
    upem = face.upem
    reach: dict[str, tuple[float, float]] = {}

    def ayah_reach(surah: int, ayah: int) -> tuple[float, float]:
        key = f"{surah}:{ayah}"
        if key in reach:
            return reach[key]
        ayahs = text.get(surah, [])
        above = 0.0
        below = 0.0
        for n in range(ayah - window, ayah + window + 1):
            if not 1 <= n <= len(ayahs):
                continue
            buf = hb.Buffer()
            buf.add_str(ayahs[n - 1])
            buf.guess_segment_properties()
            hb.shape(font, buf)
            for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
                ext = font.get_glyph_extents(info.codepoint)
                if ext is None:
                    continue
                top = (pos.y_offset + ext.y_bearing) / upem
                bottom = -(pos.y_offset + ext.y_bearing + ext.height) / upem
                above = max(above, top)
                below = max(below, bottom)
        reach[key] = (above, below)
        return reach[key]

    table: dict[str, list] = {}
    for page in pages:
        rows = lines[page]
        # The surah is stated once per page and carried forward; a
        # line's spans need the surah in force where the line starts.
        carried: list[list] = []
        surah = 0
        for row in rows:
            fixed = []
            for entry in row:
                if len(entry) == 3:
                    surah = entry[0]
                    fixed.append(entry)
                else:
                    fixed.append([surah, entry[0], entry[1]])
            carried.append(fixed)
        first = spans(carried[0]) if rows else []
        last = spans(carried[-1]) if rows else []
        above = (
            round(max(ayah_reach(s, a)[0] for s, a in first) + HAIR_EM, 4)
            if first
            else None
        )
        below = (
            round(max(ayah_reach(s, a)[1] for s, a in last) + HAIR_EM, 4)
            if last
            else None
        )
        table[page] = [above, below]
    return table


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", default="", help="comma-separated; default all")
    ap.add_argument("--out", default=OUT, help="- for stdout")
    ap.add_argument("--qpc", default="", help="folder with the mirror's texts and faces")
    args = ap.parse_args()

    import uharfbuzz as hb

    def pages_of(lines: dict) -> list[str]:
        return (
            [p for p in args.pages.split(",") if p]
            if args.pages
            else sorted(lines, key=int)
        )

    tables: dict[str, dict] = {}
    for riwayah, path in TABLES.items():
        with open(path, encoding="utf-8") as fh:
            tables[riwayah] = json.load(fh)["lines"]

    out: dict[str, dict[str, list]] = {}
    if args.qpc:
        # Keep the Amiri tables; add the faces' own.
        if args.out != "-" and os.path.exists(args.out):
            with open(args.out, encoding="utf-8") as fh:
                out = {k: v for k, v in json.load(fh).items() if "@" not in k}
        for riwayah, (font_name, table) in QPC.items():
            lines = tables[table]
            out[f"{riwayah}@qpc"] = measure(
                hb,
                os.path.join(args.qpc, font_name),
                own_text(os.path.join(args.qpc, f"{riwayah}.json")),
                0,
                lines,
                pages_of(lines),
            )
            print(f"  {riwayah}@qpc: {len(out[riwayah + '@qpc'])} pages", file=sys.stderr)
    else:
        text = load_text()
        for riwayah, lines in tables.items():
            out[riwayah] = measure(hb, FONT, text, AYAH_WINDOW, lines, pages_of(lines))
            print(f"  {riwayah}: {len(out[riwayah])} pages", file=sys.stderr)
        # Re-measuring the Amiri tables keeps the faces' tables as they are.
        if args.out != "-" and os.path.exists(args.out):
            with open(args.out, encoding="utf-8") as fh:
                out.update({k: v for k, v in json.load(fh).items() if "@" in k})

    body = json.dumps(out, separators=(",", ":"))
    if args.out == "-":
        print(body)
    else:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(body + "\n")
        print(f"wrote {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
