# An independent reading of the Arabic (Tanzil Uthmani, Hafs) into the scholarly
# Latin spelling, to check risan/quran-json's generated text against.
import json, re, sys, unicodedata, functools, difflib, collections
A = {tuple(map(int, k.split(':'))): v for k, v in json.load(open('arabic.json')).items()}
BASMALAH = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ '
for k in list(A):
    if k[1] == 1 and k[0] not in (1, 9):
        ws = A[k].split(' ')
        assert ws[0].replace('ّ','').startswith('بِسْمِ') or ws[0].startswith('بِّسْمِ'), k
        A[k] = ' '.join(ws[4:])
def load(ed):
    out = {}
    for s in range(1, 115):
        j = json.load(open(f'{ed}/{s}.json'))
        if 'verses' in j:
            for v in j['verses']: out[(s, v['id'])] = v['transliteration']
        else:
            for a in j['data']['ayahs']: out[(s, a['numberInSurah'])] = a['text']
    return out
CONS = {'ء':'ʾ','أ':'ʾ','ؤ':'ʾ','إ':'ʾ','ئ':'ʾ','ب':'b','ت':'t','ة':'T','ث':'th','ج':'j','ح':'ḥ','خ':'kh','د':'d','ذ':'dh','ر':'r','ز':'z','س':'s','ش':'sh','ص':'ṣ','ض':'ḍ','ط':'ṭ','ظ':'ẓ','ع':'ʿ','غ':'gh','ف':'f','ق':'q','ك':'k','ل':'l','م':'m','ن':'n','ه':'h','و':'w','ي':'y','ى':'y'}
FATHA, DAMMA, KASRA, FATHATAN, DAMMATAN, KASRATAN, SHADDA, SUKUN, MADDA, HAMZA_ABOVE, DAGGER = 'َ','ُ','ِ','ً','ٌ','ٍ','ّ','ْ','ٓ','ٔ','ٰ'
SILENT, RECT, HIGH_MEEM, LOW_MEEM, SMALL_WAW, SMALL_YEH, SMALL_SEEN = '۟','۠','ۢ','ۭ','ۥ','ۦ','ۜ'
MARKS = set([FATHA,DAMMA,KASRA,FATHATAN,DAMMATAN,KASRATAN,SHADDA,SUKUN,MADDA,HAMZA_ABOVE,DAGGER,SILENT,RECT,HIGH_MEEM,LOW_MEEM,SMALL_SEEN,'ۣ','ۨ','۪','۫','۬'])
WAQF = set('ۖۗۘۙۚۛ')
DROP = set('۞۩')
def letters(word):
    """[(letter, marks)] — tatweel+hamza-above is a hamza; small waw/yeh are letters of their own."""
    out = []
    for c in word:
        if c in MARKS:
            if out: out[-1][1].append(c)
        elif c == 'ـ': out.append(['ـ', []])
        else: out.append([c, []])
    res = []
    for l, m in out:
        if l == 'ـ':
            if HAMZA_ABOVE in m: res.append(('ء', [x for x in m if x != HAMZA_ABOVE]))
            elif DAGGER in m and res: res[-1][1].append(DAGGER)   # a dagger alif on a tatweel
            continue
        if HAMZA_ABOVE in m and l in 'اوىي':    # a seat with a hamza written above
            res.append(('ء', [x for x in m if x != HAMZA_ABOVE])); continue
        res.append((l, m))
    return res
def tokens(ayah):
    """words, and after which words a waqf mark stands"""
    words, marks = [], set()
    for w in ayah.split(' '):
        w = ''.join(c for c in w if c not in DROP)
        if not w: continue
        if all(c in WAQF or c in MARKS for c in w):
            if words: marks.add(len(words) - 1)
            continue
        if any(c in WAQF for c in w):
            w = ''.join(c for c in w if c not in WAQF); marks.add(len(words))
        words.append(w)
    return words, marks
MUQ = {'ا':'alif','ل':'lām','م':'mīm','ص':'ṣād','ر':'rā','ك':'kāf','ه':'hā','ي':'yā','ع':'ʿayn','ط':'ṭā','س':'sīn','ح':'ḥā','ق':'qāf','ن':'nūn'}
def is_muq(w):
    L = letters(w)
    if w in ('طه', 'يسٓ', 'طسٓ', 'حمٓ', 'طسٓمٓ', 'صٓ', 'قٓ', 'نٓ'): return True
    return len(L) <= 5 and any(MADDA in m for _, m in L) and all(not (set(m) - {MADDA}) for _, m in L) and all(l in MUQ for l, _ in L)
def first_cons(L):
    """the first sounded letter of a word and its marks, past a hamzat wasl"""
    for i, (l, m) in enumerate(L):
        if l == 'ٱ': continue
        return l, m, i
    return None, [], 0
