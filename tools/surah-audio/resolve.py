#!/usr/bin/env python3
"""A second listener for the boundaries textalign.py left flagged.

  python3 resolve.py <reciter-id>[,<id>...] [--from DIR] [--to DIR] [--surahs 1,2]

textalign.py's own judge hears with the same model that did the aligning,
so where it could not decide, asking it again settles nothing. This asks
a different one: a Whisper model fine-tuned on recitation
(tarteel-ai/whisper-base-ar-quran, Apache-2.0) transcribes the seconds
after and before every candidate, and a candidate is right when what
follows it begins with the next ayah's words and what precedes it ends
with the previous ayah's.

The candidates are the three textalign.py had — the alignment, the pause,
mp3quran's time — and every other quiet stretch between the neighbouring
boundaries, in case all three missed. A candidate wins only clearly:
both sides heard right, well ahead of any rival more than a breath away,
and sitting in quiet unless it is the alignment's own join (a reciter who
runs one ayah into the next leaves no quiet to sit in).

Writes <to>/<id>.jsonl, one line per flagged boundary, with every
candidate's score and transcripts; nothing here edits a table.
`--apply` folds the decided ones into <from>/<id>/SSS.json (keeping the
originals as SSS.orig.json) so tables.py picks them up.
"""
import argparse
import difflib
import glob
import json
import os
import re
import subprocess
import sys
import unicodedata

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import textalign as T  # noqa: E402

ASR_MODEL = "tarteel-ai/whisper-base-ar-quran"
PICKS = os.path.join(HERE, "picks.json")  # decided by reading the transcripts, where the rules could not
SR = T.SR
WIN_S = 4.0  # heard after and before a candidate
K = 10  # letters compared each side
MARGIN_S = 1.0  # beyond the window, for the loudness context
PASS = 1.5  # both sides at least ~0.75 alike
MARGIN = 0.3
BREATH_S = 0.6  # rivals closer than this are the same boundary
MAX_SPAN_S = 120.0

OPENINGS = ["اعوذباللهمنالشيطانالرجيم", "بسماللهالرحمنالرحيم"]
CLOSINGS = ["صدقاللهالعظيم"]

DROP = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")


def canon(s):
    """Bare letters, spelt the same whichever script wrote them."""
    s = unicodedata.normalize("NFC", s)
    s = DROP.sub("", s)
    for a, b in (("ٱ", "ا"), ("أ", "ا"), ("إ", "ا"), ("آ", "ا"), ("ى", "ي"), ("ئ", "ي"), ("ے", "ي"), ("ی", "ي"),
                 ("ک", "ك"), ("ٮ", "ب"), ("ڢ", "ف"), ("ٯ", "ق"),
                 ("ؤ", "و"), ("ة", "ه"), ("ء", "")):
        s = s.replace(a, b)
    s = "".join(c for c in s if "ء" <= c <= "ي")
    # Uthmani script leaves out many long alifs (الكتب for الكتاب) and
    # writes some with wāw (الصلوة); without alifs both read alike.
    return s.replace("ا", "")


