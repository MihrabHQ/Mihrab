#!/usr/bin/env python3
"""
Ayah boundaries for the whole-surah recitations (mp3quran.net).

mp3quran publishes, for some of its recordings, where every ayah starts
and ends inside the surah's one file. Measured against the recordings
themselves (October 2026), most of those starts sit in the pause before
the ayah, and a few in every hundred land a fraction of a second into
the speech on either side of it — enough to clip the first syllable of
an ayah, or to carry the first syllable of the next one. For a reader
who repeats one ayah to memorise it, that is the difference that matters.

So this does not ship mp3quran's numbers as they are. For every surah of
every reciter it decodes the audio, finds the quiet stretches, and moves
each boundary onto the pause nearest to it, within MAX_MOVE seconds:

  * a boundary already inside a pause stays where it is;
  * a late one (in the speech after a pause) moves back to just before
    the speech starts;
  * an early one (in the speech before a pause) moves forward to just
    after it stops.

A boundary with no pause within reach is left where mp3quran put it and
counted, so the report says how many ayahs are on the publisher's word
alone. "Quiet" is judged against the passage around it — the loudest and
quietest few seconds — and not against a fixed level, because recordings
differ by twenty decibels in their floor and a fixed threshold reads a
hissy pause as speech.

Nothing here can make a boundary RIGHT that the recording does not mark:
a reciter who runs one ayah into the next without a breath gives the
audio nothing to find. That is why the app calls these recitations "not
fully optimised for ayah tracking" — this is the best attempt, not a
guarantee.

Checked as well, per surah, before anything is written:

  * the ayah count is the reading's (the Madani count for Warsh and
    Qālūn, the Kufan for Ḥafṣ and Shuʿbah) and the ayahs are in order;
  * the last ayah ends inside the file.

A reciter with any surah that fails either is not written at all: a
recitation that cannot play every surah is not one the app can offer.

Output: src/quran/data/surahRecitations/<id>.json —

  {"v": 1, "id": ..., "src": <mp3quran moshaf id>, "bytes": <whole set>,
   "n": [ayahs per surah ×114],
   "b": base64 of big-endian uint24, in 10 ms: per surah, its ayahs'
        starts then the last ayah's end (n+1 values), surah after surah,
   "d": base64 of big-endian uint24, in 10 ms: each surah file's length,
   "z": base64 of big-endian uint32: each surah file's size in bytes}

The sizes are what the app checks a download against: a file of any other
size is not the recording these boundaries were measured on (damaged, cut
short, or replaced at the source), and is never cut by them.

Usage: align.py <id>:<moshaf> [<id>:<moshaf> ...]   (needs ffmpeg, curl)
"""
import base64
import concurrent.futures as cf
import json
import os
import re
import subprocess
import sys

import numpy as np

UA = "Mozilla/5.0"
SR = 8000
FRAME = 160  # 20 ms at 8 kHz, exactly — a frame that is not a whole
#              number of samples drifts the clock by seconds over a surah.
FRAME_S = FRAME / SR
MAX_MOVE = 0.75  # how far a boundary may move onto a pause, seconds
EDGE_KEEP = 0.06  # stay this far inside the pause, seconds
CONTEXT = 3.0  # seconds either side that decide what "quiet" is here
MIN_AYAH = 0.4  # no ayah is shorter than this, seconds

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "src", "quran", "data", "surahRecitations")
CACHE = os.environ.get("ALIGN_CACHE", "/tmp/surah-audio-cache")

HAFS = [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
        112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53,
        89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12,
        12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26,
        30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6]


def curl(url, path=None):
    args = ["curl", "-sfL", "-A", UA, "--retry", "3", "--max-time", "600"]
    if path:
        args += ["-o", path]
    r = subprocess.run(args + [url], capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"fetch failed: {url}")
    return r.stdout


