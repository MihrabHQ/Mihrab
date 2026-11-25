# Abay's short vowels: e or a for a fatḥah, ü or u for a ḍammah — which he writes beside which
# consonant, counted over the ayahs the check found exact, and each corrected word held to it.
import json, re, collections, difflib
from tr import load
T = load('tr.transliteration')
exec(open('fixes_tr_table.py').read())
bad = {tuple(map(int, k.split(':'))) for k in json.load(open('bad_tr.json'))}
good = [v.lower() for k, v in T.items() if k not in bad]
PAIRS = {'e': 'ea', 'a': 'ea', 'ü': 'üu', 'u': 'üu'}
prev = collections.defaultdict(collections.Counter); both = collections.defaultdict(collections.Counter)
def ctx(t, i):
    j = i - 1
    while j >= 0 and t[j] in "-' ": j -= 1
    p = t[j] if j >= 0 else '^'
    j = i + 1
    while j < len(t) and t[j] in "-' ": j += 1
    n = t[j] if j < len(t) else '$'
    return p, n
for t in good:
    for i, c in enumerate(t):
        if c in PAIRS:
            p, n = ctx(t, i); prev[(PAIRS[c], p)][c] += 1; both[(PAIRS[c], p, n)][c] += 1
print('counted over', len(good), 'ayahs')
flags = 0; looked = 0
for s, a, f, t in F:
    fl, tl = f.lower(), t.lower()
    sm = difflib.SequenceMatcher(None, fl, tl, autojunk=False)
    touched = set()
    for op, a0, a1, b0, b1 in sm.get_opcodes():
        if op != 'equal': touched.update(range(max(0, b0 - 2), min(len(tl), b1 + 2)))
    for i in sorted(touched):
        c = tl[i]
        if c not in PAIRS: continue
        p, n = ctx(tl, i); looked += 1
        cb = both[(PAIRS[c], p, n)]; cp = prev[(PAIRS[c], p)]
        use = cb if sum(cb.values()) >= 8 else cp
        tot = sum(use.values())
        if not tot: print(f'{s}:{a} {t!r}: {p}{c}{n} — never seen'); flags += 1; continue
        share = use[c] / tot
        if share < 0.5:
            other = [x for x in PAIRS[c] if x != c][0]
            print(f'{s}:{a}  {f} → {t}   "{p}{c}{n}": he writes {c} {use[c]}/{tot}, {other} {use[other]}/{tot}' + ('  (by both neighbours)' if use is cb else '  (by the consonant before)'))
            flags += 1
print('vowels looked at', looked, 'against his habit', flags)
