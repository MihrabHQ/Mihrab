# The Indonesian and plain-English editions are the scholarly one respelt: prove it, ayah by ayah.
import re, unicodedata, collections
from tr import load
E = load('translit.en'); S = load('translit.en-simple')
def to_simple(t):
    for a, b in [('ā','aa'),('ī','ee'),('ū','oo'),('Ā','Aa'),('Ī','Ee'),('Ū','Oo'),('ē','e'),('ḥ','h'),('Ḥ','H'),('ṣ','s'),('Ṣ','S'),('ḍ','d'),('Ḍ','D'),('ṭ','t'),('Ṭ','T'),('ẓ','z'),('Ẓ','Z'),('ʿ','`'),('ʾ',"'")]: t = t.replace(a, b)
    return t
def n(t): return re.sub(r"[\s\-.,…]", '', t).lower()
badS = [k for k in E if n(to_simple(E[k])) != n(S[k])]
print('en-simple is en respelt in', len(E) - len(badS), 'of', len(E))
for k in badS[:12]: print(' ', k, '\n    ', to_simple(E[k])[:150], '\n    ', S[k][:150])
