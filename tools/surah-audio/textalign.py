#!/usr/bin/env python3
"""
Ayah boundaries from the WORDS, not from the pauses.

align.py placed each boundary on the pause nearest mp3quran's published
time. That cannot work where a reciter runs one ayah into the next without
a breath: nothing in the audio marks the join. This aligns the recitation
against its own text instead — a speech model trained on Quran recitation
(rabah2026/wav2vec2-large-xlsr-53-arabic-quran-v_final, Apache-2.0, a
fine-tune of jonatasgrosman/wav2vec2-large-xlsr-53-arabic) hears the audio,
CTC forced alignment finds where every letter of the known text falls, and
an ayah's boundary is where its last word ends and the next one's first
word begins. The same idea as the quran-align word timings the EveryAyah
voices carry, with a model that knows tajwīd.

── EVERY BOUNDARY IS CHECKED, NOT TRUSTED ──────────────────────────────

Each boundary is measured three ways: the alignment (A), the pause nearest
it in the audio (P, the boundary the app ships today), and mp3quran's own
time (M). A boundary is CONFIRMED when the alignment agrees with the
recording — A within TOLERANCE of P, or A in a quiet stretch of the audio
— and the ayahs either side were aligned confidently. Anything else is
FLAGGED: kept at P, written to a review list with a clip of the join cut
out, for a person to listen to. The table records which is which, ayah by
ayah, so the app knows a reciter is exact only when every ayah is.

Usage:
  textalign.py <id> [--surahs 1,67,112] [--out DIR]
Needs: the ~/.mihrab-align venv (torch, torchaudio, transformers), ffmpeg.
Resumable: a surah already written to DIR is not aligned again.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import unicodedata

import numpy as np
import torch
import torchaudio.functional as F
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
TABLES = os.path.join(ROOT, "src", "quran", "data", "surahRecitations")
CACHE = os.environ.get("ALIGN_CACHE", "/tmp/surah-audio-cache")
TEXTS = os.environ.get("ALIGN_TEXTS", "/tmp/align-text")
MODEL = "rabah2026/wav2vec2-large-xlsr-53-arabic-quran-v_final"
UA = "Mozilla/5.0"

SR = 16000
HOP = 320  # samples per CTC frame: 20 ms
FRAME_S = HOP / SR
CHUNK_S = 20.0
CONTEXT_S = 2.0
BLOCK_AYAHS = 6  # ayahs aligned together; neighbours overlap by one
PAD_S = 2.5  # audio either side of a block
LEAD_S = 0.2  # a boundary sits this far before the next ayah's first sound
#              (CTC hears a sound a frame or two after it begins)
TAIL_S = 0.35  # after the last ayah's last sound
TOLERANCE_S = 0.35  # alignment and pause agree within this
BETWEEN_SLACK_S = 0.1  # a pause this close outside the aligned gap still counts as in it
MIN_CONFIDENCE = -3.0  # mean per-letter log-probability below this: not aligned at all
#   (forced alignment of elongated tajwīd letters sits around −1 to −2 when right)

QURANPEDIA = {"warsh": 4, "qalun": 7, "shubah": 9}


# ── text ───────────────────────────────────────────────────────────────

def reading_of(reciter_id):
    if "warsh" in reciter_id:
        return "warsh"
    if "qalun" in reciter_id:
        return "qalun"
    if "shubah" in reciter_id:
        return "shubah"
    return "hafs"


def ayah_texts(reading, surah):
    if reading == "hafs":
        d = json.load(open(os.path.join(ROOT, "assets", "quran", "surahs", f"{surah:03d}.json")))
        ayahs = list(d["arabic"])
        # Tanzil's text opens ayah 1 of every surah but al-Fātiḥah (where it
        # IS ayah 1) and at-Tawbah (which has none) with the basmalah. The
        # reciter says it before the ayah, not in it: aligned as part of the
        # ayah, it pulls the ayah's start back into the opening.
        if surah not in (1, 9):
            words = ayahs[0].split()
            if len(words) > 4 and words[0].startswith("بِسْمِ"):
                ayahs[0] = " ".join(words[4:])
        return ayahs
    path = os.path.join(TEXTS, f"m{QURANPEDIA[reading]}.json")
    if not os.path.exists(path):
        os.makedirs(TEXTS, exist_ok=True)
        subprocess.run(["curl", "-sfL", "-A", UA, "-o", path,
                        f"https://api.quranpedia.net/v1/mushafs/{QURANPEDIA[reading]}"], check=True)
    d = json.load(open(path))
    s = next(x for x in d["surahs"] if int(x["id"]) == surah)
    return [a["text"] for a in sorted(s["ayahs"], key=lambda a: a["number"])]


def normalise(text, vocab):
    """The muṣḥaf's spelling, as the model was taught to hear it."""
    t = unicodedata.normalize("NFC", text)
    t = t.replace("ٱ", "ا")  # wasl alef
    # Uthmani spelling leaves a final yāʾ undotted (فِى, إِنِّىٓ); the model
    # learnt it dotted. After a kasra it is a yāʾ, not an alif maqṣūrah.
    t = re.sub(r"(\u0650\u0651?)ى", lambda m: m.group(1) + "ي", t)
    t = re.sub(r"(\u0651\u0650)ى", lambda m: m.group(1) + "ي", t)
    t = re.sub(r"[ۖ-ۭؐ-ؚ]", "", t)  # pause marks, small high letters
    words = []
    for w in t.split():
        w = "".join(c for c in w if c in vocab)
        if w:
            words.append(w)
    return words


