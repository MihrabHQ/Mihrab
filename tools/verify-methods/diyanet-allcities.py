"""Fit every cached Diyanet place: coordinates seeded from its own data (Dhuhr -> longitude, day length -> latitude)
then refined to the fewest misses, at a given model / instant / h0. Prints coordinates in arcminutes so round
values show. Writes ~/.cache/mihrab/diyanet/fit-<model>-<hour>.json.
python3 diyanet-allcities.py almanac 0.0 [-0.833] [--limit N]"""
import sys, os, json, itertools, importlib.util, numpy as np
spec = importlib.util.spec_from_file_location('dj', '/Users/hassan/git/mihrab/tools/verify-methods/diyanet-joint.py')
dj = importlib.util.module_from_spec(spec); spec.loader.exec_module(dj)
CACHE = os.path.expanduser('~/.cache/mihrab/diyanet')
model, hour = sys.argv[1], float(sys.argv[2])
h0 = float(sys.argv[3]) if len(sys.argv) > 3 and not sys.argv[3].startswith('--') else -0.833
limit = int(sys.argv[sys.argv.index('--limit') + 1]) if '--limit' in sys.argv else 10 ** 6
part, parts = map(int, sys.argv[sys.argv.index('--part') + 1].split('/')) if '--part' in sys.argv else (0, 1)
fields = ['rise', 'set', 'transit', 'asr']
idx = json.load(open(os.path.join(CACHE, 'index.json')))
out = {}
for k, (iid, meta) in enumerate(sorted(idx.items(), key=lambda x: x[1]['name'])):
    if k >= limit: break
    if k % parts != part: continue
    if not all(os.path.exists(os.path.join(CACHE, 'raw', f'{iid}_{y}.json')) for y in range(2024, 2028)): continue
    c = dj.City(iid)
    if not c.rows: continue
    # seed: longitude from Dhuhr, latitude by a coarse scan of day length
    _, eot = dj.dx.MODELS[model](c.D0 + hour / 24)
    lon = float(np.nanmedian((720 - eot - c.p['transit']) / 4))
    def seed_err(la):
        t = c.times(la, lon, hour, h0, model)
        d = np.concatenate([(t[f] - c.p[f] + 720) % 1440 - 720 for f in ('rise', 'set')])
        return float(np.nanmedian(np.abs(d)))
    lat = min(np.arange(55.0, 69.5, 0.02), key=seed_err)
    b = (c.misses(lat, lon, hour, h0, model, fields), lat, lon)
    for step in (0.02, 0.005, 0.001, 0.00025, 0.00005, 0.00001):
        improved = True
        while improved:
            improved = False
            for i, j in itertools.product((-2, -1, 0, 1, 2), repeat=2):
                if i == j == 0: continue
                la, lo = b[1] + i * step, b[2] + j * step
                m = c.misses(la, lo, hour, h0, model, fields)
                if m < b[0]: b = (m, la, lo); improved = True
    n, per = c.misses(b[1], b[2], hour, h0, model, fields + ['fajr', 'isha'], detail=True)
    tot = sum(v[1] for f, v in per.items() if f in fields)
    out[iid] = dict(name=meta['name'], slug=meta['slug'], lat=b[1], lon=b[2], misses=b[0], of=tot, per=per)
    am = lambda x: f"{int(x)}°{(x - int(x)) * 60:06.3f}'"
    print(f"{meta['name'][:16]:16s} {am(b[1])} {am(b[2])}  misses {b[0]:3d}/{tot}  fajr {per['fajr'][0]}/{per['fajr'][1]} isha {per['isha'][0]}/{per['isha'][1]}", flush=True)
json.dump(out, open(os.path.join(CACHE, f'fit-{model}-{hour}' + (f'-p{part}' if parts > 1 else '') + '.json'), 'w'), indent=1, ensure_ascii=False)
tot_m = sum(v['misses'] for v in out.values()); tot_n = sum(v['of'] for v in out.values())
print(f'TOTAL {len(out)} places: {tot_m} misses of {tot_n} ({100 * tot_m / tot_n:.3f}%)')
