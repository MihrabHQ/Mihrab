#!/usr/bin/env python3
"""Build the line layout of the tajwīd muṣḥaf — `mushafLayoutV4.json`.

── WHY THE TAJWĪD PAGES NEED THEIR OWN LINES ──────────────────────────

The QPC V4 tajweed fonts are cut from the 1441H Madinah print, and the
V2 fonts from the earlier one. The two prints keep the same words on the
same 604 pages, and a word has the same code in both fonts — but they do
NOT break every page into the same fifteen lines. Page 76 is one: the
1441H print carries the last words of Āl ʿImrān on its fifteenth line and
opens An-Nisāʾ on page 77, where the older print put the surah plate on
page 76. Every V4 glyph is justified for the line it sits on in ITS
print, so laid on V2's lines the words come out stretched or cramped,
the widest line sets a tiny font size for the page, and a surah-closing
line is left centred in a space it was never cut for.

So the tajwīd reader lays its pages out on the 1441H print's lines. This
script fetches them from QUL's preview of its "KFGQPC V4 layout (1441H
print)" (mushaf layout 19), one page at a time, and writes them in the
shape `mushafLayoutV2.json` already has — the reader decodes either the
same way. Each word's advance is V4's, taken from
`mushafLayoutV4Advances.json` (built by `build_tajweed_assets.py` from
the fonts themselves): the words of a page come in the same reading
order in both prints, so V2's lines flattened give every word its V4
advance, and the 1441H lines regroup them.

    python3 scripts/mushaf/build_v4_layout.py            # all pages
    python3 scripts/mushaf/build_v4_layout.py --pages 76,77

The plain muṣḥaf (`mushafLayoutV2.json`) is not touched.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_qcf_assets import PAGES, _get  # noqa: E402

LAYOUT_V2 = "src/quran/data/mushafLayoutV2.json"
ADVANCES_V4 = "src/quran/data/mushafLayoutV4Advances.json"
LAYOUT_V4 = "src/quran/data/mushafLayoutV4.json"
QUL = "https://qul.tarteel.ai/mushaf_layouts/19?page_number={page}"

LINE_RE = re.compile(r'<div class="line-container" data-line="(\d+)">(.*?)(?=<div class="line-container"|<footer|$)', re.S)
WORD_RE = re.compile(r'data-location="(\d+):(\d+):(\d+)"[^>]*>\s*<a[^>]*>(.*?)</a>', re.S)
SURAH_RE = re.compile(r"surah(\d{3})")


def fetch_page(page: int, cache_dir: str) -> str:
    path = os.path.join(cache_dir, f"qul-v4-{page}.html")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    os.makedirs(cache_dir, exist_ok=True)
    text = _get(QUL.format(page=page)).decode("utf-8", "replace")
    if 'class="line-container"' not in text:
        raise RuntimeError(f"page {page}: QUL preview has no lines")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    time.sleep(0.2)
    return text


def parse_lines(text: str) -> list[dict]:
    """The page's lines as QUL shows them: kind, words (by location), flags."""
    lines = []
    for number, body in LINE_RE.findall(text):
        head = body[: body.find(">") + 1]
        if "line--surah-name" in head:
            m = SURAH_RE.search(body)
            if not m:
                raise RuntimeError(f"line {number}: surah plate without a number")
            lines.append({"n": int(number), "t": "s", "s": int(m.group(1))})
            continue
        if "line--bismillah" in head:
            lines.append({"n": int(number), "t": "b"})
            continue
        words = [
            ((int(s), int(a), int(p)), html.unescape(code).strip())
            for s, a, p, code in WORD_RE.findall(body)
        ]
        if not words:
            # Pages 1–2 are plates of eight lines; QUL pads them to fifteen.
            if "data-location" in body:
                raise RuntimeError(f"line {number}: words that do not parse")
            continue
        lines.append({"n": int(number), "t": "a", "c": "line--center" in head, "words": words})
    return lines


def v2_words(entry: dict, advances: list | None) -> list[dict]:
    """Every word of the V2 page in reading order: its glyphs, its V4
    advance, its place in its āyah, whether it is the āyah marker."""
    out: list[dict] = []
    for i, line in enumerate(entry["l"]):
        if line["t"] != "a":
            continue
        tokens = line["x"].split("|")
        adv = (advances[i][1] if advances and advances[i] else line["a"])
        k = 0
        for seg in line["w"]:
            surah, ayah, first, count = seg[:4]
            is_end = len(seg) > 4 and seg[4] == 1
            for j in range(count):
                out.append({
                    "x": tokens[k],
                    "a": adv[k],
                    "loc": (surah, ayah, first + j),
                    "end": is_end and j == count - 1,
                })
                k += 1
    return out


