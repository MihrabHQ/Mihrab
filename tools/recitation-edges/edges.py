"""
The silence at each end of every recording, and its length, for the
reciters who have it.

Usage:  python3 tools/recitation-edges/edges.py [folder ...]
        (no folders: every folder in RECITERS below)

EveryAyah cuts one file per ayah, and some reciters' cuts leave silence at
both ends — about two seconds at every join for Husary, three and a half
for Husary's mujawwad. Played one after another, that is a stop between every ayah. The
player trims it (src/quran/audio/recitationEdges.ts); this measures it.

For each file: where the sound starts and where it ends, written as the
silence before the first sound and after the last, in fiftieths of a
second (20 ms), capped at 5.08 s — one byte each. Sound is SUSTAINED sound: 10 ms
frames above -45 dBFS, four of any six in a row — so a click in the
silence (Husary 79:20 has one at 0.12 s, before half a second more of
nothing) is not taken for the first word, and the reverb's fade after the
last is kept down to -45 dB. A file with no clear silence at an end gets 0
there, so it is never trimmed on a guess. The app keeps a breath at each
end on top of this.

And the file's whole length, which nothing knows before the file plays:
the memorisation drill's "pause between repeats" rests for as long as the
ayah is recited (length less both silences; src/quran/audio/rest.ts).

Output: src/quran/data/recitationEdges/<folder>.json,
{"v":3,"e":"<base64>","d":"<base64>"}. `e`: two bytes per ayah in mushaf
order (1:1 … 114:6), lead then tail; 255,255 for a file that could not be
read (the app trims nothing there). `d`: two bytes per ayah, big-endian,
the file's length in tenths of a second; 0 where it could not be read.
Format 2 was `e` alone; the app reads both.

Measured, not derived from the quran-align word timings: those end before
the sound does in most of Husary's files (median 0.8 s, up to 3 s), and a
cut there would clip the recitation.

Resumable: progress is kept in /tmp/recitation-edges/<folder>.jsonl. A
line written by the format-2 tool has no length and is measured again, so
the first run after the lengths were added downloads every file once more
(about an hour for the eighteen reciters).
"""
import base64
import json
import os
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'src', 'quran', 'data', 'recitationEdges')
WORK = '/tmp/recitation-edges'

# Every reciter whose joins measured above ~0.4 s (lead + tail, averaged
# over ten sample ayahs); the rest cut their files tight already. Not
# Husary's Muʿallim: its long tail is the gap the learner repeats in.
RECITERS = [
    'Husary_64kbps',
    'Husary_Mujawwad_64kbps',
    'Karim_Mansoori_40kbps',
    'Abdul_Basit_Mujawwad_128kbps',
    'Minshawy_Mujawwad_192kbps',
    'Ayman_Sowaid_64kbps',
    'Abdul_Basit_Murattal_64kbps',
    'Hudhaify_128kbps',
    'Ibrahim_Akhdar_32kbps',
    'Ali_Jaber_64kbps',
    'Mahmoud_Ali_Al_Banna_32kbps',
    'warsh/warsh_ibrahim_aldosary_128kbps',
    'Minshawy_Murattal_128kbps',
    'Abdullah_Basfar_64kbps',
    'Muhammad_Ayyoub_128kbps',
    'Muhammad_Jibreel_128kbps',
    'Ahmed_Neana_128kbps',
    'warsh/warsh_yassin_al_jazaery_64kbps',
]

AYAH_COUNTS = [
    7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
    112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53,
    89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12,
    12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26,
    30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
]
assert sum(AYAH_COUNTS) == 6236

RATE = 16000
FRAME = 160  # 10 ms
WINDOW = 6
NEED = 4
THRESHOLD_DB = -45.0


def edges(path):
    """(lead, tail, length) in seconds: the sustained silence at each end
    and the whole file, or None if unreadable."""
    pcm = subprocess.run(
        ['ffmpeg', '-v', 'quiet', '-i', path, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'],
        capture_output=True).stdout
    x = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    frames = len(x) // FRAME
    if frames < WINDOW:
        return None
    duration = len(x) / RATE
    rms = np.sqrt((x[: frames * FRAME].reshape(frames, FRAME) ** 2).mean(axis=1) + 1e-12)
    loud = (20 * np.log10(rms) > THRESHOLD_DB).astype(np.int32)
    sustained = np.nonzero(np.convolve(loud, np.ones(WINDOW, dtype=np.int32), 'valid') >= NEED)[0]
    if len(sustained) == 0:
        return 0.0, 0.0, duration  # nothing clearly sounded: trim nothing
    first = sustained[0] + int(np.argmax(loud[sustained[0]:sustained[0] + WINDOW]))
    last = sustained[-1] + WINDOW - 1
    last -= int(np.argmax(loud[last - WINDOW + 1:last + 1][::-1]))
    return first * FRAME / RATE, max(0.0, duration - (last + 1) * FRAME / RATE), duration


def measure(folder, s, a):
    url = f'https://everyayah.com/data/{folder}/{s:03d}{a:03d}.mp3'
    fd, path = tempfile.mkstemp(suffix='.mp3', dir=WORK)
    os.close(fd)
    try:
        for _ in range(3):
            r = subprocess.run(['curl', '-sf', '--max-time', '120', '-o', path, url])
            if r.returncode == 0 and os.path.getsize(path) > 0:
                break
        else:
            return None
        e = edges(path)
        if e is None:
            return None
        return [min(254, round(e[0] * 50)), min(254, round(e[1] * 50)),
                min(65535, max(1, round(e[2] * 10)))]
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


def run(folder):
    os.makedirs(WORK, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    name = folder.replace('/', '_')
    progress = os.path.join(WORK, f'{name}.jsonl')
    done = {}
    if os.path.exists(progress):
        for line in open(progress):
            k, v = json.loads(line)
            if len(v) >= 3:  # a format-2 line has no length: measure again
                done[k] = v
    refs = [(s, a) for s in range(1, 115) for a in range(1, AYAH_COUNTS[s - 1] + 1)]
    todo = [r for r in refs if f'{r[0]}:{r[1]}' not in done]
    print(f'{folder}: {len(done)} done, {len(todo)} to measure', flush=True)
    with open(progress, 'a') as log, ThreadPoolExecutor(16) as ex:
        for (s, a), v in zip(todo, ex.map(lambda r: measure(folder, *r), todo)):
            if v is None:
                continue  # retried on the next run
            done[f'{s}:{a}'] = v
            log.write(json.dumps([f'{s}:{a}', v]) + '\n')
            log.flush()
    missing = [f'{s}:{a}' for s, a in refs if f'{s}:{a}' not in done]
    out = bytearray()
    lengths = bytearray()
    for s, a in refs:
        v = done.get(f'{s}:{a}', [255, 255, 0])
        out += bytes(v[:2])
        lengths += v[2].to_bytes(2, 'big')
    leads = sorted(v[0] for v in done.values())
    tails = sorted(v[1] for v in done.values())
    with open(os.path.join(OUT, f'{name}.json'), 'w') as f:
        json.dump({'v': 3, 'e': base64.b64encode(bytes(out)).decode(),
                   'd': base64.b64encode(bytes(lengths)).decode()}, f)
        f.write('\n')
    med = lambda v: v[len(v) // 2] / 50 if v else 0
    print(f'{folder}: lead median {med(leads):.2f}s, tail median {med(tails):.2f}s, '
          f'{len(missing)} unread {missing[:5]}', flush=True)


if __name__ == '__main__':
    for folder in sys.argv[1:] or RECITERS:
        run(folder)
