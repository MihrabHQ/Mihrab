#!/usr/bin/env python3
"""
Compare the Ḥafṣ rule files with what Mihrab's muṣḥaf page actually draws.

    python3 scripts/mushaf/compare_hafs_tajweed_fonts.py DIR

DIR holds the app's light tajwīd page fonts, QCF4T001L.ttf … QCF4T604L.ttf
(the `mushaf-fonts-v4-tajweed-light` release). For every word on every
page it reads the colour layers of the word's glyphs, maps each palette
entry to its rule's colour family, and sets that against the families of
the rules in `assets/quran/tajweed/{NNN}.json` for the same word.

What it cannot settle is a difference of CONVENTION between the two: the
print paints the nūn or tanwīn of an idghām grey (it is not sounded) and
leaves the letter after an ikhfāʾ or iqlāb plain, where quran.com's markup
paints both sides green. Those show up as large counts in the green and
grey rows and are expected; everything else is a word to look at.
"""
import os
FONTS = os.path.abspath(__import__("sys").argv[1]) if len(__import__("sys").argv) > 1 else "/tmp/qcf4t"
import json, glob, collections, os, sys
from fontTools.ttLib import TTFont
CLS={'a3a5a5':'grey','a5a5a5':'grey','9fa5a5':'grey','09b000':'green','ce9e00':'madd2','ff7b00':'madd_perm','f40000':'madd_oblig','b50000':'madd_nec','2fadff':'qalqalah','3f48e6':'tafkheem'}
RULE_CLS={'ham_wasl':'grey','laam_shamsiyah':'grey','slnt':'grey','idgham_wo_ghunnah':'grey','idgham_mutajanisayn':'grey','idgham_mutaqaribayn':'grey',
 'ghunnah':'green','ikhafa':'green','idgham_ghunnah':'green','iqlab':'green','ikhafa_shafawi':'green','idgham_shafawi':'green',
 'madda_normal':'madd2','madda_permissible':'madd_perm','madda_obligatory_mottasel':'madd_oblig','madda_obligatory_monfasel':'madd_oblig','madda_necessary':'madd_nec','qalaqah':'qalqalah','tafkheem':'tafkheem'}
layout=json.load(open('src/quran/data/mushafLayoutV2.json'))
rules={}
for f in glob.glob('assets/quran/tajweed/[0-9]*.json'):
    d=json.load(open(f)); rules[int(f[-8:-5])]=d
def json_cls(s,a,p):
    d=rules.get(s); 
    try: w=d['ayahs'][a-1][p-1]
    except Exception: return None
    return {RULE_CLS[d['rules'][r]] for r,_,_ in (w[1] if len(w)>1 else [])}
font_only=collections.defaultdict(list); json_only=collections.defaultdict(list); unknown=collections.Counter(); words=0; missing_word=0
for page in layout:
    pg=page['p']; fn=os.path.join(FONTS, f"QCF4T{pg:03d}L.ttf")
    font=TTFont(fn); cmap=font.getBestCmap(); layers=font['COLR'].ColorLayers
    pal=font['CPAL'].palettes[0]
    def hexof(i):
        c=pal[i]; return f"{c.red:02x}{c.green:02x}{c.blue:02x}"
    for line in page['l']:
        if line['t']!='a': continue
        tokens=[t for t in line['x'].split('|') if t]; i=0
        for seg in line['w']:
            s,a,first,count=seg[0],seg[1],seg[2],seg[3]
            for k in range(count):
                if i>=len(tokens): break
                tok=tokens[i]; i+=1; pos=first+k
                fc=set()
                for ch in tok:
                    g=cmap.get(ord(ch))
                    for L in layers.get(g,[]) if g else []:
                        if L.colorID==0xFFFF: continue
                        h=hexof(L.colorID)
                        if h in CLS: fc.add(CLS[h])
                        elif pal[L.colorID].alpha>0: unknown[h]+=1
                jc=json_cls(s,a,pos)
                if jc is None:
                    missing_word+=1; continue   # the ayah-end medallion
                words+=1
                for c in fc-jc: font_only[c].append(f"{s}:{a}:{pos} {rules[s]['ayahs'][a-1][pos-1][0]}")
                for c in jc-fc:
                    d=rules[s]; w=d['ayahs'][a-1][pos-1]
                    rs=sorted({d['rules'][r] for r,_,_ in (w[1] if len(w)>1 else []) if RULE_CLS[d['rules'][r]]==c})
                    json_only[c+' <- '+'+'.join(rs)].append(f"{s}:{a}:{pos} {w[0]}")
print('words compared',words,'unmatched tokens',missing_word,'unknown colours',dict(unknown))
print('FONT colours a class the reference lacks:'); [print(' ',c,len(v),v[:8]) for c,v in sorted(font_only.items())]
print('REFERENCE has a class the font does not colour:'); [print(' ',c,len(v),v[:8]) for c,v in sorted(json_only.items())]
