"""
Which Hafs ayah numbers each ayah of the Madani count is recited in.

Usage:  python3 tools/qiraat/ayah_map.py /tmp/qp-4.json

Writes src/quran/data/madaniAyahMap.json for `src/quran/riwayahAudio.ts`.

Every recording the app streams is cut and numbered by the Hafs (Kufan)
count, Warsh's included: EveryAyah's Warsh folders hold 079046.mp3 and no
005121.mp3. Warsh and Qalun divide the text by the Madani count, so their
79:38 is Hafs 79:39 and their 79:37 is two files. This file is that
correspondence, read from Quranpedia's `number_in_hafs` (Warsh and Qalun
agree on it ayah for ayah; Shu'bah counts as Hafs does and needs none).

Format: {surah: [[ayah, firstHafs, lastHafs?], ...]} listing only the
ayahs that are NOT simply "the Hafs ayah after the previous one's last".
Every ayah not listed is recited in exactly that one file. A list of two
numbers is one file that is not the next one (a split: the file is
shared with the ayah before); three numbers is a run of files (a merge).
"""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'src', 'quran', 'data', 'madaniAyahMap.json')


def spans(path):
    with open(path, encoding='utf-8') as f:
        d = json.load(f)
    out = {}
    for s in d['surahs']:
        ayahs = sorted(s['ayahs'], key=lambda a: int(a['number']))
        rows = []
        for a in ayahs:
            h = a['number_in_hafs']
            h = [int(x) for x in (h if isinstance(h, list) else [h])]
            assert h == list(range(h[0], h[-1] + 1)), (s['id'], a['number'], h)
            rows.append(h)
        out[int(s['id'])] = rows
    return out


def main(path):
    table = spans(path)
    events = {}
    for s, rows in table.items():
        prev, ev = 0, []
        for i, h in enumerate(rows, 1):
            if not (len(h) == 1 and h[0] == prev + 1):
                ev.append([i, h[0], h[-1]] if len(h) > 1 else [i, h[0]])
            prev = h[-1]
        if ev:
            events[str(s)] = ev
    # Read it back the way the app does, and refuse to write anything else.
    for s, rows in table.items():
        given = {e[0]: e for e in events.get(str(s), [])}
        prev, back = 0, []
        for i in range(1, len(rows) + 1):
            e = given.get(i)
            r = list(range(e[1], e[-1] + 1)) if e else [prev + 1]
            back.append(r)
            prev = r[-1]
        assert back == rows, s
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(events, f, separators=(',', ':'))
        f.write('\n')
    print(f'{sum(len(v) for v in events.values())} irregular ayahs in {len(events)} surahs → {OUT}')


if __name__ == '__main__':
    main(sys.argv[1])
