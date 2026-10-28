#!/usr/bin/env python3
"""Fold text-alignment results into the bundled tables (v2 → v3).

  python3 tables.py <reciter-id> [--from /tmp/align-out] [--check]

For each surah textalign.py finished (<from>/<id>/SSS.json), the table's
boundaries become the alignment's and each boundary marked "ok" gets its
bit in `c`. A surah with no result keeps its shipped boundaries, none of
them confirmed. Sizes (`z`), lengths (`d`) and `bytes` are untouched: the
alignment never changes which file the boundaries fit.

--check prints what would change and writes nothing.
"""
import argparse
import base64
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TABLES = os.path.join(HERE, "..", "..", "src", "quran", "data", "surahRecitations")


def uint24s(b64):
    b = base64.b64decode(b64)
    return [int.from_bytes(b[i:i + 3], "big") for i in range(0, len(b), 3)]


def pack24(values):
    return base64.b64encode(b"".join(int(v).to_bytes(3, "big") for v in values)).decode()


def pack_bits(bits):
    out = bytearray((len(bits) + 7) // 8)
    for k, on in enumerate(bits):
        if on:
            out[k >> 3] |= 0x80 >> (k & 7)
    return base64.b64encode(bytes(out)).decode()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("reciter")
    ap.add_argument("--from", dest="src", default="/tmp/align-out")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--exclude", default=None,
                    help="surahs the recording does not hold whole (e.g. 20): never played in this voice; "
                         "written as `x`, and left out of the exactness count. Omit to keep the table's own.")
    a = ap.parse_args()

    path = os.path.join(TABLES, f"{a.reciter}.json")
    table = json.load(open(path))
    flat = uint24s(table["b"])
    lengths = uint24s(table["d"])
    out_b, out_c = [], []
    at = 0
    done = moved = confirmed = total = 0
    for s, n in enumerate(table["n"], start=1):
        shipped = flat[at: at + n + 1]
        at += n + 1
        res_path = os.path.join(a.src, a.reciter, f"{s:03d}.json")
        res = json.load(open(res_path)) if os.path.exists(res_path) else None
        if res and "bounds" in res and len(res["bounds"]) == n + 1:
            new = [round(t * 100) for t in res["bounds"]]
            ok = [st == "ok" for st in res["status"]]
            # Same rules the app applies; a surah that breaks them keeps
            # its shipped boundaries rather than losing the whole table.
            fits = all(new[k] > new[k - 1] for k in range(1, len(new))) and new[-1] <= lengths[s - 1] + 50
            if not fits:
                print(f"surah {s}: aligned boundaries out of order or past the file — kept shipped", file=sys.stderr)
                new, ok = shipped, [False] * (n + 1)
            else:
                done += 1
                moved += sum(1 for x, y in zip(new, shipped) if abs(x - y) > 5)
        else:
            new, ok = shipped, [False] * (n + 1)
        out_b += new
        out_c += ok
        confirmed += sum(ok)
        total += n + 1
    assert at == len(flat)

    excluded = sorted({int(x) for x in a.exclude.split(",") if x}) if a.exclude is not None else table.get("x", [])
    # A surah the recording does not hold is never played: its boundaries
    # stay as they are, unconfirmed, and are not counted either way.
    skipped = 0
    at = 0
    for s, n in enumerate(table["n"], start=1):
        if s in excluded:
            skipped += sum(out_c[at: at + n + 1])
            confirmed -= sum(out_c[at: at + n + 1])
            total -= n + 1
        at += n + 1
    print(json.dumps({"reciter": a.reciter, "surahs_aligned": done, "moved_over_50ms": moved,
                      "confirmed": confirmed, "total": total, "excluded": excluded,
                      "exact": confirmed == total}))
    if a.check:
        return
    table["v"] = 3
    table["b"] = pack24(out_b)
    table["c"] = pack_bits(out_c)
    if excluded:
        table["x"] = excluded
    else:
        table.pop("x", None)
    keys = ["v", "id", "src", "bytes", "n", "b", "d", "z", "c", "x"]
    ordered = {k: table[k] for k in keys if k in table}
    ordered.update({k: v for k, v in table.items() if k not in ordered})
    with open(path, "w") as f:
        json.dump(ordered, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