def wasl_vowel(L):
    # the article
    w = ''.join(l + ''.join(m) for l, m in L)
    if len(L) > 1 and L[1][0] == 'ل' and not w.startswith(('ٱلْتَق', 'ٱلْتَف', 'ٱلْتَمِس')):
        return 'a'
    # a verb takes u when its third letter carries a damma, else i; the nouns take i
    cons = [(l, m) for l, m in L[1:] if l in CONS]
    if len(cons) >= 2 and DAMMA in cons[1][1] and not word_is_noun(L): return 'u'
    return 'i'
NOUNS = ('ٱبْن', 'ٱسْم', 'ٱمْرَأ', 'ٱمْرُؤ', 'ٱمْرِئ', 'ٱثْن', 'ٱبْنَت')
def word_is_noun(L):
    w = ''.join(l + ''.join(m) for l, m in L)
    return w.startswith(NOUNS)
DROP_INITIAL_HAMZA = [False]
def translit(words, fresh=True, pausal=True):
    """One breath: `fresh` — begun after a pause; `pausal` — ended on one."""
    out = []      # symbols; vowels are 'a','i','u','ā','ī','ū'
    Ls = [letters(w) for w in words]
    n = len(Ls)
    for wi, L in enumerate(Ls):
        nxt = Ls[wi + 1] if wi + 1 < n else None
        last = wi == n - 1
        if is_muq(words[wi]):
            out.append(' '.join(MUQ[l] for l, _ in L)); continue
        w = ''.join(l + ''.join(m) for l, m in L)
        allah = bool(re.search('لل' + SHADDA + '[' + FATHA + ']?' , w)) and False
        i = 0
        seg = []
        while i < len(L):
            l, m = L[i]
            ms = set(m)
            nl, nm = (L[i + 1] if i + 1 < len(L) else (None, []))
            at_end = i == len(L) - 1
            if SILENT in ms: i += 1; continue
            if RECT in ms and not (last and pausal and at_end): i += 1; continue
            if l == 'ٱ':
                if wi == 0 and fresh and i == 0: seg.append(wasl_vowel(L))
                i += 1; continue
            if l == SMALL_WAW:
                if seg and seg[-1] == 'u': seg[-1] = 'Ū'
                elif seg and seg[-1] == 'ū': pass
                else: seg.append('Ū')
                i += 1; continue
            if l == SMALL_YEH:
                if seg and seg[-1] == 'i': seg[-1] = 'Ī'
                elif seg and seg[-1] == 'ī': pass
                else: seg.append('Ī')
                i += 1; continue
            if l == 'ا':
                # a bare alif lengthens a fatha; after tanwin it is silent
                if seg and seg[-1] == 'a': seg[-1] = 'ā'
                elif seg and seg[-1] in ('N', '~') : pass
                elif i == 0 and (ms & {FATHA, DAMMA, KASRA}):   # a plain alif carrying a vowel (rare)
                    seg.append({FATHA:'a',DAMMA:'u',KASRA:'i'}[(ms & {FATHA,DAMMA,KASRA}).pop()])
                i += 1; continue
            vowelled = ms & {FATHA, DAMMA, KASRA, FATHATAN, DAMMATAN, KASRATAN}
            if l in 'وىي' and not vowelled and SHADDA not in ms:
                prev = seg[-1] if seg else ''
                if DAGGER in ms:                         # a seat for the dagger alif: ṣalāh, ʿalā
                    if prev == 'a': seg[-1] = 'ā'
                    else: seg.append('ā')
                    i += 1; continue
                if SUKUN in ms:
                    seg.append('w' if l == 'و' else 'y'); i += 1; continue
                if l == 'و' and prev in ('u', 'ū'): seg[-1] = 'ū'; i += 1; continue
                if l in 'ىي' and prev in ('i', 'ī'): seg[-1] = 'ī'; i += 1; continue
                if l == 'ى' and prev in ('a', 'ā'): seg[-1] = 'ā'; i += 1; continue
                if l == 'ى' and prev in ('N', '~', 'w', 'y', 'm') and i == len(L) - 1 and any(set(x[1]) & {FATHATAN} for x in L): i += 1; continue          # hudan: the ya after tanwin is silent
                # otherwise a consonant with nothing written: assimilated, or a seat
            c = CONS.get(l)
            if c is None: i += 1; continue
            if c == 'ʾ' and DROP_INITIAL_HAMZA[0] and (
                i == 0 or (i == 1 and L[0][0] == 'ي' and DAGGER in L[0][1])
                or (i >= 2 and L[i-1][0] == 'ل' and SUKUN in L[i-1][1] and (L[i-2][0] == 'ٱ' or (L[i-2][0] == 'ل' and i - 2 <= 1)))): c = ''
            if SMALL_SEEN in ms and l == 'ص': c = 's'
            bare = not (ms & {FATHA, DAMMA, KASRA, FATHATAN, DAMMATAN, KASRATAN, SHADDA, SUKUN, DAGGER})
            # what follows, in this word or the next
            if nl is not None:
                fl, fm = nl, nm
                k = i + 1
                while fl == 'ٱ' or (SILENT in fm) :
                    k += 1
                    if k < len(L): fl, fm = L[k]
                    else: fl, fm = None, []; break
            else: fl, fm = None, []
            if fl is None and nxt is not None and not (last and pausal):
                fl, fm, _ = first_cons(nxt)
                if is_muq(words[wi + 1]): fl, fm = None, []
            if bare and l not in 'وىي':
                if fl is not None and SHADDA in fm and CONS.get(fl):
                    i += 1; continue                      # assimilated into the next letter
                if l == 'ن':
                    if fl in ('و',): c = 'w'
                    elif fl in ('ي', 'ى'): c = 'y'
                    elif fl == 'ب': c = 'm'
            elif bare and l in 'وىي':
                if fl is not None and SHADDA in fm: i += 1; continue
            doubled = SHADDA in ms and not (wi == 0 and fresh and i == 0)
            seg.append(c + c if doubled else c)
            if l == 'ل' and SHADDA in ms and FATHA in ms and nl == 'ه' and (i + 2 == len(L) or (i + 2 < len(L) and L[i+2][0] == 'م' and SHADDA in L[i+2][1])) and DAGGER not in ms and i >= 1 and L[i-1][0] == 'ل':
                seg.append('ā'); i += 1; continue      # Allāh, lillāh, Allāhumma: the alif is not written
            if FATHA in ms: seg.append('a')
            elif DAMMA in ms: seg.append('u')
            elif KASRA in ms: seg.append('i')
            if ms & {FATHATAN, DAMMATAN, KASRATAN}:
                v = 'a' if FATHATAN in ms else 'u' if DAMMATAN in ms else 'i'
                seg.append(v)
                # the tanwin's nun, by what follows
                rest_silent = all((x[0] in 'اى') and not (set(x[1]) & {FATHA, DAMMA, KASRA}) for x in L[i + 1:])
                tl, tm = (None, [])
                if nxt is not None and not (last and pausal) and rest_silent:
                    tl, tm, _ = first_cons(nxt)
                    if nxt[0][0] == 'ٱ': tl = 'WASL'
                    if is_muq(words[wi + 1]): tl = 'x'
                if tl == 'WASL': seg.append('n'); seg.append('i')
                elif tl is not None and SHADDA in tm and tl in 'لرمن': seg.append('~')
                elif tl in ('و',): seg.append('w')
                elif tl in ('ي', 'ى'): seg.append('y')
                elif tl == 'ب': seg.append('m')
                else: seg.append('N')
            if DAGGER in ms:
                if seg and seg[-1] == 'a': seg[-1] = 'ā'
                else: seg.append('ā')
            i += 1
        # a long vowel before a hamzat wasl is shortened
        if nxt is not None and not (last and pausal) and nxt[0][0] == 'ٱ' and seg and seg[-1] in 'āīūĪŪ':
            seg[-1] = {'ā':'a','ī':'i','ū':'u','Ī':'i','Ū':'u'}[seg[-1]]
        out.append(''.join(seg))
    s = out
    if pausal and s:
        w = s[-1]
        if not is_muq(words[-1]):
            w = w.replace('~', '')
            if w.endswith(('Ī', 'Ū')): w = w[:-1]
            elif w.endswith(('TaN', 'TuN', 'TiN')): w = w[:-3] + 'h'
            elif w.endswith('aN'): w = w[:-2] + 'ā'
            elif w.endswith(('uN', 'iN')): w = w[:-2]
            elif w.endswith(('Ta', 'Tu', 'Ti')): w = w[:-2] + 'h'
            elif w.endswith(('a', 'i', 'u')): w = w[:-1]
            if w.endswith('T'): w = w[:-1] + 'h'
            if w.endswith('TaN'): pass
            s = s[:-1] + [w]
    return ' '.join(s).replace('N', 'n').replace('T', 't').replace('~', '').replace('Ī', 'ī').replace('Ū', 'ū')
def norm(t):
    t = unicodedata.normalize('NFC', t).lower()
    t = t.replace('’', "'").replace('‘', 'ʿ')
    return re.sub(r"[^a-zāīūēḥṣḍṭẓʿʾ]", '', t)
def nohamza(t): return t.replace('ʾ', '')
if __name__ == '__main__':
    E = load('translit.en')
    k = tuple(map(int, sys.argv[1].split(':')))
    words, marks = tokens(A[k])
    print(A[k]); print(translit(words)); print(E[k])
