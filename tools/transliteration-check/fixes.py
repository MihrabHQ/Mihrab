import sys, json, re
sys.argv = [sys.argv[0], '0', 'hamza']
import check, tr
from tr import load
E = load('translit.en'); I = load('translit.id-skb'); S = load('translit.en-simple')
A = check.A
# the two marks the generator did not know (found through the Turkish edition)
A[(27,36)] = A[(27,36)].replace('ءَاتَىٰنِۦَ', 'ءَاتَىٰنِىَ'); A[(21,88)] = A[(21,88)].replace('نُۨجِى', 'نُنْجِى')
F = {  # (surah, ayah): en-from, en-to, id-from, id-to, simple-from, simple-to, kind
 (7,196): ('waliyyillāhul', 'waliyyiyallāhul', None, None, 'waliyyillaahul', 'waliyyiyallaahul', 'word'),
 (21,71): ('bāraknʾa', 'bāraknā', "bārakn'a", 'bāraknā', "baarakn'a", 'baaraknaa', 'word'),
 (21,88): ('nujil-', 'nunjil-', None, None, None, None, 'word'),
 (25,49): ('Linuḥyi bihī', 'Linuḥyiya bihī', None, None, 'Linuhyi bihee', 'Linuhyiya bihee', 'word'),
 (26,14): ('dhambum fa', 'dhambun fa', 'żambum fa', 'żambun fa', None, None, 'word'),
 (27,36): ('ātānillāhu', 'ātāniyallāhu', None, None, 'aataanillaahu', 'aataaniyallaahu', 'word'),
 (46,33): ('yuḥyil-', 'yuḥyiyal-', None, None, 'yuhyil-', 'yuhyiyal-', 'word'),
 (59,7): ('fantah,', 'fantahū,', None, None, 'fantah,', 'fantahoo,', 'word'),
 (75,40): ('yuḥyil-', 'yuḥyiyal-', None, None, 'yuhyil-', 'yuhyiyal-', 'word'),
 (81,9): ('dhambim qutilat', 'dhambin qutilat', 'żambim qutilat', 'żambin qutilat', None, None, 'word'),
 (2,96): ('ḥayātin waminal', 'ḥayātiw waminal', None, None, 'hayaatin waminal', 'hayaatiw waminal', 'join'),
 (3,30): ('muḥḍaran wamā', 'muḥḍaraw wamā', None, None, 'muhdaran wamaa', 'muhdaraw wamaa', 'join'),
 (3,112): ('nal-anbiyāʾa', 'nal-ambiyāʾa', "nal-anbiyā'a", "nal-ambiyā'a", "nal-anbiyaa'a", "nal-ambiyaa'a", 'join'),
 (74,40): ('jannātin yatasā', 'jannātiy yatasā', None, None, 'jannaatin yatasaa', 'jannaatiy yatasaa', 'join'),
}
out = {'translit.en': [], 'translit.id-skb': [], 'translit.en-simple': []}
import respelt_id as layerC
def to_simple(t):
    for a, b in [('ā','aa'),('ī','ee'),('ū','oo'),('Ā','Aa'),('Ī','Ee'),('Ū','Oo'),('ē','e'),('ḥ','h'),('Ḥ','H'),('ṣ','s'),('Ṣ','S'),('ḍ','d'),('Ḍ','D'),('ṭ','t'),('Ṭ','T'),('ẓ','z'),('Ẓ','Z'),('ʿ','`'),('ʾ',"'")]: t = t.replace(a, b)
    return t
n = lambda t: re.sub(r"[\s\-.,…]", '', t).lower()
ok = True
for k, (ef, et, if_, it, sf, st, kind) in sorted(F.items()):
    if_ = if_ or ef; it = it or et; sf = sf or ef; st = st or et
    for D, f, t, name in ((E, ef, et, 'translit.en'), (I, if_, it, 'translit.id-skb'), (S, sf, st, 'translit.en-simple')):
        assert D[k].count(f) == 1, (k, name, f)
        D[k] = D[k].replace(f, t)
        out[name].append({'surah': k[0], 'ayah': k[1], 'from': f, 'to': t, 'kind': kind})
    r = check.best(k, E)
    a = r is None; b = layerC.canon(E[k], 0) == layerC.canon(I[k], 1); c = n(to_simple(E[k])) == n(S[k])
    print(k, 'arabic', a, 'id', b, 'simple', c, '' if a else r)
    ok &= a and b and c
print('ALL OK' if ok else 'FAIL')
json.dump(out, open('corrections.json', 'w'), ensure_ascii=False, indent=1)
