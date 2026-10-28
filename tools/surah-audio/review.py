#!/usr/bin/env python3
"""Cut a listening clip around every boundary textalign.py left flagged.

  python3 review.py <reciter-id> [--from /tmp/align-out] [--to /tmp/align-review]

Each clip runs from 4 s before the earliest candidate to 4 s after the
latest, so whoever listens hears the previous ayah end and the next one
begin, and index.tsv names the candidates' offsets inside the clip. The
listener's answer goes in its `pick` column (aligned / pause / published,
or a time in seconds into the clip); nothing here edits a table.
"""
import argparse
import glob
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
TABLES = os.path.join(HERE, "..", "..", "src", "quran", "data", "surahRecitations")
PAD = 4.0


def cut(src, dest, tries=3):
    """Audio only: some files carry cover art ffmpeg can't decode, and the
    CDN drops the odd request, so a failed cut is tried again."""
    import textalign
    # lame chokes on a few frames of some files; copying the stream instead
    # cuts on frame edges, a few ms out, which is fine for listening.
    for codec in (["-c:a", "libmp3lame", "-q:a", "5"], ["-c:a", "copy"]):
        for n in range(tries):
            r = subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-user_agent", textalign.UA, *src,
                                "-map", "0:a:0", "-vn", *codec, dest])
            if r.returncode == 0:
                return
    raise SystemExit(f"could not cut {dest}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("reciter")
    ap.add_argument("--from", dest="src", default="/tmp/align-out")
    ap.add_argument("--to", default="/tmp/align-review")
    a = ap.parse_args()

    import textalign  # server_of, and the same cache of reciters
    table = json.load(open(os.path.join(TABLES, f"{a.reciter}.json")))
    server = textalign.server_of(table["src"])
    out = os.path.join(a.to, a.reciter)
    os.makedirs(out, exist_ok=True)
    rows = ["clip\tsurah\tboundary\taligned\tpause\tpublished\tscores\tpick"]
    for p in sorted(glob.glob(os.path.join(a.src, a.reciter, "*.json"))):
        res = json.load(open(p))
        if "status" not in res:
            continue
        s = res["surah"]
        for i, st in enumerate(res["status"]):
            if st == "ok":
                continue
            cands = {"aligned": res["aligned"][i], "pause": res["shipped"][i]}
            if i < len(res["published"]):
                cands["published"] = res["published"][i]
            lo = max(0.0, min(cands.values()) - PAD)
            hi = min(res["dur"], max(cands.values()) + PAD)
            name = f"{s:03d}-{i:03d}.mp3"
            cut(["-ss", f"{lo:.2f}", "-to", f"{hi:.2f}", "-i", f"{server}{s:03d}.mp3"], os.path.join(out, name))
            j = (res.get("judged") or [None] * (i + 1))[i] or {}
            rows.append("\t".join([name, str(s), str(i)] +
                                  [f"{cands[k] - lo:.2f}" if k in cands else "" for k in ("aligned", "pause", "published")] +
                                  [json.dumps(j.get("scores", {})), ""]))
    with open(os.path.join(out, "index.tsv"), "w") as f:
        f.write("\n".join(rows) + "\n")
    print(f"{len(rows) - 1} clips in {out}")


if __name__ == "__main__":
    main()
