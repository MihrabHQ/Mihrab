"""The point a published Swedish table is computed at, for a city with no Diyanet record of its own: the exact
model (congress-model.py) against the city's 2026 rows, sun-only times, coarse to fine to 0.001°.
python3 fit-table-point.py torsby 60.13 13.0"""
import sys, os, json, math, importlib.util, datetime as dt
from zoneinfo import ZoneInfo
spec = importlib.util.spec_from_file_location('cm', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'congress-model.py'))
cm = importlib.util.module_from_spec(spec); spec.loader.exec_module(cm)
TZ = ZoneInfo('Europe/Stockholm')
slug, lat0, lon0 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
days = json.load(open(f'/Users/hassan/git/mihrab/data/prayer-times/v1/cities/{slug}.json'))['days']
rows = [(dt.date(*map(int, k.split('-'))), v) for k, v in days.items() if k.startswith('2026-')]
def score(la, lo):
    M = cm.Model(la, lo, 2026); hit = 0
    for day, v in rows:
        s = M.solar(day); sr, ss = M.printed_rise_set(day); t = {'sunrise': sr, 'dhuhr': s.transit + 5, 'maghrib': ss}
        for k, i in (('sunrise', 2), ('dhuhr', 3), ('maghrib', 5)):
            if cm.hhmm(t[k], s.day_start) == v[i]: hit += 1
    return hit
best = (score(lat0, lon0), lat0, lon0)
for step in (0.05, 0.01, 0.003, 0.001):
    improved = True
    while improved:
        improved = False
        for i in (-1, 0, 1):
            for j in (-1, 0, 1):
                la, lo = round(best[1] + i * step, 3), round(best[2] + j * step, 3)
                sc = score(la, lo)
                if sc > best[0]: best = (sc, la, lo); improved = True
print(slug, best, 'of', 3 * len(rows))
