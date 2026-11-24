import re, collections, difflib, json
from tr import load
E = load('translit.en'); I = load('translit.id-skb')
def canon(t, idn):
    t = t.lower()
    if not idn:
        for a, b in [('th','ṡ'),('dh','ż'),('sh','sy'),('gh','g'),('ʿ','‘'),('ʾ',"")]: t = t.replace(a, b)
    t = re.sub(r"[\s\-.,…']", '', t)
    return t.replace('w','u').replace('y','i')
bad = [k for k in E if canon(E[k], 0) != canon(I[k], 1)]
print('id-skb = en, letter for letter (w/u, y/i and hamza folded):', len(E) - len(bad), 'of', len(E))
cat = collections.Counter(); ex = {}
for k in bad:
    a, b = canon(E[k], 0), canon(I[k], 1)
    for op, a0, a1, b0, b1 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if op != 'equal':
            key = (a[max(0,a0-4):a1+4], b[max(0,b0-4):b1+4]); cat[key] += 1; ex.setdefault(key, k)
for (a, b), c in cat.most_common(80): print('  ', c, a, '→', b, ex[(a, b)])
print('kinds', len(cat))
