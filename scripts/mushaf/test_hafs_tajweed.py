#!/usr/bin/env python3
"""
The cases `fix_hafs_tajweed.py` exists for, checked against the shipped
rule files.

    python3 scripts/mushaf/test_hafs_tajweed.py
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))


def rules_on(surah: int, ayah: int, word: int, letter: str, nth: int = 1) -> set[str]:
    with open(os.path.join(ROOT, "assets", "quran", "tajweed", f"{surah:03d}.json"), encoding="utf-8") as fh:
        doc = json.load(fh)
    w = doc["ayahs"][ayah - 1][word - 1]
    pos = -1
    for _ in range(nth):
        pos = w[0].index(letter, pos + 1)
    return {doc["rules"][r] for r, s, e in (w[1] if len(w) > 1 else []) if s <= pos < e}


CASES = [
    # (label, surah, ayah, word, letter, nth, has, lacks)
    ("mottasel", 2, 40, 2, "ر", 1, {"madda_obligatory_mottasel"}, set()),        # إِسۡرٰٓءِيلَ
    ("monfasel", 2, 190, 8, "و", 1, {"madda_obligatory_monfasel"}, set()),       # تَعۡتَدُوٓاۡ إِنَّ
    ("lazim", 6, 143, 10, "ا", 1, {"madda_necessary"}, set()),                    # ءَآلذَّكَرَيۡنِ
    ("ikhfa-in-word", 18, 82, 10, "ن", 1, {"ikhafa"}, set()),                     # كَنزٌ
    ("ikhfa-jund", 38, 11, 1, "ن", 1, {"ikhafa"}, set()),                         # جُندٌ
    ("sakt-man", 75, 27, 2, "ن", 1, set(), {"idgham_wo_ghunnah"}),                # مَنۡۜ رَاقٖ
    ("sakt-raq", 75, 27, 3, "ر", 1, set(), {"idgham_wo_ghunnah"}),
]


def main() -> int:
    bad = 0
    for label, s, a, w, letter, nth, has, lacks in CASES:
        got = rules_on(s, a, w, letter, nth)
        ok = has <= got and not (lacks & got)
        bad += not ok
        print(f"{'ok  ' if ok else 'FAIL'} {label:14} {s}:{a}:{w} {letter} → {sorted(got)}")
    print(f"\n{len(CASES) - bad} passed, {bad} failed")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
