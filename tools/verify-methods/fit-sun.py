"""Which sun (model, evaluation instant, coordinates) reproduces the printed sunrise, Dhuhr and Maghrib exactly?
python3 fit-sun.py stockholm 59.3333 18.0333"""
import sys, json, datetime as dt, importlib, itertools
sys.path.insert(0, '/Users/hassan/git/mihrab/tools/verify-methods')
cm = importlib.import_module('congress-model')
slug, lat, lon = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
table = json.load(open(f'/Users/hassan/git/mihrab/data/prayer-times/v1/cities/{slug}.json'))['days']
days = []
for date in sorted(table):
    y, m, d = map(int, date.split('-'))
    if (m, d) == (2, 29): continue
    if date.startswith('2027') and date in table and ('2026' + date[4:]) in table: continue  # 2027 rows are copies
    days.append((dt.date(2026, m, d), table[date][1:]))
def score(sun, hour, la, lo, verbose=False):
    cm.SUN = sun; cm.SOLAR_HOUR = hour
    M = cm.Model(la, lo, 2026)
    hits = [0, 0, 0]; n = 0; off = []
    for day, t in days:
        s = M.solar(day); sr, ss = M.printed_rise_set(day); dh = s.transit + 5
        for i, (k, v) in enumerate(((1, sr), (2, dh), (4, ss))):
            o = cm.hhmm(v, s.day_start)
            if o == t[k]: hits[i] += 1
            elif verbose: off.append((str(day), k, o, t[k]))
        n += 1
    return hits, n, off
best = []
for rnd in ('nearest',):
    cm.ROUND = rnd
    for it in (0, 1, 2):
        cm.ITER = it
        for sun in ('noaa', 'praytimes'):
            for hour in [x / 4 for x in range(-8, 25)]:
                h, n, _ = score(sun, hour, lat, lon)
                best.append((sum(h), h, sun, hour, rnd, it))
best.sort(reverse=True)
for b in best[:8]: print(b, '/', n)
# coordinate grid around the best
_, _, sun, hour, rnd, it = best[0]
cm.ROUND = rnd; cm.ITER = it
grid = []
for dla in (-0.05, -0.0333, -0.02, 0, 0.02, 0.0333, 0.05):
    for dlo in (-0.1, -0.0667, -0.0333, 0, 0.0333, 0.0667, 0.1):
        h, n, _ = score(sun, hour, lat + dla, lon + dlo)
        grid.append((sum(h), h, round(lat + dla, 4), round(lon + dlo, 4)))
grid.sort(reverse=True)
for g in grid[:8]: print(g)
h, n, off = score(sun, hour, lat, lon, True)
print('misses at', sun, hour, lat, lon, ':', off)
