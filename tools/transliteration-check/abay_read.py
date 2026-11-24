import json, difflib, re
from tr import load
T = load('tr.transliteration')
b = json.load(open('bad_tr.json'))
CONV = [r'^→h[ūī]$', r'^h(uwa?|iya)→$', r'^h→t(un|an|in|i|a|u|ā)?$', r'^t→h$', r'^→(un|in|an|a|i|u|ī|ah)$', r'^ā→(an)?$', r'^(i|u|um)→$', r'^iy→ī$', r'^[ūī]→$', r'^→ $', r'^ →$', r'^uw→ū$', r'^→$']
rest = []; nconv = 0
for k, (m, t) in b.items():
    ds = []
    for op, a0, a1, b0, b1 in difflib.SequenceMatcher(None, m, t, autojunk=False).get_opcodes():
        if op == 'equal': continue
        tok = f'{m[a0:a1]}→{t[b0:b1]}'
        if any(re.match(p, tok) for p in CONV): continue
        ds.append((tok, m[max(0,a0-8):a1+7], t[max(0,b0-8):b1+7], b0 / max(1, len(t))))
    if not ds: nconv += 1; continue
    s, a = map(int, k.split(':')); o = T[(s, a)]
    for tok, mm, tt, pos in ds:
        c = int(pos * len(o)); rest.append(f'{k} [{tok}] {mm} / {tt} :: …{o[max(0,c-28):c+30]}…')
print('convention only:', nconv, 'ayahs; to read:', len(b) - nconv, 'ayahs,', len(rest), 'places')
print('\n'.join(rest))
