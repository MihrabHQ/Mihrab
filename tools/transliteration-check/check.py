
import sys, json, functools, collections, difflib
from tr import *
E = load('translit.en')
import tr as _tr
HAMZA = len(sys.argv) > 2 and sys.argv[2] == 'hamza'
_tr.DROP_INITIAL_HAMZA[0] = HAMZA
KEEP = (lambda t: t) if HAMZA else (lambda t: t.replace('ʾ', ''))
def groups(words, marks):
    """every way to breathe: pauses only at waqf marks. Yields the reading for each choice, best first."""
    cuts = sorted(m for m in marks if m < len(words) - 1)
    return cuts
def best(k, E=E):
    words, marks = tokens(A[k])
    target = E[k]
    tn = [KEEP(norm(c)) for c in re.split(r'[,…]', target)]
    tn = [c for c in tn if c] or ['']
    n = len(words)
    @functools.lru_cache(None)
    def gen(i, j):   # words i..j-1 in one breath
        return KEEP(norm(translit(words[i:j], True, True)))
    import sys as _s
    _s.setrecursionlimit(10000)
    @functools.lru_cache(None)
    def f(i, c):     # can words i.. be read as chunks c..?
        if i == n: return c == len(tn)
        if c == len(tn): return False
        want = tn[c]
        for j in range(i + 1, n + 1):
            g = gen(i, j)
            if len(g) > len(want) + 4: break
            if g == want and f(j, c + 1): return True
        return False
    if f(0, 0): return None
    # no exact reading: chunk by chunk, the closest span, for the report
    i = 0; mine = []
    for c, want in enumerate(tn):
        if c == len(tn) - 1: j = n
        else:
            bestj, bestr = i + 1, -1
            for j2 in range(i + 1, n + 1):
                g = gen(i, j2)
                if len(g) > len(want) + 12: break
                r = difflib.SequenceMatcher(None, g, want).ratio()
                if r > bestr: bestj, bestr = j2, r
            j = bestj
        mine.append(gen(i, j) if j > i else ''); i = j
    return ' '.join(mine), ' '.join(tn)
if __name__ == '__main__':
    bad = {}
    for k in sorted(A):
        try:
            r = best(k)
        except Exception as e:
            r = ('ERR ' + repr(e), '')
        if r: bad[k] = r
    print('ayahs', len(A), 'exact', len(A) - len(bad), 'not exact', len(bad))
    cat = collections.Counter()
    ex = collections.defaultdict(list)
    for k, (mine, theirs) in bad.items():
        sm = difflib.SequenceMatcher(None, mine, theirs)
        for op, a0, a1, b0, b1 in sm.get_opcodes():
            if op == 'equal': continue
            key = f'{mine[a0:a1]}→{theirs[b0:b1]}'
            cat[key] += 1
            if len(ex[key]) < 3: ex[key].append((k, mine[max(0,a0-8):a1+8], theirs[max(0,b0-8):b1+8]))
    for key, n in cat.most_common(int(sys.argv[1]) if len(sys.argv) > 1 else 40):
        print(n, key, ex[key])
    json.dump({f'{k[0]}:{k[1]}': v for k, v in bad.items()}, open('bad.json', 'w'), ensure_ascii=False, indent=0)
