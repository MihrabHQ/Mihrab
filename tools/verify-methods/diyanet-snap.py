"""Coordinates snapped to Diyanet's 3 decimals, one global equation-of-time constant and instant; count misses.
For each place, the snapped point is chosen among the 3-decimal neighbours of the fitted one (fewest misses).
python3 diyanet-snap.py <fit.json> <model> <hour> <eot_add_min> [--fields ...]"""
import sys, os, json, glob, itertools, importlib.util, numpy as np
spec = importlib.util.spec_from_file_location('dj', '/Users/hassan/git/mihrab/tools/verify-methods/diyanet-joint.py')
dj = importlib.util.module_from_spec(spec); spec.loader.exec_module(dj)
paths, model, hour, eot_add = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
fields = sys.argv[sys.argv.index('--fields') + 1].split(',') if '--fields' in sys.argv else ['rise', 'set', 'transit', 'asr']
fit = {}
for p in glob.glob(os.path.expanduser(paths)): fit.update(json.load(open(p)))
orig = dj.City.times
def times(self, lat, lon, hour, h0, model):
    t = orig(self, lat, lon, hour, h0, model)
    for k in ('transit', 'rise', 'set', 'asr', 'fajr', 'isha'): t[k] = t[k] - eot_add  # their eot = ours + eot_add
    return t
dj.City.times = times
total = 0; n = 0; zero = 0; snapped = {}
for iid, v in sorted(fit.items(), key=lambda kv: kv[1]['name']):
    c = dj.City(iid)
    best = None
    for i, j in itertools.product((-1, 0, 1), repeat=2):
        la = round(v['lat'], 3) + i * 0.001; lo = round(v['lon'] - eot_add / 4, 3) + j * 0.001
        m, per = c.misses(la, lo, hour, -0.833, model, fields, detail=True)
        if best is None or m < best[0]: best = (m, round(la, 3), round(lo, 3), per)
    m, la, lo, per = best
    of = sum(x[1] for x in per.values())
    total += m; n += of; zero += (m == 0)
    snapped[iid] = dict(name=v['name'], slug=v['slug'], lat=la, lon=lo, misses=m, of=of)
    if '--verbose' in sys.argv or m: print(f"{v['name'][:16]:16s} {la:.3f} {lo:.3f} misses {m}/{of}", flush=True)
print(f'TOTAL {len(fit)} places, {zero} with no miss: {total} misses of {n} ({100 * total / max(n, 1):.4f}%)')
if '--save' in sys.argv:
    json.dump(snapped, open(os.path.expanduser(sys.argv[sys.argv.index('--save') + 1]), 'w'), indent=1, ensure_ascii=False)
