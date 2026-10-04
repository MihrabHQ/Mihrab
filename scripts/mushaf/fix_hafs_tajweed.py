#!/usr/bin/env python3
"""
Corrections to quran.com's Ḥafṣ tajwīd markup, applied to the per-surah rule
files after `build_tajweed_assets.py rules` writes them.

    python3 scripts/mushaf/fix_hafs_tajweed.py          # fix in place
    python3 scripts/mushaf/fix_hafs_tajweed.py --check  # report only
    python3 scripts/mushaf/fix_hafs_tajweed.py --fonts DIR  # also tafkhīm
        from the app's light page fonts (QCF4T{page}L.ttf) in DIR

── WHY THE MARKUP NEEDS FIXING ──────────────────────────────────────────

`assets/quran/tajweed/{NNN}.json` is quran.com's `text_uthmani_tajweed`,
word for word. The muṣḥaf page never reads it — its colours are the King
Fahd Complex's, drawn by the V4 fonts — but the āyah sheet does: it tints
the āyah from these spans when the page's colours are off, and lists the
rules each āyah carries. Run over the whole text against what the
Uthmani orthography itself writes, the markup has three kinds of gap:

  • A letter that carries the maddah (U+0653) with no madd colour at all —
    مُوسَىٰٓ إِذۡ, إِسۡرٰٓءِيلَ, تَعۡتَدُوٓاۡ إِنَّ, ءَآلذَّكَرَيۡنِ, بِهِۦٓ إِنَّ. The
    maddah is the text saying "lengthen this"; which madd it is follows
    from what comes after it, and that is decided here the way the markup
    decides it everywhere else.
  • A nūn sākinah inside a word before a letter of ikhfāʾ, left plain when
    the word also ends in a tanwīn that carries a rule — كَنزٌ, ضَنكٗا,
    جُندٌ, إِنسٌ.
  • مَنۡۜ رَاقٖ (75:27) coloured as an idghām. The saktah between them is
    exactly what stops the nūn merging into the rāʾ; Ḥafṣ reads the nūn
    clearly there.

Each correction only adds where nothing of its kind is present, or removes
the one span it names, so running this twice changes nothing.
"""
from __future__ import annotations

import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
RULES_DIR = os.path.join(ROOT, "assets", "quran", "tajweed")

SUKUN = "ۡ"
SHADDA = "ّ"
MADDAH = "ٓ"
SAKT = "ۜ"
HAMZA_ABOVE = "ٔ"
HAMZA_BELOW = "ٕ"
SILENT = ("۟", "۠")
DAGGER = "ٰ"
SMALL_WAW = "ۥ"
SMALL_YEH = "ۦ"
# The pause signs a reader may stop at (ۖ ۗ ۚ ۛ) and the obligatory one (ۘ).
# Not ۙ, which says do not stop there.
PAUSES = ("ۖ", "ۗ", "ۘ", "ۚ", "ۛ")
QALQALAH = set("قطبجد")
FATHA, DAMMA, KASRA = "َ", "ُ", "ِ"
VOWELS = ("َ", "ُ", "ِ", "ً", "ٌ", "ٍ", "ࣰ", "ࣱ", "ࣲ")
HAMZAS = set("ءأإؤئ")
IKHFA = set("تثجدذزسشصضطظفقك")
MADD_RULES = {
    "madda_normal", "madda_permissible", "madda_necessary",
    "madda_obligatory_mottasel", "madda_obligatory_monfasel",
}
NUN_RULES = {"ikhafa", "idgham_ghunnah", "idgham_wo_ghunnah", "iqlab"}
MARKS = (
    {chr(c) for c in range(0x064B, 0x0660)}
    | {"ٰ"}
    | {chr(c) for c in range(0x06D6, 0x06EE)}
    | {chr(c) for c in range(0x08D3, 0x0900)}
    | {"ـ", "‌"}
)


def letters(text: str) -> list[tuple[str, str, int, int]]:
    """(base, marks, start, end) for each letter of a word."""
    out = []
    i = 0
    while i < len(text):
        j = i + 1
        while j < len(text) and text[j] in MARKS:
            j += 1
        if text[i] not in MARKS:
            out.append((text[i], text[i + 1:j], i, j))
        i = j
    return out


def is_hamza(base: str, marks: str) -> bool:
    return base in HAMZAS or HAMZA_ABOVE in marks or HAMZA_BELOW in marks


