import sys, json, collections, difflib, re
sys.argv = [sys.argv[0], '0']
import check
from tr import *
T = load('tr.transliteration')
MAP = [('â','ā'),('î','ī'),('û','ū'),('e','a'),('ı','i'),('ü','u'),('o','u'),('ö','u'),('ḳ','q'),('c','j'),('ş','sh'),('ḫ','kh'),('ẕ','dh'),('ŝ','th'),('ż','ẓ'),('g','gh'),('v','w'),('`','ʿ'),("'",'ʾ')]
def conv(t):
    t = t.lower().replace('.', ',')
    for a, b in MAP: t = t.replace(a, b)
    return t
TE = {k: conv(v) for k, v in T.items()}
bad = {}
for k in sorted(A):
    r = check.best(k, TE)
    if r: bad[k] = r
print('Abay vs the Arabic: exact', len(A) - len(bad), 'not exact', len(bad))
cat = collections.Counter(); ex = collections.defaultdict(list)
for k, (mine, theirs) in bad.items():
    for op, a0, a1, b0, b1 in difflib.SequenceMatcher(None, mine, theirs).get_opcodes():
        if op == 'equal': continue
        key = f'{mine[a0:a1]}→{theirs[b0:b1]}'
        cat[key] += 1
        if len(ex[key]) < 3: ex[key].append((k, mine[max(0,a0-9):a1+9], theirs[max(0,b0-9):b1+9]))
for key, n in cat.most_common(45): print(n, key, ex[key])
json.dump({f'{k[0]}:{k[1]}': v for k, v in bad.items()}, open('bad_tr.json', 'w'), ensure_ascii=False, indent=0)