def timings(moshaf, surah):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, f"t{moshaf}_{surah}.json")
    if not (os.path.exists(p) and os.path.getsize(p) > 2):
        curl(f"https://mp3quran.net/api/v3/ayat_timing?surah={surah}&read={moshaf}", p)
    return [x for x in json.load(open(p)) if x["ayah"] >= 1]


def envelope(url):
    """Decoded loudness, 20 ms frames, in dB — and the length in seconds."""
    r = subprocess.run(
        ["ffmpeg", "-v", "error", "-user_agent", UA, "-reconnect", "1", "-reconnect_streamed", "1",
         "-i", url, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
        capture_output=True,
    )
    if r.returncode != 0 or len(r.stdout) < SR:
        raise RuntimeError(f"decode failed: {url}")
    a = np.frombuffer(r.stdout, dtype=np.int16).astype(np.float64)
    m = len(a) // FRAME
    rms = np.sqrt((a[: m * FRAME].reshape(m, FRAME) ** 2).mean(1))
    return 20 * np.log10(rms + 1.0), len(a) / SR


def quiet_mask(db, i):
    lo, hi = max(0, i - int(CONTEXT / FRAME_S)), min(len(db), i + int(CONTEXT / FRAME_S))
    seg = db[lo:hi]
    floor, peak = np.percentile(seg, 5), np.percentile(seg, 90)
    return db[lo:hi] < floor + 0.3 * (peak - floor), lo


def snap(db, t):
    """(new boundary, placed?) for a boundary at t seconds."""
    i = int(round(t / FRAME_S))
    if i <= 0 or i >= len(db) - 1:
        return t, True
    q, lo = quiet_mask(db, i)
    reach = int(MAX_MOVE / FRAME_S)
    best = None
    k = 0
    while k < len(q):
        if not q[k]:
            k += 1
            continue
        start = k
        while k < len(q) and q[k]:
            k += 1
        end = k  # exclusive
        if end - start < 3:  # under 60 ms is a consonant, not a pause
            continue
        a, b = (lo + start) * FRAME_S, (lo + end) * FRAME_S
        d = 0.0 if a <= t <= b else min(abs(t - a), abs(t - b))
        if d <= MAX_MOVE and (best is None or d < best[0]):
            best = (d, a, b)
    if best is None:
        return t, False
    _, a, b = best
    if a <= t <= b:
        return t, True
    if t > b:  # late: into the next ayah's speech
        return max(a, b - EDGE_KEEP), True
    return min(b, a + EDGE_KEEP), True  # early: into the last ayah's speech


def uint32(values):
    out = bytearray()
    for v in values:
        if not 0 <= v < 1 << 32:
            raise ValueError(v)
        out += int(v).to_bytes(4, "big")
    return base64.b64encode(bytes(out)).decode()


def uint24(values):
    out = bytearray()
    for v in values:
        v = int(round(v * 100))
        if not 0 <= v < 1 << 24:
            raise ValueError(v)
        out += bytes([(v >> 16) & 255, (v >> 8) & 255, v & 255])
    return base64.b64encode(bytes(out)).decode()


def server_of(moshaf):
    cat = os.path.join(CACHE, "reciters.json")
    if not os.path.exists(cat):
        os.makedirs(CACHE, exist_ok=True)
        curl("https://mp3quran.net/api/v3/reciters?language=eng", cat)
    for r in json.load(open(cat))["reciters"]:
        for m in r["moshaf"]:
            if m["id"] == moshaf:
                return m["server"], m["name"]
    raise KeyError(moshaf)


def one_surah(server, moshaf, s, expected):
    t = timings(moshaf, s)
    ayahs = [x["ayah"] for x in t]
    if ayahs != list(range(1, expected + 1)):
        return s, None, f"ayah numbering {len(ayahs)} (expected {expected})"
    url = f"{server}{s:03d}.mp3"
    db, dur = envelope(url)
    size = int(re.findall(rb"(?i)content-length: (\d+)",
                          subprocess.run(["curl", "-sIL", "-A", UA, url], capture_output=True).stdout)[-1])
    starts = [x["start_time"] / 1000 for x in t]
    end = t[-1]["end_time"] / 1000
    if end > dur + 1.0:
        return s, None, f"last ayah ends {end - dur:.1f}s past the file"
    for a, b in zip(starts, starts[1:]):
        if b <= a:
            return s, None, "ayahs out of order"
    snapped, unplaced, moved = [], 0, 0
    for k, x in enumerate(starts):
        y, ok = snap(db, x)
        # A short ayah — "Ḥā Mīm", ar-Raḥmān's refrain — can have its two
        # ends reach for the same pause. A boundary only moves if it stays
        # clearly after the one before it and before the next one as
        # published; otherwise it keeps the publisher's place.
        prev = snapped[-1] if snapped else 0.0
        nxt = starts[k + 1] if k + 1 < len(starts) else end
        if not (prev + MIN_AYAH < y < nxt - MIN_AYAH):
            y, ok = x, False
        unplaced += 0 if ok else 1
        moved += 1 if abs(y - x) > 0.005 else 0
        snapped.append(y)
    for a, b in zip(snapped, snapped[1:]):
        if b <= a:
            return s, None, "ayahs out of order after alignment"
    bounds = snapped + [min(end, dur)]
    return s, dict(bounds=bounds, dur=dur, size=size, unplaced=unplaced, moved=moved), None


def run(rid, moshaf):
    server, style = server_of(moshaf)
    reading = "madani" if ("Warsh" in style or "Qalon" in style) else "kufan"
    counts = MADANI if reading == "madani" else HAFS
    results, problems = {}, []
    with cf.ThreadPoolExecutor(6) as ex:
        futs = [ex.submit(one_surah, server, moshaf, s, counts[s - 1]) for s in range(1, 115)]
        for f in cf.as_completed(futs):
            try:
                s, r, p = f.result()
            except Exception as e:  # network, decode
                problems.append(str(e))
                continue
            if p:
                problems.append(f"{s}: {p}")
            else:
                results[s] = r
    report = dict(id=rid, moshaf=moshaf, style=style, problems=sorted(problems))
    if problems or len(results) != 114:
        report["written"] = False
        print(json.dumps(report), flush=True)
        return report
    bounds, durs = [], []
    for s in range(1, 115):
        bounds += results[s]["bounds"]
        durs.append(results[s]["dur"])
    doc = {
        "v": 2,
        "id": rid,
        "src": moshaf,
        "bytes": sum(results[s]["size"] for s in range(1, 115)),
        "n": counts,
        "b": uint24(bounds),
        "d": uint24(durs),
        "z": uint32([results[s]["size"] for s in range(1, 115)]),
    }
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, f"{rid}.json"), "w") as f:
        json.dump(doc, f, separators=(",", ":"))
    total = sum(counts)
    report.update(
        written=True,
        ayahs=total,
        moved=sum(results[s]["moved"] for s in results),
        unplaced=sum(results[s]["unplaced"] for s in results),
        bytes=doc["bytes"],
    )
    print(json.dumps(report), flush=True)
    return report


def madani():
    """Ayahs per surah in the Madani count, from the app's own map."""
    path = os.path.join(ROOT, "src", "quran", "data", "madaniAyahMap.json")
    events = json.load(open(path))
    out = []
    for s in range(1, 115):
        evs = events.get(str(s), [])
        if not evs:
            out.append(HAFS[s - 1])
            continue
        # Every listed Madani ayah names its Ḥafṣ span; past the last one
        # each ayah is one file on, so the count is the last listed Madani
        # ayah plus the Ḥafṣ ayahs after its span.
        last = evs[-1]
        out.append(last[0] + (HAFS[s - 1] - last[-1]))
    return out


MADANI = madani()

if __name__ == "__main__":
    if sum(MADANI) != 6214:
        sys.exit(f"Madani count from the map is {sum(MADANI)}, not 6214")
    for arg in sys.argv[1:]:
        rid, moshaf = arg.split(":")
        run(rid, int(moshaf))