def similar(a, b):
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def cut(url, lo, hi):
    r = subprocess.run(["ffmpeg", "-v", "error", "-user_agent", T.UA, "-reconnect", "1",
                        "-ss", f"{lo:.3f}", "-to", f"{hi:.3f}", "-i", url,
                        "-map", "0:a:0", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"cut failed: {url} {lo}-{hi}")
    return np.frombuffer(r.stdout, dtype=np.float32).copy()


def quiet_runs(db, t0, lo, hi):
    """Points just before the sound that ends each quiet stretch in [lo, hi]."""
    out = []
    n = len(db)
    qs = np.zeros(n, dtype=bool)
    for i in range(n):
        a, b = max(0, i - 150), min(n, i + 150)
        seg = db[a:b]
        floor, peak = np.percentile(seg, 5), np.percentile(seg, 90)
        qs[i] = db[i] < floor + 0.3 * (peak - floor)
    i = 0
    while i < n:
        if not qs[i]:
            i += 1
            continue
        j = i
        while j < n and qs[j]:
            j += 1
        if j - i >= 8:  # 160 ms
            s, e = t0 + i * T.FRAME_S, t0 + j * T.FRAME_S
            p = max((s + e) / 2, e - T.LEAD_S)
            if lo <= p <= hi:
                out.append(round(p, 2))
        i = j
    return out


class Listener:
    def __init__(self):
        import torch
        from transformers import WhisperForConditionalGeneration, WhisperProcessor
        self.torch = torch
        self.dev = os.environ.get("ASR_DEVICE", "mps" if torch.backends.mps.is_available() else "cpu")
        self.proc = WhisperProcessor.from_pretrained(ASR_MODEL)
        self.model = WhisperForConditionalGeneration.from_pretrained(ASR_MODEL).to(self.dev).eval()

    def hear(self, clips, batch=16):
        out = []
        with self.torch.inference_mode():
            for k in range(0, len(clips), batch):
                f = self.proc(list(clips[k:k + batch]), sampling_rate=SR, return_tensors="pt").input_features
                # The model's own config turns the decoder cache off, which
                # makes every token recompute the whole prefix; and four
                # seconds of recitation is a dozen words at most, where an
                # unbounded decode loops on a quiet clip to its full length.
                ids = self.model.generate(f.to(self.dev), max_new_tokens=48, num_beams=1,
                                          do_sample=False, use_cache=True)
                out += [re.sub(r"<\|[^|]*\|>", "", t).strip()
                        for t in self.proc.batch_decode(ids, skip_special_tokens=True)]
        return out


MUQATTAAT = {"لم", "لمص", "لر", "لمر", "كهيعص", "طه", "طسم", "طس", "يس", "ص", "حم", "عسق", "ق", "ن"}
# How the listener writes disjoint letters it heard (it mixes them up:
# الٓر comes out الم as often as not).
HEARD_LETTERS = {m for m in MUQATTAAT if len(m) >= 2}
LETTER_NAMES = {"ا": "الف", "ل": "لام", "م": "ميم", "ص": "صاد", "ر": "را", "ك": "كاف", "ه": "ها",
                "ي": "يا", "ع": "عين", "ط": "طا", "س": "سين", "ح": "حا", "ق": "قاف", "ن": "نون"}


def readings(text, first):
    """The ayah's bare letters, and — for an opening of disjoint letters
    (الٓمٓ, حمٓ) — the same with the letters said by name, as recited."""
    out = [canon(text)]
    if first:
        words = text.split()
        w0 = canon(words[0]) if words else ""
        if w0 in MUQATTAAT:
            raw = DROP.sub("", unicodedata.normalize("NFC", words[0])).replace("ٱ", "ا")
            named = "".join(LETTER_NAMES.get(c, "") for c in raw)
            out.append(canon(named) + canon(" ".join(words[1:])))
            if len(words) > 1:
                # Drawn out six counts a letter, the letters alone can fill
                # the whole window.
                out += [w0, canon(named)]
    return out


def skeleton(s):
    """Letters with the long vowels left out: Uthmani and plain spelling,
    and the listener's ear, differ most in those."""
    return s.replace("و", "").replace("ي", "")


def lev(a, b):
    a, b = skeleton(a), skeleton(b)
    prev = list(range(len(b) + 1))
    for x, ca in enumerate(a, 1):
        cur = [x]
        for y, cb in enumerate(b, 1):
            cur.append(min(prev[y] + 1, cur[y - 1] + 1, prev[y - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def fit_head(heard, want):
    """How well what was heard BEGINS like `want`, 0..1: one less for every
    letter added, dropped or changed — so the tail of the previous ayah
    at the window's start counts against it. A slow reciter may say only
    a word or two in the window: then only that much is compared."""
    m = min(len(want), len(heard)) if len(heard) >= 4 else len(want)
    if m == 0 or not heard:
        return 0.0
    w = want[:m]
    d = min(lev(heard[:L], w) for L in range(max(0, m - 2), m + 3))
    return max(0.0, 1 - d / m)


def fit_tail(heard, want):
    m = min(len(want), len(heard)) if len(heard) >= 4 else len(want)
    if m == 0 or not heard:
        return 0.0
    w = want[-m:]
    d = min(lev(heard[len(heard) - L:] if L else "", w) for L in range(max(0, m - 2), m + 3))
    return max(0.0, 1 - d / m)


def only_letters(text):
    """An ayah that is nothing but disjoint letters (الٓمٓ, كٓهيعٓصٓ): the
    listener spells them every which way, so it cannot vouch for them."""
    words = text.split()
    return len(words) == 1 and canon(words[0]) in MUQATTAAT


def side_scores(row, texts):
    """(after, before) per candidate: how well each side was heard, 0..1."""
    i, n = row["i"], row["n"]
    opener = lambda j: j == 0 or (row["surah"] == 42 and j == 1)  # noqa: E731
    nxt = [x[:K] for x in readings(texts[i], opener(i))] if i < n else None
    prv = [x[-K:] for x in readings(texts[i - 1], opener(i - 1))] if i > 0 else None
    letters_before = i > 0 and only_letters(texts[i - 1])
    out = {}
    first = [x[:K] for x in readings(texts[0], True)]
    opens_with_letters = bool(texts[0].split()) and canon(texts[0].split()[0]) in MUQATTAAT
    last = [x[-K:] for x in readings(texts[n - 1], n - 1 == 0)]
    for k in row["cands"]:
        afters = [canon(x) for x in [row["after"][k]] + row.get("after_v", {}).get(k, [])]
        befores = [canon(x) for x in [row["before"][k]] + row.get("before_v", {}).get(k, [])]
        if nxt is not None:
            sa = max(fit_head(a, x) for a in afters for x in nxt)
            if i == 0 and opens_with_letters and any(a[:3].startswith(m) for a in afters for m in HEARD_LETTERS):
                sa = max(sa, 0.8)  # disjoint letters heard, if not the right ones
        else:
            # After the last ayah: anything but its own words — quiet (where
            # the listener may imagine a word or two), or the closing.
            sa = 0.0 if any(fit_head(a, x) >= 0.6 or (len(x) >= 5 and x[-5:] in a) for a in afters for x in last) else 1.0
        if prv is not None:
            # After disjoint letters the before side says nothing either
            # way: every candidate gets the same half, and the words after
            # decide.
            sb = PASS / 2 if letters_before else max(fit_tail(b, x) for b in befores for x in prv)
        else:
            # Before the first ayah: the opening's last words (the basmalah,
            # or the taʿawwudh where there is none), or the file's start.
            # "Anything but the ayah's own words" is not enough: disjoint
            # letters said by name are heard as anything at all.
            t = row["cands"][k]
            sb = 1.0 if t < 1.0 else max(fit_tail(b, c[-K:]) for b in befores for c in OPENINGS)
        out[k] = (round(sa, 3), round(sb, 3))
    return out


CLUSTER_S = 2.0  # candidates heard right this close are one boundary
ALIGNED_CLUSTER_S = 4.0  # ... and this close, when the alignment is one of them
REALIGNED_SIDE = 0.35  # ... where the listener need only not contradict it
REALIGNED_CONF = -2.0  # see textalign.py MIN_CONFIDENCE: right sits around -1 to -2
SIDE_MIN = 0.6  # and neither side worse than this
END_SIDE = 0.8  # a surah's first/last boundary: the ayah side at least this
CLEAR = 1.8  # both sides heard all but word for word
ALIGNED_SLACK = 0.15  # the alignment stands unless heard this much worse than the best
AGREE_NEXT = 0.7  # alignment and pause agree: the next ayah must be heard right


def decide(row, texts):
    """(key, reason) of the candidate to keep, or (None, reason)."""
    sides = side_scores(row, texts)
    cands, quiet = row["cands"], row["quiet"]
    total = {k: sa + sb for k, (sa, sb) in sides.items()}
    row["scores"] = {k: round(v, 3) for k, v in total.items()}
    i, n = row["i"], row["n"]
    best = max(total, key=total.get)
    good = [k for k in cands if total[k] >= PASS and min(sides[k]) >= SIDE_MIN]
    if i in (0, n):
        # The side that says something must say it clearly: a word clipped
        # mid-madd still half matches.
        good = [k for k in good if sides[k][1 if i == n else 0] >= END_SIDE]
    if good and i in (0, n):
        # A surah's first or last boundary: one side is "nothing of the
        # ayah", true of any quiet before the opening or after the end.
        # Of the places heard right, the last: after the opening's quiet,
        # after the end's last word.
        pool = [k for k in good if quiet[k]] or [k for k in good if total[k] >= CLEAR]
        if not pool:
            return None, "heard right only where it is not quiet"
        last = max(pool, key=lambda k: cands[k])
        if i == 0:
            # In the opening's last quiet, the alignment or the pause, not
            # whichever point of it happens to be latest: late clips the
            # first word.
            near = [k for k in pool if cands[last] - cands[k] <= BREATH_S]
            for pref in ("aligned", "pause"):
                if pref in near:
                    return pref, "heard"
        return last, "heard"
    if good:
        lo, hi = min(cands[k] for k in good), max(cands[k] for k in good)
        rivals = [k for k in cands if not (lo - BREATH_S <= cands[k] <= hi + BREATH_S)
                  and total[k] >= total[best] - MARGIN]
        # The listener places words to a second or so; the alignment to
        # the letter. Heard right too, the alignment's own join stands even
        # out of quiet — a reciter who runs one ayah into the next leaves
        # none — and over a wider spread, since a long madd or a breath can
        # leave the listener hearing the same words from either side of it.
        aligned_ok = "aligned" in good and 0 < i < n
        spread = ALIGNED_CLUSTER_S if aligned_ok else CLUSTER_S
        if hi - lo <= spread and not rivals:
            # ... unless another candidate is heard clearly better: an ayah
            # that ends on the word the next begins with (بِٱلنَّاصِيَةِ،
            # نَاصِيَةٍۢ) can pull the alignment one word over.
            if aligned_ok and total["aligned"] >= total[best] - ALIGNED_SLACK:
                return "aligned", "heard"
            pool = [k for k in good if quiet[k]]
            if not pool and total[best] >= CLEAR:
                # Out of quiet, but heard right word for word both sides.
                pool = [best]
            if not pool:
                return ("aligned", "heard") if aligned_ok else (None, "heard right only where it is not quiet")
            if i == n:  # the end: trailing quiet costs nothing, a clipped word does
                return max(pool, key=lambda k: cands[k]), "heard"
            top = max(total[k] for k in pool)
            near = [k for k in pool if total[k] >= top - 0.05]
            return ("pause" if "pause" in near else max(near, key=lambda k: total[k])), "heard"
        if hi - lo > spread:
            # Heard right in two places far apart: the reciter went back
            # and recited the join again. The boundary is where it is
            # first crossed — if, there, it is heard all but word for word.
            first = sorted(good, key=lambda k: cands[k])
            cluster = [k for k in first if cands[k] - cands[first[0]] <= CLUSTER_S]
            if max(total[k] for k in cluster) >= CLEAR:
                if "aligned" in cluster and 0 < i < n:
                    return "aligned", "recited again: the first time"
                pool = [k for k in cluster if quiet[k]] or [k for k in cluster if total[k] >= CLEAR]
                top = max(total[k] for k in pool)
                near = [k for k in pool if total[k] >= top - 0.05]
                return ("pause" if "pause" in near else max(near, key=lambda k: total[k])), \
                    "recited again: the first time"
            return None, "two places heard right"
        return None, "rival close behind"
    A, P = cands.get("aligned"), cands.get("pause")
    if row.get("pass") == 2 and A is not None and (row.get("conf") or -99) >= REALIGNED_CONF and quiet["aligned"]:
        # Aligned again between two confirmed boundaries, from the text
        # alone, confidently, into quiet; the listener half hears it and
        # hears nothing better anywhere else.
        sa, sb = sides["aligned"]
        if min(sa, sb) >= REALIGNED_SIDE and not [x for x in cands if total[x] > total["aligned"] + MARGIN
                                        and abs(cands[x] - A) > BREATH_S]:
            return "aligned", "realigned"
    if A is not None and P is not None and abs(A - P) <= BREATH_S:
        k = "pause" if quiet["pause"] else "aligned" if quiet["aligned"] else None
        far = [x for x in cands if abs(cands[x] - P) > BREATH_S and total[x] > total[k or "pause"] + MARGIN]
        # The side that says something: the next ayah's start, or — at
        # the end, where "nothing after" is easily said — the last ayah's end.
        side = sides[k][1] if k and i == n else sides[k][0] if k else 0.0
        if k and side >= AGREE_NEXT and not far:
            return k, "alignment and pause agree"
    return None, "not heard clearly"


def resolve_surah(listener, rid, res, texts):
    s = res["surah"]
    n = len(res["status"]) - 1
    url = None
    out = []
    final = list(res["bounds"])
    for i, st in enumerate(res["status"]):
        if st == "ok":
            continue
        A, P = res["aligned"][i], res["shipped"][i]
        M = res["published"][i] if i < len(res["published"]) else None
        base = {"aligned": A, "pause": P}
        if M is not None and 0 <= M <= res["dur"]:
            base["published"] = M
        lo_b = final[i - 1] + 0.3 if i > 0 else 0.0
        hi_b = final[i + 1] - 0.3 if i < n else res["dur"]
        base = {k: v for k, v in base.items() if lo_b <= v <= hi_b} or {"pause": P}
        span_lo = max(lo_b, min(base.values()) - 8.0)
        span_hi = min(hi_b, max(base.values()) + 8.0)
        if span_hi - span_lo > MAX_SPAN_S:
            span_lo, span_hi = min(base.values()) - 8.0, max(base.values()) + 8.0
            span_lo, span_hi = max(lo_b, span_lo), min(hi_b, span_hi)
        w0 = max(0.0, span_lo - WIN_S - MARGIN_S)
        w1 = min(res["dur"], span_hi + WIN_S + MARGIN_S)
        if url is None:
            table, _ = T.read_table(rid)
            url = f"{T.server_of(table['src'])}{s:03d}.mp3"
        audio = cut(url, w0, w1)
        db = T.loudness(audio)
        cands = dict(base)
        for q in quiet_runs(db, w0, span_lo, span_hi):
            if all(abs(q - v) > 0.25 for v in cands.values()):
                cands[f"q{q:.2f}"] = q
        quiet = {k: T.quiet_at(db, t - w0) for k, t in cands.items()}

        def clip(a, b):
            a, b = max(w0, a), min(w1, b)
            return audio[int((a - w0) * SR): int((b - w0) * SR)] if b - a > 0.3 else np.zeros(SR // 2, np.float32)

        keys = list(cands)
        heard = listener.hear([clip(cands[k], cands[k] + WIN_S) for k in keys] +
                              [clip(cands[k] - WIN_S, cands[k]) for k in keys])
        after = dict(zip(keys, heard[: len(keys)]))
        before = dict(zip(keys, heard[len(keys):]))
        row = {"surah": s, "i": i, "n": n, "cands": cands, "quiet": quiet, "after": after, "before": before}
        best, why = decide(row, texts)
        ok = best is not None
        t = cands[best] if ok else None
        if ok:
            final[i] = t
        row.update({"best": best, "why": why, "decided": ok, "t": round(t, 2) if ok else None})
        out.append(row)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("reciters")
    ap.add_argument("--from", dest="src", default=os.path.expanduser("~/.mihrab-align/out"))
    ap.add_argument("--to", default=os.path.expanduser("~/.mihrab-align/resolve"))
    ap.add_argument("--surahs", default="")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--dry", action="store_true", help="with --apply: decide and report, write nothing")
    a = ap.parse_args()
    os.makedirs(a.to, exist_ok=True)
    only = {int(x) for x in a.surahs.split(",") if x}
    if a.apply:
        for rid in a.reciters.split(","):
            for u in apply(rid, a.src, a.to, write=not a.dry):
                print(f"  {rid} {u[0]}:{u[1]} {u[2]}")
        return
    listener = Listener()
    for rid in a.reciters.split(","):
        path = os.path.join(a.to, f"{rid}.jsonl")
        done = set()
        if os.path.exists(path):
            done = {json.loads(l)["surah"] for l in open(path)}
        reading = T.reading_of(rid)
        for p in sorted(glob.glob(os.path.join(a.src, rid, "[0-9][0-9][0-9].json"))):
            res = json.load(open(p))
            if "status" not in res or "flag" not in res["status"]:
                continue
            s = res["surah"]
            if (only and s not in only) or s in done:
                continue
            try:
                rows = resolve_surah(listener, rid, res, T.ayah_texts(reading, s))
            except Exception as e:  # reported, not fatal
                rows = [{"surah": s, "error": str(e)}]
            with open(path, "a") as f:
                for r in rows:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
            dec = sum(1 for r in rows if r.get("decided"))
            print(json.dumps({"reciter": rid, "surah": s, "flagged": len(rows), "decided": dec}), flush=True)
        print(f"DONE {rid}", flush=True)


def fold(res, picks):
    """The alignment result's boundaries with `picks` ({index: seconds})
    in place of theirs, each marked confirmed. A pick that leaves a
    boundary out of order with its neighbour goes back to what it was,
    flagged — only that one, not the whole surah. Returns (bounds,
    status, dropped)."""
    orig = res["bounds"]
    b, st = list(orig), list(res["status"])
    for i, t in picks.items():
        b[i], st[i] = t, "ok"
    dropped = []
    while True:
        # Only where a pick is one of the two: a pair the alignment left
        # this close is its own business (tables.py checks plain order).
        bad = next((k for k in range(1, len(b)) if b[k] <= b[k - 1] + 0.2
                    and ((k in picks and k not in dropped) or (k - 1 in picks and k - 1 not in dropped))), None)
        if bad is None:
            return b, st, dropped
        for k in (bad - 1, bad):
            if k in picks and k not in dropped:
                b[k], st[k] = orig[k], "flag"
                dropped.append(k)


def R_decides(row, texts):
    return decide(row, texts)[0] is not None


def apply(rid, src, to, write=True):
    """Decide every flagged boundary again from the stored transcripts and
    fold the decided ones into the alignment results, order permitting."""
    reading = T.reading_of(rid)
    by_surah = {}
    for l in open(os.path.join(to, f"{rid}.jsonl")):
        r = json.loads(l)
        if "error" not in r:
            by_surah.setdefault(r["surah"], []).append(r)
    # The second pass (realign.py) heard its boundaries again: its rows
    # replace the first pass's for the same boundary.
    second = os.path.join(os.path.dirname(to.rstrip("/")), "resolve2", f"{rid}.jsonl")
    if os.path.exists(second):
        for l in open(second):
            r = json.loads(l)
            if "error" in r:
                continue
            rows = by_surah.setdefault(r["surah"], [])
            rows[:] = [x for x in rows if x["i"] != r["i"]] + [r]
    # The third (realign.py --suspect) took again boundaries that were
    # confirmed but not heard right: where it decides, it replaces them;
    # where it cannot, they stay as confirmed.
    third = os.path.join(os.path.dirname(to.rstrip("/")), "resolve3", f"{rid}.jsonl")
    if os.path.exists(third):
        for l in open(third):
            r = json.loads(l)
            if "error" in r or not R_decides(r, T.ayah_texts(reading, r["surah"])):
                continue
            if r["i"] == r["n"] and r["t"] is not None:
                # A confirmed end is only taken back by a little: after the
                # last word a reciter may say āmīn (after al-Fātiḥah), which
                # the listener hears as anything — and an end moved early
                # into a long madd clips it.
                cp = os.path.join(src, rid, f"{r['surah']:03d}.orig.json")
                cur = json.load(open(cp if os.path.exists(cp) else cp.replace(".orig", "")))
                k, _ = decide(r, T.ayah_texts(reading, r["surah"]))
                if r["cands"][k] < cur["bounds"][r["i"]] - 1.0:
                    continue
            rows = by_surah.setdefault(r["surah"], [])
            rows[:] = [x for x in rows if x["i"] != r["i"]] + [r]
    fixed = left = 0
    undecided = []
    manual = json.load(open(PICKS)).get(rid, {}) if os.path.exists(PICKS) else {}
    for s, rows in sorted(by_surah.items()):
        texts = T.ayah_texts(reading, s)
        p = os.path.join(src, rid, f"{s:03d}.json")
        orig = os.path.join(src, rid, f"{s:03d}.orig.json")
        res = json.load(open(orig if os.path.exists(orig) else p))
        b, st = list(res["bounds"]), list(res["status"])
        picks = {}
        for r in rows:
            k, why = decide(r, texts)
            if k is None:
                if f"{s}:{r['i']}" in manual:
                    picks[r["i"]] = manual[f"{s}:{r['i']}"]
                else:
                    undecided.append((s, r["i"], why))
            else:
                picks[r["i"]] = round(r["cands"][k], 2)
        b, st, dropped = fold(res, picks)
        for i in dropped:
            print(f"{rid} {s}:{i} out of order with its neighbours — left flagged", file=sys.stderr)
            undecided.append((s, i, "out of order"))
            picks.pop(i)
        left += len(dropped)
        fixed += len(picks)
        if write and picks:
            if not os.path.exists(orig):
                with open(orig, "w") as f:
                    json.dump(res, f)
            res["bounds"], res["status"] = b, st
            res["resolved"] = sorted(picks)
            with open(p, "w") as f:
                json.dump(res, f)
    print(json.dumps({"reciter": rid, "applied": fixed, "undecided": len(undecided)}))
    return undecided


if __name__ == "__main__":
    main()
