"""Every Fajr/Isha/sunrise/Maghrib miss against Diyanet's tables, classified by regime (true angle, carried share,
transition, floors), with the raw value's distance past the rounding boundary.
python3 diyanet-fi-misses.py [--part k/n]"""
import sys, os, json, math, importlib.util, datetime as dt, collections
from zoneinfo import ZoneInfo
spec = importlib.util.spec_from_file_location('cm', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'congress-model.py'))
cm = importlib.util.module_from_spec(spec); spec.loader.exec_module(cm)
CACHE = os.path.expanduser('~/.cache/mihrab/diyanet')
sn = json.load(open(os.path.join(CACHE, 'snapped.json')))
part, parts = map(int, sys.argv[sys.argv.index('--part') + 1].split('/')) if '--part' in sys.argv else (0, 1)
TZ = ZoneInfo('Europe/Stockholm')
F = {'fajr': 'fajr', 'sunrise': 'sunrise', 'dhuhr': 'dhuhr', 'asr': 'asr', 'maghrib': 'maghrib', 'isha': 'isha'}
stats = collections.Counter(); excess = collections.defaultdict(list)
for k, (iid, v) in enumerate(sorted(sn.items(), key=lambda kv: kv[1]['name'])):
    if k % parts != part or v['name'].startswith('KUNGALV'): continue
    models = {}
    for y in range(2024, 2028):
        p = os.path.join(CACHE, 'raw', f'{iid}_{y}.json')
        if not os.path.exists(p): continue
        M = models.setdefault(y, cm.Model(v['lat'], v['lon'], y))
        for r in json.load(open(p)):
            d_, m_, y_ = map(int, r['gregorianDateShort'].split('.'))
            day = dt.date(y_, m_, d_)
            if (m_, d_) == (2, 29): continue
            t = M.times(day); start = M.solar(day).day_start
            gap = M.gap_days()
            for key in ('fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'):
                raw = t[key]
                local = start + dt.timedelta(minutes=raw)
                off = local.astimezone(TZ).utcoffset().total_seconds() / 60
                lm = raw + off
                pm = int(r[F[key]][:2]) * 60 + int(r[F[key]][3:])
                diff = round(lm) - pm
                while diff > 720: diff -= 1440
                while diff < -720: diff += 1440
                if diff == 0: continue
                if key in ('fajr', 'isha'):
                    if gap and gap[0] <= day <= gap[1]: reg = 'carried'
                    elif gap and M.cache.get(('in' if day < gap[0] else 'out', key)) and M.cache[('in' if day < gap[0] else 'out', key)][2] and \
                         ((day < gap[0] and M.cache[('in', key)][2] <= day) or (day > gap[1] and day <= M.cache[('out', key)][2])): reg = 'ramp'
                    else: reg = 'true'
                elif key in ('sunrise', 'maghrib'):
                    s = M.solar(day); dh = s.transit + 5
                    reg = 'floor' if abs(t['sunrise'] - (dh - 570)) < 1e-6 or abs(t['maghrib'] - (dh + 570)) < 1e-6 or abs(t['sunrise'] - (dh - 150)) < 1e-6 or abs(t['maghrib'] - (dh + 150)) < 1e-6 else 'anchor' if M.midsummer_floors() and (day.month in (5, 6, 7)) else 'true'
                else: reg = 'sun'
                stats[(key, reg)] += 1
                frac = lm - math.floor(lm)
                excess[(key, reg)].append(abs(frac - 0.5))
                if '--list' in sys.argv: print(v['name'][:12], day, key, reg, diff, round(lm, 3), r[F[key]], flush=True)
for kk in sorted(stats): print(kk, stats[kk], 'median |frac-0.5| %.4f' % sorted(excess[kk])[len(excess[kk]) // 2])