def madd_kind(Ls, k, next_word) -> str | None:
    """Which madd the maddah on letter k writes, or None when it cannot be told."""
    j = k + 1
    # قَالُوٓاْ — the alif after the wāw is written and silent.
    while j < len(Ls) and Ls[j][0] == "ا" and not any(v in Ls[j][1] for v in VOWELS):
        j += 1
    if j < len(Ls):
        base, marks = Ls[j][0], Ls[j][1]
        if is_hamza(base, marks):
            return "madda_obligatory_mottasel"
        if SHADDA in marks or SUKUN in marks or not any(v in marks for v in VOWELS):
            return "madda_necessary"  # ءَآلذَّكَرَيۡنِ, ءَآللَّهُ
        return None
    if next_word:
        first = letters(next_word)
        if first and is_hamza(first[0][0], first[0][1]):
            return "madda_obligatory_monfasel"
    return None


def fix_ayah(words: list, rules: list[str]) -> list[str]:
    """Correct one āyah's words in place; returns what was done."""
    done = []

    def idx(rule: str) -> int:
        if rule not in rules:
            rules.append(rule)
        return rules.index(rule)

    def spans(w):
        return w[1] if len(w) > 1 else []

    for wi, w in enumerate(words):
        text = w[0]
        Ls = letters(text)
        next_text = words[wi + 1][0] if wi + 1 < len(words) else None
        here = spans(w)

        def rules_over(a, b):
            return {rules[r] for r, s, e in here if s < b and e > a}

        add = []
        for k, (base, marks, a, b) in enumerate(Ls):
            # ── The maddah with no madd ───────────────────────────────
            if MADDAH in marks and not (rules_over(a, b) & MADD_RULES):
                kind = madd_kind(Ls, k, next_text)
                if kind:
                    add.append([idx(kind), a, b])
                    done.append(f"{kind}: {text}")
            # ── The small alif written on a letter: a natural madd ────
            # ٱلصِّرٰطَ, ذٰلِكَ, ٱلصَّوٰعِقِ — the markup colours ـٰ (on a
            # kashīda) but not the same alif written straight on the letter.
            if (
                DAGGER in marks
                and base not in ("\u0640", "ى")  # عَلَىٰ: the print leaves ىٰ plain
                and MADDAH not in marks
                and not (rules_over(a, b) & MADD_RULES)
                and not (k + 1 < len(Ls) and is_hamza(*Ls[k + 1][:2]))
            ):
                add.append([idx("madda_normal"), a, b])
                done.append(f"madda_normal: {text}")
            # ── A nūn sākinah inside the word before ikhfāʾ ───────────
            if (
                base == "ن"
                and k + 1 < len(Ls)
                and not any(v in marks for v in VOWELS)
                and SUKUN not in marks
                and SHADDA not in marks
                and not any(z in marks for z in SILENT)
                and Ls[k + 1][0] in IKHFA
                and not (rules_over(a, b) & NUN_RULES)
            ):
                add.append([idx("ikhafa"), a, Ls[k + 1][2] + 1])
                done.append(f"ikhafa: {text}")
            # ── A saktah stops the idghām ─────────────────────────────
            if SAKT in marks and SUKUN in marks:
                drop = [s for s in here if rules[s[0]] in NUN_RULES and s[1] < b and s[2] > a]
                for s in drop:
                    here.remove(s)
                    done.append(f"sakt, no {rules[s[0]]}: {text}")
                    nxt = words[wi + 1] if wi + 1 < len(words) else None
                    if nxt is not None:
                        for t in [t for t in spans(nxt) if t[0] == s[0] and t[1] == 0]:
                            nxt[1].remove(t)
                        if len(nxt) > 1 and not nxt[1]:
                            del nxt[1]
        # ── A stop at a pause sign ────────────────────────────────────
        # The markup treats only the āyah's end as a stop; the print treats
        # every pause sign as one too, and so does a reader who stops there:
        # the madd before the last letter becomes ʿāriḍ (فِيهِ ۛ, ٱلۡمَوۡتِ ۚ,
        # ٱلنَّارِ ۖ) and a last qalqalah letter bounces (ٱلۡحَقِّ ۗ).
        # ۛ comes in pairs and the reader stops at one of them; the print
        # marks the stop at the second (لَا رَيۡبَۛ فِيهِۛ — at فِيهِ).
        muanaqah_first = "\u06db" in text and not any("\u06db" in words[j][0] for j in range(wi))
        if any(p in text for p in PAUSES) and len(Ls) >= 2 and not muanaqah_first:
            last = Ls[-1]
            stop_madd = None
            P = Ls[-2]
            pb, pm = P[0], P[1]
            before = Ls[-3] if len(Ls) >= 3 else None
            bv = before[1] if before else ""
            silent_end = last[0] == "ا" and not any(v in last[1] for v in VOWELS)
            if not silent_end and MADDAH not in pm:
                if DAGGER in pm or SMALL_WAW in pm or SMALL_YEH in pm:
                    stop_madd = P
                elif pb == "ا" and FATHA in bv:
                    stop_madd = P
                elif pb in "ويى" and not any(v in pm for v in (FATHA, DAMMA, KASRA)) and SHADDA not in pm and (
                    FATHA in bv or (pb == "و" and DAMMA in bv) or (pb in "يى" and KASRA in bv)
                ):
                    stop_madd = P  # a madd letter, or a līn after a fatḥa
            if stop_madd is not None:
                a, b = stop_madd[2], stop_madd[3]
                over = [t for t in here + add if t[1] < b and t[2] > a and rules[t[0]] in MADD_RULES]
                if not over:
                    add.append([idx("madda_permissible"), a, b])
                    done.append(f"stop madd: {text}")
                else:
                    for t in over:
                        if rules[t[0]] == "madda_normal":
                            t[0] = idx("madda_permissible")
                            done.append(f"stop madd: {text}")
            if last[0] in QALQALAH and not (rules_over(last[2], last[3]) & {"qalaqah"}):
                add.append([idx("qalaqah"), last[2], last[3]])
                done.append(f"stop qalqalah: {text}")
        if add:
            merged = sorted(here + add, key=lambda s: (s[1], s[2], s[0]))
            if len(w) > 1:
                w[1] = merged
            else:
                w.append(merged)
        elif len(w) > 1 and not w[1]:
            del w[1]
    return done


