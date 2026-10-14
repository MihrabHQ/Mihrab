"""Dhuhr-only test of equation-of-time variants over every place (coordinates' longitude re-snapped per variant
among 3-decimal neighbours). Dhuhr = transit + 5 depends on nothing else, so its misses measure the formula.
python3 diyanet-dhuhr.py"""
import os, json, math, datetime as dt, numpy as np, itertools
CACHE = os.path.expanduser('~/.cache/mihrab/diyanet')
RAD = math.pi / 180
sn = json.load(open(os.path.join(CACHE, 'snapped.json')))
from zoneinfo import ZoneInfo
TZ = ZoneInfo('Europe/Stockholm')
data = {}
for iid, v in sn.items():
    if v['name'].startswith('KUNGALV'): continue
    D, P = [], []
    for y in range(2024, 2028):
        for r in json.load(open(os.path.join(CACHE, 'raw', f'{iid}_{y}.json'))):
            d, m, yy = map(int, r['gregorianDateShort'].split('.'))
            off = dt.datetime(yy, m, d, 12, tzinfo=TZ).utcoffset().total_seconds() / 60
            D.append((dt.date(yy, m, d) - dt.date(2000, 1, 1)).days - 0.5)
            P.append(int(r['dhuhr'][:2]) * 60 + int(r['dhuhr'][3:]) - off - 5)
    data[iid] = (np.array(D), np.array(P), v['lon'])

def eot_variant(D, L0c=280.46646, L0r=36000.76983, C1=1.914602, nut=True, inst_s=-45, add=0.00176, tt=0.0):
    D = D + (inst_s + tt) / 86400
    T = D / 36525
    L0 = (L0c + T * (L0r + 0.0003032 * T)) % 360
    M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) * RAD
    C = (C1 - T * (0.004817 + 0.000014 * T)) * np.sin(M) + (0.019993 - 0.000101 * T) * np.sin(2 * M) + 0.000289 * np.sin(3 * M)
    om = (125.04 - 1934.136 * T) * RAD
    Lm = (280.4665 + 36000.7698 * T) * RAD; Lmoon = (218.3165 + 481267.8813 * T) * RAD
    eps = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
    if nut: eps = eps + (9.20 * np.cos(om) + 0.57 * np.cos(2 * Lm) + 0.10 * np.cos(2 * Lmoon) - 0.09 * np.cos(2 * om)) / 3600
    lam = L0 + C
    ra = np.degrees(np.arctan2(np.cos(eps * RAD) * np.sin(lam * RAD), np.cos(lam * RAD))) % 360
    return ((L0 - ra + 180) % 360 - 180) * 4 + add

def score(**kw):
    tot = 0
    for iid, (D, P, lon0) in data.items():
        e = eot_variant(D, **kw)
        best = min(int((np.abs(720 - 4 * (round(lon0, 3) + j * 0.001) - e - P) >= 0.5).sum()) for j in (-1, 0, 1))
        tot += best
    return tot

print('current', score())
for add in (0.0012, 0.0015, 0.00176, 0.002, 0.0023):
    for inst in (-90, -69, -45, -20, 0):
        print(f'add {add} inst {inst}s:', score(add=add, inst_s=inst), flush=True)
print('L0 280.4664567 (VSOP):', score(L0c=280.4664567, L0r=36000.76982779, add=0.0))
print('no nutation in obliquity:', score(nut=False))
