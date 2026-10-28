#!/usr/bin/env python3
"""Second pass for the boundaries resolve.py could not decide.

  python3 realign.py <reciter-id>[,<id>...] [--from DIR] [--to DIR]

textalign.py aligned each run of ayahs in a window cut around the
SHIPPED boundaries — mp3quran's times, snapped to a pause. Where those
times are far out (a whole short surah tens of seconds off, as in some
recordings), the words were never inside the window and nothing that
followed could recover. This pass trusts only boundaries already
confirmed: every run of undecided ones is aligned again between the
confirmed boundaries either side of it, from the text alone, and the
listener (resolve.py's) hears every candidate — the new alignment's,
the old ones, every quiet stretch in between — with longer windows and
with the quiet at a window's edge trimmed off, where a short window or
a long silence had made it imagine words.

Writes <to>/<id>.jsonl in resolve.py's format; resolve.py --apply reads
it after the first pass and lets it override.
"""
import argparse
import glob
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import resolve as R  # noqa: E402
import textalign as T  # noqa: E402

SR = T.SR
LONG_S = 6.0
EDGE_S = 3.0  # trim at most this much quiet off a window's inner edge
MAX_RUN_S = 1000.0  # longer spans are left to textalign's own blocks


def current(rid, src, first):
    """Per surah: (result, bounds, status) with resolve.py's first-pass
    decisions folded in, and the rows it left undecided."""
    reading = T.reading_of(rid)
    rows = {}
    path = os.path.join(first, f"{rid}.jsonl")
    for l in open(path) if os.path.exists(path) else []:
        r = json.loads(l)
        if "error" not in r:
            rows.setdefault(r["surah"], []).append(r)
    out = {}
    for p in sorted(glob.glob(os.path.join(src, rid, "[0-9][0-9][0-9].json"))):
        o = p.replace(".json", ".orig.json")
        res = json.load(open(o if os.path.exists(o) else p))
        if "status" not in res or "flag" not in res["status"]:
            continue
        s = res["surah"]
        texts = T.ayah_texts(reading, s)
        picks = {}
        for r in rows.get(s, []):
            k, _ = R.decide(r, texts)
            if k is not None:
                picks[r["i"]] = round(r["cands"][k], 2)
        b, st, _ = R.fold(res, picks)
        if "flag" in st:
            out[s] = (res, b, st, texts)
    return out


def runs(st):
    """Runs of consecutive flagged boundary indices."""
    out, cur = [], []
    for i, x in enumerate(st):
        if x != "ok":
            cur.append(i)
        elif cur:
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def quiet_mask(db):
    n = len(db)
    qs = np.zeros(n, dtype=bool)
    for i in range(n):
        a, b = max(0, i - 150), min(n, i + 150)
        seg = db[a:b]
        floor, peak = np.percentile(seg, 5), np.percentile(seg, 90)
        qs[i] = db[i] < floor + 0.3 * (peak - floor)
    return qs