def build_page(entry: dict, advances: list | None, text: str, last_ayah: dict[int, int]) -> dict:
    """V2's words, V2's word grouping, V4's advances — on the 1441H lines.

    QUL and the V2 data agree on every glyph of a page but not always on
    where one word ends and the next begins (2:181 on page 27 is one word
    of two glyphs to V2 and two words to QUL). The word positions are what
    the rules, the timings and the taps are keyed by, so V2's grouping is
    kept; QUL decides only which LINE a glyph is on, and a word goes on
    the line of its first glyph."""
    page = entry["p"]
    glyph_line: dict[str, int] = {}
    kinds: dict[int, dict] = {}
    for line in parse_lines(text):
        kinds[line["n"]] = line
        if line["t"] != "a":
            continue
        for _loc, code in line["words"]:
            for ch in code:
                if ch == " ":
                    continue
                if ch in glyph_line:
                    raise RuntimeError(f"page {page}: glyph {hex(ord(ch))} on two lines")
                glyph_line[ch] = line["n"]
    words = v2_words(entry, advances)
    by_line: dict[int, list[dict]] = {}
    for word in words:
        glyphs = [ch for ch in word["x"] if ch != " "]
        lines = {glyph_line.get(ch) for ch in glyphs}
        if None in lines:
            raise RuntimeError(f"page {page}: {word['loc']} has a glyph QUL does not show")
        if len(lines) != 1:
            raise RuntimeError(f"page {page}: {word['loc']} is split across lines in V4")
        by_line.setdefault(lines.pop(), []).append(word)
    placed = sum(len(v) for v in by_line.values())
    if placed != len(words) or len(glyph_line) != sum(len([c for c in w["x"] if c != " "]) for w in words):
        raise RuntimeError(f"page {page}: QUL and V2 disagree on the page's glyphs")

    lines = []
    for number in sorted(kinds):
        kind = kinds[number]
        if kind["t"] == "s":
            lines.append({"t": "s", "s": kind["s"]})
            continue
        if kind["t"] == "b":
            lines.append({"t": "b", "s": 0})  # filled in below
            continue
        line_words = by_line.get(number, [])
        if not line_words:
            raise RuntimeError(f"page {page}: line {number} has no V2 words")
        segs: list = []
        for word in line_words:
            surah, ayah, pos = word["loc"]
            if segs and segs[-1][0] == surah and segs[-1][1] == ayah and segs[-1][2] + segs[-1][3] == pos:
                segs[-1][3] += 1
            else:
                segs.append([surah, ayah, pos, 1])
            if word["end"]:
                segs[-1].append(1)
        out = {
            "t": "a",
            "x": "|".join(w["x"] for w in line_words),
            "w": segs,
            "n": round(sum(w["a"] for w in line_words), 4),
            "a": [w["a"] for w in line_words],
        }
        # Centred exactly as V2 decides it (`apply_centering` in
        # build_qcf_assets.py): the line ends on a surah's last āyah. QUL's
        # own centring class marks only some of these.
        tail = segs[-1]
        if len(tail) > 4 and tail[1] == last_ayah.get(tail[0], -1):
            out["c"] = 1
        lines.append(out)
    # A basmalah belongs to the surah whose first words follow it.
    for i, line in enumerate(lines):
        if line["t"] != "b":
            continue
        for later in lines[i + 1 :]:
            if later["t"] == "a":
                line["s"] = later["w"][0][0]
                break
            if later["t"] == "s":
                line["s"] = later["s"]
                break
    measure = max(l["n"] for l in lines if l["t"] == "a")
    return {"p": page, "m": round(measure, 4), "l": lines}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", default="")
    ap.add_argument("--cache", default="/tmp/qcf4/qul")
    ap.add_argument("--out", default=LAYOUT_V4)
    args = ap.parse_args()
    with open(LAYOUT_V2, encoding="utf-8") as fh:
        v2 = {p["p"]: p for p in json.load(fh)}
    with open(ADVANCES_V4, encoding="utf-8") as fh:
        adv = json.load(fh)
    pages = [int(x) for x in args.pages.split(",") if x] or list(range(1, PAGES + 1))
    # Each surah's last āyah, from the markers V2 carries.
    last_ayah: dict[int, int] = {}
    for entry in v2.values():
        for line in entry["l"]:
            for seg in line.get("w") or []:
                if len(seg) > 4:
                    last_ayah[seg[0]] = max(last_ayah.get(seg[0], 0), seg[1])
    existing: list = [None] * PAGES
    if os.path.exists(args.out):
        with open(args.out, encoding="utf-8") as fh:
            got = json.load(fh)
        existing = (list(got) + [None] * PAGES)[:PAGES]
    with ThreadPoolExecutor(max_workers=4) as pool:
        texts = list(pool.map(lambda p: fetch_page(p, args.cache), pages))
    changed = 0
    for page, text in zip(pages, texts):
        built = build_page(v2[page], adv[page - 1], text, last_ayah)
        v2_lines = [l["t"] + (str(len(l["x"].split("|"))) if l["t"] == "a" else "") for l in v2[page]["l"]]
        v4_lines = [l["t"] + (str(len(l["x"].split("|"))) if l["t"] == "a" else "") for l in built["l"]]
        if v2_lines != v4_lines:
            changed += 1
        existing[page - 1] = built
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(existing, fh, separators=(",", ":"), ensure_ascii=False)
        fh.write("\n")
    print(f"wrote {args.out}: {len(pages)} pages, {changed} laid out differently from V2", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
