#!/usr/bin/env python3
"""Measure the ink of each surah band's name ("سورة …") in Amiri Quran.

The band draws the name in Amiri Quran, whose vertical metrics are tall
on purpose (ascent 1.815 em, descent 0.634 em — room for stacked marks).
Both platforms centre the font's METRIC box in a line, and that box's
centre is 0.59 em above the baseline, while a surah name's ink sits much
lower: for "سورة نوح", from 0.534 em below the baseline to 0.609 above,
a centre of 0.04 em. Centred by its metrics, the name sat more than half
an em below the middle of the band, and the descenders ran into the art.

This shapes each name with HarfBuzz and writes the ink's bottom and top,
in ems from the baseline, so `SurahBandRow` can centre the ink instead.

  src/quran/data/surahNameInk.json   [[bottom, top], …114]

    python3 scripts/mushaf/measure_surah_name_ink.py

Requires: uharfbuzz  (pip install uharfbuzz)
"""
from __future__ import annotations

import json
import re
import sys

FONT = "android/app/src/main/assets/fonts/AmiriQuran.ttf"
SURAHS = "src/quran/quran.ts"
OUT = "src/quran/data/surahNameInk.json"
# Must match SURAH_WORD in src/quran/mushafOrnaments.tsx.
SURAH_WORD = "سورة "


def main() -> int:
    import uharfbuzz as hb

    with open(SURAHS, encoding="utf-8") as fh:
        names = re.findall(
            r"\{ number: (\d+), romanized: '[^']*', arabic: '([^']*)'", fh.read()
        )
    if len(names) != 114:
        print(f"expected 114 surahs, found {len(names)}", file=sys.stderr)
        return 1
    face = hb.Face(hb.Blob.from_file_path(FONT))
    font = hb.Font(face)
    upem = face.upem
    out = []
    for _, arabic in names:
        buf = hb.Buffer()
        buf.add_str(SURAH_WORD + arabic)
        buf.guess_segment_properties()
        hb.shape(font, buf)
        top, bottom = 0.0, 0.0
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            ext = font.get_glyph_extents(info.codepoint)
            if ext is None:
                continue
            t = (pos.y_offset + ext.y_bearing) / upem
            b = (pos.y_offset + ext.y_bearing + ext.height) / upem
            top = max(top, t)
            bottom = min(bottom, b)
        out.append([round(bottom, 3), round(top, 3)])
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(out, separators=(",", ":")) + "\n")
    tallest = max(t - b for b, t in out)
    print(f"wrote {OUT}; tallest name {tallest:.3f} em", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