def realign_surah(hearer, listener, rid, res, b, st, texts, allow_whole=True):
    s = res["surah"]
    n = len(st) - 1
    dur = res["dur"]
    table, _ = T.read_table(rid)
    url = f"{T.server_of(table['src'])}{s:03d}.mp3"
    words = [T.normalise(t, hearer.vocab) for t in texts]
    rows = []
    todo = runs(st)
    redone = not allow_whole
    while todo:
        run = todo.pop(0)
        r0, r1 = run[0], run[-1]
        a_lo, a_hi = r0 - 1, r1 + 1  # confirmed anchors (or the file's ends)
        t_lo = b[a_lo] if a_lo >= 0 else 0.0
        t_hi = b[a_hi] if a_hi <= n else dur
        ay0 = max(0, a_lo)  # first ayah inside the span
        ay1 = min(n, a_hi)  # one past the last
        w0, w1 = max(0.0, t_lo - LONG_S - 1.0), min(dur, t_hi + LONG_S + 1.0)
        audio = R.cut(url, w0, w1)
        db = T.loudness(audio)
        qs = quiet_mask(db)
        new = {}
        if t_hi - t_lo <= MAX_RUN_S:
            em = hearer.emissions(audio)
            # The anchors are boundaries already confirmed: the words of
            # ayahs ay0..ay1-1 lie between them, and nothing else does —
            # but for the opening before ayah 1 and the quiet after the last.
            res_al = T.align_block(hearer, em, t_lo - w0, t_hi - w0, words[ay0:ay1])
            bad = res_al is None or np.mean([c for _, _, c in res_al]) < T.MIN_CONFIDENCE
            if bad and not redone and dur <= MAX_RUN_S and (r0 > 0 or r1 < n):
                # The words are not where the confirmed boundaries say: one
                # of THEM is wrong (a recording whose published times are
                # far out leaves a start "confirmed" in the wrong silence).
                # Take the whole surah again, every boundary in it.
                redone = True
                todo = [list(range(n + 1))]
                continue
            if res_al:
                for q, (s_, e_, c_) in zip(range(ay0, ay1), res_al):
                    if q > ay0 and q in run:
                        prev_end = res_al[q - ay0 - 1][1]
                        new[q] = (w0 + T.boundary(prev_end, s_), c_)
                    if q == 0 and 0 in run:
                        new[0] = (w0 + max(0.0, s_ - T.LEAD_S), c_)
                    if q == n - 1 and n in run:
                        new[n] = (w0 + min(dur - w0, e_ + T.TAIL_S), c_)
        for i in run:
            cands = {}
            if i in new:
                cands["aligned"] = round(new[i][0], 2)
            cands["aligned1"] = res["aligned"][i]
            cands["pause"] = res["shipped"][i]
            if i < len(res["published"]):
                cands["published"] = res["published"][i]
            cands = {k: v for k, v in cands.items() if t_lo + 0.2 <= v <= t_hi - 0.2 or
                     (i == 0 and v <= t_hi - 0.2) or (i == n and v >= t_lo + 0.2)}
            centre = [v for v in cands.values()] or [(t_lo + t_hi) / 2]
            lo, hi = max(t_lo, min(centre) - 10.0), min(t_hi, max(centre) + 10.0)
            if i == 0:
                lo = 0.0
            if i == n:
                hi = dur
            # every quiet stretch in reach
            k = 0
            m = len(qs)
            while k < m:
                if not qs[k]:
                    k += 1
                    continue
                j = k
                while j < m and qs[j]:
                    j += 1
                if j - k >= 8:
                    s0, e0 = w0 + k * T.FRAME_S, w0 + j * T.FRAME_S
                    p = round(max((s0 + e0) / 2, e0 - T.LEAD_S), 2)
                    if lo <= p <= hi and all(abs(p - v) > 0.25 for v in cands.values()):
                        cands[f"q{p:.2f}"] = p
                k = j
            if not cands:
                continue
            quiet = {kk: T.quiet_at(db, t - w0) for kk, t in cands.items()}

            def voiced_from(t):
                f = int((t - w0) / T.FRAME_S)
                for g in range(f, min(len(qs), f + int(EDGE_S / T.FRAME_S))):
                    if not qs[g]:
                        return w0 + g * T.FRAME_S
                return t

            def voiced_to(t):
                f = int((t - w0) / T.FRAME_S)
                for g in range(f, max(0, f - int(EDGE_S / T.FRAME_S)), -1):
                    if g < len(qs) and not qs[g]:
                        return w0 + (g + 1) * T.FRAME_S
                return t

            def clip(a, z):
                a, z = max(w0, a), min(w1, z)
                return audio[int((a - w0) * SR): int((z - w0) * SR)] if z - a > 0.3 else np.zeros(SR // 2, np.float32)

            keys = list(cands)
            wins = []
            for kk in keys:
                t = cands[kk]
                v0, v1 = voiced_from(t), voiced_to(t)
                wins += [clip(t, t + R.WIN_S), clip(t - R.WIN_S, t),
                         clip(t, t + LONG_S), clip(t - LONG_S, t),
                         clip(v0, v0 + LONG_S), clip(v1 - LONG_S, v1)]
            heard = listener.hear(wins)
            after, before, after_v, before_v = {}, {}, {}, {}
            for x, kk in enumerate(keys):
                h = heard[6 * x: 6 * x + 6]
                after[kk], before[kk] = h[0], h[1]
                after_v[kk], before_v[kk] = [h[2], h[4]], [h[3], h[5]]
            row = {"surah": s, "i": i, "n": n, "cands": cands, "quiet": quiet,
                   "after": after, "before": before, "after_v": after_v, "before_v": before_v,
                   "pass": 2, "conf": None if i not in new else round(new[i][1], 2)}
            best, why = R.decide(row, texts)
            row.update({"best": best, "why": why, "decided": best is not None,
                        "t": round(cands[best], 2) if best else None})
            rows.append(row)
            if best is not None:
                b[i], st[i] = cands[best], "ok"
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("reciters")
    ap.add_argument("--from", dest="src", default=os.path.expanduser("~/.mihrab-align/out"))
    ap.add_argument("--first", default=os.path.expanduser("~/.mihrab-align/resolve"))
    ap.add_argument("--to", default=os.path.expanduser("~/.mihrab-align/resolve2"))
    ap.add_argument("--surahs", default="")
    ap.add_argument("--suspect", action="store_true",
                    help="take again the confirmed boundaries verify.py could not hear right (into resolve3)")
    a = ap.parse_args()
    if a.suspect and a.to.endswith("resolve2"):
        a.to = a.to[: -len("resolve2")] + "resolve3"
    os.makedirs(a.to, exist_ok=True)
    only = {int(x) for x in a.surahs.split(",") if x}
    hearer = T.Hearer()
    listener = R.Listener()
    for rid in a.reciters.split(","):
        path = os.path.join(a.to, f"{rid}.jsonl")
        done = set()
        if os.path.exists(path):
            done = {json.loads(l)["surah"] for l in open(path)}
        if a.suspect:
            import verify as V
            ver = json.load(open(os.path.join(os.path.dirname(a.to.rstrip("/")), "verify", f"{rid}.json")))
            sus = {}
            for s_, i_ in ver["suspect"]:
                sus.setdefault(s_, set()).add(i_)
            todo = {}
            for s_, (res, b, st, texts) in V.state(rid, a.src, a.first,
                                                    os.path.join(os.path.dirname(a.to.rstrip("/")), "resolve2")).items():
                if s_ in sus:
                    todo[s_] = (res, b, ["flag" if i_ in sus[s_] else "ok" for i_ in range(len(st))], texts)
        else:
            todo = current(rid, a.src, a.first)
        for s, (res, b, st, texts) in sorted(todo.items()):
            if (only and s not in only) or s in done:
                continue
            try:
                rows = realign_surah(hearer, listener, rid, res, b, st, texts, allow_whole=not a.suspect)
            except Exception as e:  # reported, not fatal
                rows = [{"surah": s, "error": repr(e)}]
            with open(path, "a") as f:
                for r in rows:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
            print(json.dumps({"reciter": rid, "surah": s, "rows": len(rows),
                              "decided": sum(1 for r in rows if r.get("decided"))}), flush=True)
        print(f"DONE {rid}", flush=True)


if __name__ == "__main__":
    main()