def fix_file(path: str) -> list[str]:
    with open(path, encoding="utf-8") as fh:
        doc = json.load(fh)
    done = []
    for ai, words in enumerate(doc["ayahs"], 1):
        for note in fix_ayah(words, doc["rules"]):
            done.append(f"{os.path.basename(path)[:3].lstrip('0')}:{ai} {note}")
    return done, doc


TAFKHEEM_ENTRY = 7  # the V4 fonts' palette entry for tafkhīm (build_tajweed_assets.py)


def sync_tafkheem(fonts_dir: str, check: bool) -> int:
    """Give tafkhīm to every word whose glyph the page font paints in the
    tafkhīm ink. The build reads this off the raw fonts, and words on pages
    whose raw font was missing then came out without it; Mihrab's own light
    fonts (`QCF4T{page}L.ttf`) keep the entry, so they settle it here."""
    from fontTools.ttLib import TTFont

    with open(os.path.join(ROOT, "src", "quran", "data", "mushafLayoutV2.json"), encoding="utf-8") as fh:
        layout = json.load(fh)
    docs: dict[int, dict] = {}
    added = 0
    for page in layout:
        path = os.path.join(fonts_dir, f"QCF4T{page['p']:03d}L.ttf")
        if not os.path.exists(path):
            continue
        font = TTFont(path)
        cmap = font.getBestCmap()
        layers = font["COLR"].ColorLayers
        for line in page["l"]:
            if line["t"] != "a":
                continue
            tokens = [t for t in line["x"].split("|") if t]
            i = 0
            for seg in line["w"]:
                surah, ayah, first, count = seg[0], seg[1], seg[2], seg[3]
                for k in range(count):
                    if i >= len(tokens):
                        break
                    token = tokens[i]
                    i += 1
                    heavy = any(
                        l.colorID == TAFKHEEM_ENTRY
                        for ch in token
                        for l in layers.get(cmap.get(ord(ch)) or "", [])
                    )
                    if not heavy:
                        continue
                    if surah not in docs:
                        with open(os.path.join(RULES_DIR, f"{surah:03d}.json"), encoding="utf-8") as fh:
                            docs[surah] = json.load(fh)
                    doc = docs[surah]
                    words = doc["ayahs"][ayah - 1]
                    if first + k - 1 >= len(words):
                        continue  # the āyah's medallion
                    w = words[first + k - 1]
                    if "tafkheem" not in doc["rules"]:
                        doc["rules"].append("tafkheem")
                    t = doc["rules"].index("tafkheem")
                    if any(r == t for r, _, _ in (w[1] if len(w) > 1 else [])):
                        continue
                    if len(w) == 1:
                        w.append([])
                    w[1].append([t, 0, len(w[0])])
                    w[1].sort(key=lambda x: (x[1], x[2], x[0]))
                    added += 1
    if not check:
        for surah, doc in docs.items():
            with open(os.path.join(RULES_DIR, f"{surah:03d}.json"), "w", encoding="utf-8") as fh:
                json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"tafkheem from the page fonts: {'would add' if check else 'added'} {added}")
    return added


def main() -> int:
    check = "--check" in sys.argv
    if "--fonts" in sys.argv:
        sync_tafkheem(sys.argv[sys.argv.index("--fonts") + 1], check)
    total = []
    for path in sorted(glob.glob(os.path.join(RULES_DIR, "[0-9][0-9][0-9].json"))):
        done, doc = fix_file(path)
        total += done
        if done and not check:
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"))
    kinds: dict[str, int] = {}
    for t in total:
        key = t.split(" ", 1)[1].split(":")[0]
        kinds[key] = kinds.get(key, 0) + 1
    print(f"{'would fix' if check else 'fixed'} {len(total)}: {kinds}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
