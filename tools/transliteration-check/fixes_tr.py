# Abay's Turkish: the places with a wrong letter, length or word, put right in his own spelling,
# and each proved against the Arabic by the same check that found it.
import sys, json, re, difflib
sys.argv = [sys.argv[0], '0']
import check
from tr import load, A
T = load('tr.transliteration')
MAP = [('â','ā'),('î','ī'),('û','ū'),('e','a'),('ı','i'),('ü','u'),('o','u'),('ö','u'),('ḳ','q'),('c','j'),('ş','sh'),('ḫ','kh'),('ẕ','dh'),('ŝ','th'),('ż','ẓ'),('g','gh'),('v','w'),('`','ʿ'),("'",'ʾ')]
def conv(t):
    t = t.lower().replace('.', ',')
    for a, b in MAP: t = t.replace(a, b)
    return t
CONV = [r'^→h[ūī]$', r'^h(uwa?|iya)→$', r'^h→t(un|an|in|i|a|u|ā)?$', r'^t→h$', r'^→(un|in|an|a|i|u|ī|ah)$', r'^ā→(an)?$', r'^(i|u|um)→$', r'^iy→ī$', r'^[ūī]→$', r'^→ $', r'^ →$', r'^uw→ū$', r'^→$']
def places(k, text):
    r = check.best(k, {k: conv(text)})
    if not r: return []
    m, t = r; out = []
    for op, a0, a1, b0, b1 in difflib.SequenceMatcher(None, m, t, autojunk=False).get_opcodes():
        if op == 'equal': continue
        tok = f'{m[a0:a1]}→{t[b0:b1]}'
        if any(re.match(p, tok) for p in CONV): continue
        out.append((tok, m[max(0,a0-8):a1+7], t[max(0,b0-8):b1+7]))
    return out
OK15 = {(2,72),(3,37),(6,19),(7,189),(7,196),(10,89),(21,88),(25,49),(27,22),(32,7),(41,44),(45,32),(46,4),(46,33),(75,40)}
LEN23 = {(3,81),(6,163),(7,68),(7,143),(10,41),(10,90),(11,35),(11,72),(12,59),(12,72),(21,56),(21,92),(23,52),(26,20),(40,42),(43,81),(60,1),(2,179),(2,197),(5,100),(59,2),(65,10),(18,38)}
exec(open('fixes_tr_table.py').read())
bad = {tuple(map(int, k.split(':'))) for k in json.load(open('bad_tr.json'))}
toread = {k for k in bad if places(k, T[k])}
want = toread - OK15 - LEN23
print('to read', len(toread), 'to correct', len(want), 'with a fix', len({(s, a) for s, a, _, _ in F}))
print('no fix yet:', sorted(want - {(s, a) for s, a, _, _ in F}))
print('fix not wanted:', sorted({(s, a) for s, a, _, _ in F} - want))
ok = True; fixed = dict(T)
for s, a, f, t in F:
    k = (s, a)
    if fixed[k].count(f) != 1: print('COUNT', k, f, fixed[k].count(f)); ok = False; continue
    fixed[k] = fixed[k].replace(f, t)
allowed = {(27,36): 1}   # the derivation's own limit there (ātāniya), which Abay has right
for k in sorted({(s, a) for s, a, _, _ in F}):
    left = places(k, fixed[k])
    if len(left) > allowed.get(k, 0): print('LEFT', k, left, '::', fixed[k][:0]); ok = False
print('ALL OK' if ok else 'FAIL')
if len(sys.argv) > 1 and sys.argv[-1] == 'words':
    corpus = ' '.join(v for v in T.values())
    for s, a, f, t in F:
        fw, tw = f.split(' '), t.split(' ')
        for x, y in zip(fw, tw):
            if x != y:
                core = re.sub(r'^[^-]*-', '', y).strip('.,')
                n = len(re.findall(re.escape(core[:max(5, len(core) - 3)]), corpus))
                print(f'{s}:{a}  {x} → {y}   [{core[:max(5, len(core)-3)]}: {n} elsewhere]')
json.dump([[s, a, f, t] for s, a, f, t in F], open('corrections_tr.json', 'w'), ensure_ascii=False, indent=0)