# ── audio ──────────────────────────────────────────────────────────────

def decode(url):
    r = subprocess.run(
        ["ffmpeg", "-v", "error", "-user_agent", UA, "-reconnect", "1", "-reconnect_streamed", "1",
         "-i", url, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        capture_output=True,
    )
    if r.returncode != 0 or len(r.stdout) < SR * 4:
        raise RuntimeError(f"decode failed: {url}")
    return np.frombuffer(r.stdout, dtype=np.float32).copy()


def loudness(audio):
    m = len(audio) // HOP
    rms = np.sqrt((audio[: m * HOP].reshape(m, HOP).astype(np.float64) ** 2).mean(1))
    return 20 * np.log10(rms + 1e-6)


def quiet_at(db, t):
    """Is the moment t inside a quiet stretch, judged against its own passage?"""
    i = int(round(t / FRAME_S))
    lo, hi = max(0, i - 150), min(len(db), i + 150)
    if hi - lo < 10:
        return False
    seg = db[lo:hi]
    floor, peak = np.percentile(seg, 5), np.percentile(seg, 90)
    q = db[max(0, i - 2): i + 3] < floor + 0.3 * (peak - floor)
    return bool(q.any())


def same_gap(db, a, b):
    """Are a and b in one silence — nothing voiced anywhere between them?

    The alignment puts a boundary just before the next ayah's first sound,
    the pause finder in the middle of the quiet; half a second apart in
    the same breath, they are the same boundary.
    """
    lo, hi = sorted((a, b))
    if hi - lo > 3.0:
        return False
    i, j = int(round(lo / FRAME_S)), int(round(hi / FRAME_S)) + 1
    mid = (i + j) // 2
    seg = db[max(0, mid - 150): mid + 150]
    if len(seg) < 10 or j <= i:
        return False
    floor, peak = np.percentile(seg, 5), np.percentile(seg, 90)
    return bool((db[i:j] < floor + 0.3 * (peak - floor)).all())


# ── model ──────────────────────────────────────────────────────────────

class Hearer:
    def __init__(self):
        self.device = "mps" if torch.backends.mps.is_available() else "cpu"
        self.proc = Wav2Vec2Processor.from_pretrained(MODEL)
        self.model = Wav2Vec2ForCTC.from_pretrained(MODEL).to(self.device).eval()
        self.vocab = self.proc.tokenizer.get_vocab()
        self.blank = self.proc.tokenizer.pad_token_id
        self.sep = self.vocab["|"]
        self.inv = {v: k for k, v in self.vocab.items()}

    @torch.inference_mode()
    def emissions(self, audio):
        """Log-probabilities per 20 ms frame for the whole file, in overlapping chunks."""
        n = len(audio)
        total = n // HOP
        out = np.zeros((total, len(self.vocab)), dtype=np.float32)
        step = int(CHUNK_S * SR)
        ctx = int(CONTEXT_S * SR)
        for start in range(0, n, step):
            a, b = max(0, start - ctx), min(n, start + step + ctx)
            seg = audio[a:b]
            inp = self.proc(seg, sampling_rate=SR, return_tensors="pt").input_values.to(self.device)
            logits = self.model(inp).logits[0].float()
            lp = torch.log_softmax(logits, dim=-1).cpu().numpy()
            first = (start - a) // HOP
            want = min(step, n - start) // HOP
            got = lp[first: first + want]
            f0 = start // HOP
            out[f0: f0 + len(got)] = got
            if len(got) < want:  # the model's last frame or two at the very end
                out[f0 + len(got): f0 + want] = got[-1]
        return out


# ── alignment ──────────────────────────────────────────────────────────

def align_block(hearer, em, t0, t1, ayah_words):
    """Align a run of ayahs inside [t0, t1) seconds: per ayah (start, end, confidence)."""
    f0, f1 = int(t0 / FRAME_S), min(len(em), int(t1 / FRAME_S))
    tokens, spans = [], []
    for words in ayah_words:
        if tokens:
            tokens.append(hearer.sep)
        first = len(tokens)
        for k, w in enumerate(words):
            if k:
                tokens.append(hearer.sep)
            tokens.extend(hearer.vocab[c] for c in w)
        spans.append((first, len(tokens)))
    if f1 - f0 < len(tokens) + 2:
        return None
    lp = torch.from_numpy(em[f0:f1]).unsqueeze(0)
    tg = torch.tensor([tokens], dtype=torch.int32)
    path, scores = F.forced_align(lp, tg, blank=hearer.blank)
    path, scores = path[0].numpy(), scores[0].numpy()
    # Frames of each target token, in order: a token starts where the path
    # first emits it after the previous token.
    pos = np.full(len(tokens), -1)
    endp = np.full(len(tokens), -1)
    logp = np.zeros(len(tokens))
    j, prev = -1, hearer.blank
    for f, (tok, sc) in enumerate(zip(path, scores)):
        if tok != hearer.blank and (tok != prev or prev == hearer.blank):
            j += 1
            if j >= len(tokens):
                break
            pos[j] = f
            logp[j] = sc
        if tok != hearer.blank and j >= 0:
            endp[j] = f
        prev = tok
    if (pos < 0).any():
        return None
    out = []
    for a, b in spans:
        idx = [k for k in range(a, b) if tokens[k] != hearer.sep]
        s = (f0 + pos[idx[0]]) * FRAME_S
        e = (f0 + endp[idx[-1]] + 1) * FRAME_S
        out.append((s, e, float(np.mean(logp[idx]))))
    return out


# ── THE JUDGE: does the audio say what the text says, either side? ────

HARAKAT = re.compile(r"[\u064B-\u0652\u0670\u06E5\u06E6\u0653-\u0655]")


def letters(s):
    return HARAKAT.sub("", s).replace("|", " ").replace(" ", "")


def heard(hearer, em, t0, t1):
    """What the model hears between two moments, as bare letters."""
    f0, f1 = max(0, int(t0 / FRAME_S)), min(len(em), int(t1 / FRAME_S))
    if f1 <= f0:
        return ""
    ids = em[f0:f1].argmax(1)
    inv = hearer.inv
    out, prev = [], None
    for i in ids:
        if i != prev and i != hearer.blank:
            out.append(inv.get(int(i), ""))
        prev = i
    return letters("".join(out))


def similar(a, b):
    import difflib
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


JUDGE_S = 2.0
JUDGE_LETTERS = 9
JUDGE_PASS = 1.4  # both sides at least ~0.7 alike
JUDGE_MARGIN = 0.25
JUDGE_FAIR = 0.9  # ... or at least ~0.45 alike each side,
JUDGE_WIDE = 0.5  # against rivals well behind
NEAR_S = 0.75  # alignment and pause this close, ...
NEAR_PASS = 1.0  # ... and the pause's words check out: the pause stands


def judge(hearer, em, t, prev_words, next_words):
    """How well the moment t sits between two ayahs: 0..2."""
    nxt = letters("".join(next_words))[:JUDGE_LETTERS]
    prv = letters("".join(prev_words))[-JUDGE_LETTERS:]
    after = heard(hearer, em, t, t + JUDGE_S)[: len(nxt) + 2]
    before = heard(hearer, em, t - JUDGE_S, t)[-(len(prv) + 2):]
    return similar(after, nxt) + similar(before, prv)


def boundary(prev_end, next_start):
    if next_start <= prev_end:
        return next_start
    return max(prev_end, next_start - LEAD_S)


def read_table(reciter_id):
    import base64
    d = json.load(open(os.path.join(TABLES, f"{reciter_id}.json")))
    b = base64.b64decode(d["b"])
    flat = [int.from_bytes(b[i:i + 3], "big") / 100 for i in range(0, len(b), 3)]
    out, at = [], 0
    for n in d["n"]:
        out.append(flat[at: at + n + 1])
        at += n + 1
    return d, out


def server_of(moshaf):
    cat = os.path.join(CACHE, "reciters.json")
    for r in json.load(open(cat))["reciters"]:
        for m in r["moshaf"]:
            if m["id"] == moshaf:
                return m["server"]
    raise KeyError(moshaf)


def published(moshaf, surah):
    p = os.path.join(CACHE, f"t{moshaf}_{surah}.json")
    if not os.path.exists(p):
        subprocess.run(["curl", "-sfL", "-A", UA, "-o", p,
                        f"https://mp3quran.net/api/v3/ayat_timing?surah={surah}&read={moshaf}"], check=True)
    return [x for x in json.load(open(p)) if x["ayah"] >= 1]


def align_surah(hearer, reciter_id, table, bounds, surah):
    reading = reading_of(reciter_id)
    texts = ayah_texts(reading, surah)
    P = bounds[surah - 1]  # shipped: n starts + last end
    n = len(P) - 1
    if len(texts) != n:
        return {"surah": surah, "error": f"text has {len(texts)} ayahs, table {n}"}
    words = [normalise(t, hearer.vocab) for t in texts]
    M = [x["start_time"] / 1000 for x in published(table["src"], surah)]
    url = f"{server_of(table['src'])}{surah:03d}.mp3"
    t_audio = time.time()
    audio = decode(url)
    dur = len(audio) / SR
    t_model = time.time()
    em = hearer.emissions(audio)
    t_align = time.time()
    db = loudness(audio)

    # ── WHERE EACH BOUNDARY IS TAKEN FROM ──────────────────────────────
    #
    # A block is aligned with PAD_S of audio either side, and that padding
    # holds the end of the ayah before the block and the start of the one
    # after. The aligner hangs those sounds on the block's first and last
    # ayahs, so their OUTER ends are not to be believed. A join between two
    # ayahs is therefore taken only from a block that holds both of them —
    # blocks overlap by one ayah, so every join has one. The surah's own
    # first start and last end come from the first and last block, and are
    # checked on their own terms below.
    starts = [None] * n
    ends = [None] * n
    conf = [None] * n
    join = [None] * (n + 1)  # join[i]: (end of ayah i-1, start of ayah i)
    k = 0
    while k < n:
        j = min(n, k + BLOCK_AYAHS)
        t0 = max(0.0, P[k] - PAD_S)
        t1 = min(dur, P[j] + PAD_S)
        res = align_block(hearer, em, t0, t1, words[k:j])
        if res is None and j - k > 2:
            # Narrower: two ayahs at a time keeps every join inside a block.
            res = []
            for q in range(k, j - 1):
                r2 = align_block(hearer, em, max(0, P[q] - PAD_S), min(dur, P[q + 2] + PAD_S), words[q:q + 2])
                if r2:
                    join[q + 1] = (r2[0][1], r2[1][0])
                    if conf[q] is None:
                        conf[q] = r2[0][2]
                    conf[q + 1] = r2[1][2]
                    if q == 0:
                        starts[0] = r2[0][0]
                    if q + 1 == n - 1:
                        ends[n - 1] = r2[1][1]
            res = None
        if res:
            for q, (s_, e_, c_) in zip(range(k, j), res):
                # Confidence from the block where the ayah is not at an edge,
                # when there is one.
                inner = (k < q < j - 1) or (q == 0 and k == 0) or (q == n - 1 and j == n)
                if conf[q] is None or inner:
                    conf[q] = c_
                if q > k:
                    join[q] = (res[q - k - 1][1], s_)
            if k == 0:
                starts[0] = res[0][0]
            if j == n:
                ends[n - 1] = res[-1][1]
        k = j - 1 if j < n else n

    # Boundaries: b0 = first ayah's start, b_i between ayah i-1 and i, b_n the end.
    A, status = [], []
    for i in range(n + 1):
        if i == 0:
            a = None if starts[0] is None else max(0.0, starts[0] - LEAD_S)
        elif i == n:
            a = None if ends[n - 1] is None else min(dur, ends[n - 1] + TAIL_S)
        else:
            a = None if join[i] is None else boundary(join[i][0], join[i][1])
        sure = a is not None
        if sure:
            near_side = [c for c in (conf[i - 1] if i > 0 else None, conf[i] if i < n else None) if c is not None]
            sure = all(c >= MIN_CONFIDENCE for c in near_side)
        if sure and 0 < i < n:
            # Agreeing with the pause is enough. Landing in some OTHER quiet
            # spot is not on its own — a repeated phrase leaves pauses too —
            # unless mp3quran's own time agrees; otherwise the judge decides.
            sure = abs(a - P[i]) <= TOLERANCE_S or same_gap(db, a, P[i]) or (
                quiet_at(db, a) and i < len(M) and abs(a - M[i]) <= TOLERANCE_S)
            if not sure and quiet_at(db, P[i]) and \
                    join[i][0] - BETWEEN_SLACK_S <= P[i] <= join[i][1] + BETWEEN_SLACK_S:
                # The pause sits between the aligned end of one ayah's words
                # and the aligned start of the next: nothing of either is on
                # the wrong side of it. A reciter who breathes audibly before
                # an ayah (Al-Dosari, a second and more) leaves the two a
                # breath apart, never in "the same silence", and the pause —
                # the earlier, in real quiet — is the one that loses nothing.
                a, sure = P[i], True
        if i == 0 and not (sure and abs(a - P[0]) <= TOLERANCE_S):
            # The opening — taʿawwudh, basmalah — is not in the ayah text, and
            # the alignment can take its last word for the first ayah's. The
            # pause after the opening is the better witness: a shipped start
            # in real silence stands.
            if quiet_at(db, P[0]):
                a, sure = P[0], True
            else:
                sure = False
        if sure and i == n:
            sure = ends[n - 1] is not None and a >= ends[n - 1]
            # Never end the last ayah earlier than the pause did: trailing
            # quiet costs nothing, a clipped last word does.
            a = max(a, P[n])
        A.append(a if a is not None else P[i])
        status.append("ok" if sure else "flag")
    # ── FLAGGED, THEN JUDGED ────────────────────────────────────────
    # Where the alignment and the pause disagree, or the alignment was
    # unsure, every candidate — the alignment's, the pause's, mp3quran's —
    # is asked what comes after it and before it. The one whose next two
    # seconds begin with the next ayah's first words and whose last two end
    # with the previous ayah's last words wins, if it wins clearly; a near
    # tie stays flagged for a person.
    judged = [None] * (n + 1)
    for i in range(1, n):
        if status[i] == "ok":
            continue
        cands = {"aligned": A[i], "pause": P[i]}
        if i < len(M):
            cands["published"] = M[i]
        scores = {k: judge(hearer, em, t, words[i - 1], words[i]) for k, t in cands.items()}
        best = max(scores, key=scores.get)
        others = [v for k, v in scores.items() if k != best and abs(cands[k] - cands[best]) > TOLERANCE_S]
        margin = scores[best] - (max(others) if others else 0.0)
        judged[i] = {"scores": {k: round(v, 2) for k, v in scores.items()}, "best": best}
        clear = scores[best] >= JUDGE_PASS and (not others or margin >= JUDGE_MARGIN)
        # A weaker match still wins against candidates that plainly hear
        # the wrong words.
        clear = clear or (others and scores[best] >= JUDGE_FAIR and margin >= JUDGE_WIDE)
        if not clear and abs(A[i] - P[i]) <= NEAR_S and scores["pause"] >= NEAR_PASS and quiet_at(db, P[i]):
            # Within a breath of each other, and the words either side of
            # the pause check out: the pause, in its silence, stands.
            best, clear = "pause", True
        if clear:
            A[i] = cands[best]
            status[i] = "ok"
            judged[i]["resolved"] = True

    # A boundary must still run forward: anything out of order is flagged
    # and falls back to the shipped one.
    for i in range(1, n + 1):
        if A[i] <= A[i - 1] + 0.2:
            status[i] = "flag"
    final = [A[i] if status[i] == "ok" else P[i] for i in range(n + 1)]
    # Out of order once mixed with the pauses: BOTH sides go back to the
    # pauses and are flagged — either may be the wrong one. Al-Sharh 5–6
    # are the same words twice; the alignment put the end of 5 at the end
    # of 6, five seconds late, and 6 alone falling back left 5 wrong.
    changed = True
    while changed:
        changed = False
        for i in range(1, n + 1):
            if final[i] <= final[i - 1]:
                for k in (i - 1, i):
                    if final[k] != P[k] or status[k] != "flag":
                        final[k] = P[k]
                        status[k] = "flag"
                        changed = True
    # Two ayahs that are the same words: the alignment cannot tell which
    # is which, so the boundaries around them are never "confirmed".
    for i in range(n - 1):
        if words[i] == words[i + 1]:
            for k in (i, i + 1, i + 2):
                if status[k] == "ok" and abs(final[k] - P[k]) > TOLERANCE_S:
                    final[k] = P[k]
                    status[k] = "flag"
    return {
        "surah": surah,
        "dur": dur,
        "bounds": final,
        "aligned": A,
        "shipped": P,
        "published": M,
        "status": status,
        "confidence": conf,
        "judged": judged,
        "timing": {
            "decode": t_model - t_audio,
            "model": t_align - t_model,
            "align": time.time() - t_align,
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("reciter")
    ap.add_argument("--surahs", default="")
    ap.add_argument("--out", default="/tmp/align-out")
    args = ap.parse_args()
    table, bounds = read_table(args.reciter)
    surahs = [int(x) for x in args.surahs.split(",") if x] or list(range(1, 115))
    out = os.path.join(args.out, args.reciter)
    os.makedirs(out, exist_ok=True)
    hearer = Hearer()
    for s in surahs:
        path = os.path.join(out, f"{s:03d}.json")
        if os.path.exists(path):
            continue
        t = time.time()
        try:
            res = align_surah(hearer, args.reciter, table, bounds, s)
        except Exception as e:  # one bad surah is reported, not fatal
            res = {"surah": s, "error": str(e)}
        res["wall"] = time.time() - t
        with open(path, "w") as f:
            json.dump(res, f)
        if "error" in res:
            print(json.dumps({"surah": s, "error": res["error"]}), flush=True)
        else:
            flags = res["status"].count("flag")
            print(json.dumps({"surah": s, "ayahs": len(res["status"]) - 1, "flagged": flags,
                              "audio_s": round(res["dur"]), "wall_s": round(res["wall"], 1)}), flush=True)


if __name__ == "__main__":
    sys.exit(main())
