#!/usr/bin/env python3
"""Hear every surah's first and last boundary, confirmed or not.

  python3 verify.py <reciter-id>[,<id>...] [--from DIR] [--to DIR]

textalign.py confirms a surah's opening boundary when the shipped one
sits in quiet: the taʿawwudh and basmalah are not in the ayah text, so
the alignment cannot be trusted there. Quiet is not enough. Where the
first ayah is disjoint letters (الٓمٓ) drawn out for a dozen seconds,
or mp3quran's times for a short surah are far out, a confirmed opening
can sit in the wrong silence. The end is checked for the same reason.

Each is heard as resolve.py hears a candidate. One heard right stands;
the rest are written to <to>/<id>.json as boundaries for realign.py to
take again (realign.py --suspect).
"""
import argparse
import glob
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import realign as RA  # noqa: E402
import resolve as R  # noqa: E402
import textalign as T  # noqa: E402

SR = T.SR
SPAN = 9.0


def state(rid, src, first, second):
    """Per surah: (result, bounds, status, texts), every decision so far folded in."""
    reading = T.reading_of(rid)
    rows = {}
    for d in (first, second):
        p = os.path.join(d, f"{rid}.jsonl")
        for l in open(p) if os.path.exists(p) else []:
            r = json.loads(l)
            if "error" not in r:
                rows.setdefault(r["surah"], {})[r["i"]] = r
    out = {}
    for p in sorted(glob.glob(os.path.join(src, rid, "[0-9][0-9][0-9].json"))):
        o = p.replace(".json", ".orig.json")
        res = json.load(open(o if os.path.exists(o) else p))
        if "status" not in res:
            continue
        s = res["surah"]
        texts = T.ayah_texts(reading, s)
        picks = {}
        for i, r in rows.get(s, {}).items():
            k, _ = R.decide(r, texts)
            if k is not None:
                picks[i] = round(r["cands"][k], 2)
        b, st, _ = R.fold(res, picks)
        out[s] = (res, b, st, texts)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("reciters")
    ap.add_argument("--from", dest="src", default=os.path.expanduser("~/.mihrab-align/out"))
    ap.add_argument("--first", default=os.path.expanduser("~/.mihrab-align/resolve"))
    ap.add_argument("--second", default=os.path.expanduser("~/.mihrab-align/resolve2"))
    ap.add_argument("--to", default=os.path.expanduser("~/.mihrab-align/verify"))
    a = ap.parse_args()
    os.makedirs(a.to, exist_ok=True)
    listener = R.Listener()
    for rid in a.reciters.split(","):
        path = os.path.join(a.to, f"{rid}.json")
        done = json.load(open(path)) if os.path.exists(path) else {"heard": {}, "suspect": []}
        table, _ = T.read_table(rid)
        server = T.server_of(table["src"])
        for s, (res, b, st, texts) in sorted(state(rid, a.src, a.first, a.second).items()):
            if str(s) in done["heard"]:
                continue
            n = len(b) - 1
            entry = {}
            for i in (0, n):
                if st[i] != "ok":
                    continue  # already for realign.py
                t = b[i]
                w0, w1 = max(0.0, t - SPAN), min(res["dur"], t + SPAN)
                try:
                    audio = R.cut(f"{server}{s:03d}.mp3", w0, w1)
                except Exception as e:  # noqa: BLE001
                    entry[i] = {"error": repr(e)}
                    continue
                qs = RA.quiet_mask(T.loudness(audio))

                def at(x):
                    return int((x - w0) * SR)

                def voiced(x, step):
                    f = int((x - w0) / T.FRAME_S)
                    rng = range(f, min(len(qs), f + 150)) if step > 0 else range(min(f, len(qs) - 1), max(0, f - 150), -1)
                    for g in rng:
                        if not qs[g]:
                            return w0 + (g + (0 if step > 0 else 1)) * T.FRAME_S
                    return x

                v0, v1 = voiced(t, 1), voiced(t, -1)
                clips = [audio[at(t): at(t + 4)], audio[at(max(w0, t - 4)): at(t)],
                         audio[at(v0): at(v0 + 6)], audio[at(max(w0, v1 - 6)): at(v1)]]
                clips = [c if len(c) > SR // 3 else np.zeros(SR // 2, np.float32) for c in clips]
                h = listener.hear(clips)
                row = {"surah": s, "i": i, "n": n, "cands": {"current": t}, "quiet": {"current": True},
                       "after": {"current": h[0]}, "before": {"current": h[1]},
                       "after_v": {"current": [h[2]]}, "before_v": {"current": [h[3]]}}
                sa, sb = R.side_scores(row, texts)["current"]
                entry[i] = {"t": t, "sa": sa, "sb": sb, "after": h[0], "before": h[1]}
                if sa + sb < R.PASS:
                    done["suspect"].append([s, i])
            done["heard"][str(s)] = entry
            with open(path, "w") as f:
                json.dump(done, f, ensure_ascii=False)
        print(json.dumps({"reciter": rid, "suspect": len(done["suspect"])}), flush=True)


if __name__ == "__main__":
    main()
