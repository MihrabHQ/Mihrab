"""Measure Diyanet's equation of time and declination day by day from all cities at once.

For each date, every city's printed Dhuhr says our transit minus a common correction c must round to it:
c in (d - 0.5, d + 0.5) with d = ours - printed. Intersecting over ~160 cities pins c (minutes of equation of
time, ours minus theirs) to a narrow band. Likewise the half-day (set - rise)/2 pins the declination difference
through dH/d(dec). Prints per-day bands and a harmonic fit of the corrections.
python3 diyanet-perday.py almanac 0.15"""
import sys, os, json, glob, math, importlib.util, numpy as np, collections, datetime as dt
spec = importlib.util.spec_from_file_location('dj', '/Users/hassan/git/mihrab/tools/verify-methods/diyanet-joint.py')
dj = importlib.util.module_from_spec(spec); spec.loader.exec_module(dj)
CACHE = os.path.expanduser('~/.cache/mihrab/diyanet')
RAD = math.pi / 180
model, hour = sys.argv[1], float(sys.argv[2])
fit = {}
for p in glob.glob(os.path.join(CACHE, f'fit-{model}-{hour}-p*.json')): fit.update(json.load(open(p)))
print(len(fit), 'places')
lo_e = collections.defaultdict(lambda: -1e9); hi_e = collections.defaultdict(lambda: 1e9)
lo_h = collections.defaultdict(lambda: -1e9); hi_h = collections.defaultdict(lambda: 1e9)
for iid, v in fit.items():
    if v['misses'] > 0.02 * v['of']: continue  # a place we have not located: leave it out
    c = dj.City(iid); t = c.times(v['lat'], v['lon'], hour, -0.833, model)
    dec, _ = dj.dx.MODELS[model](c.D0 + hour / 24)
    phi = v['lat'] * RAD
    for i, (date, off, r) in enumerate(c.rows):
        d = t['transit'][i] - c.p['transit'][i]
        d = (d + 720) % 1440 - 720
        if abs(d) < 3:
            lo_e[date] = max(lo_e[date], d - 0.5); hi_e[date] = min(hi_e[date], d + 0.5)
        # half day: (set - rise)/2 ours minus printed, scaled to declination (arcsec) by dH/ddec
        ds = t['set'][i] - c.p['set'][i]; dr = t['rise'][i] - c.p['rise'][i]
        if np.isfinite(ds) and np.isfinite(dr) and abs(ds) < 3 and abs(dr) < 3:
            # dH/ddec (minutes per radian) at h0
            H = (t['set'][i] - t['rise'][i]) / 2 / 4 * RAD
            dHdd = 4 / RAD * (math.sin(phi) * math.cos(dec[i]) - math.cos(phi) * math.sin(dec[i]) * math.cos(H)) / (math.cos(phi) * math.cos(dec[i]) * math.sin(H)) if math.sin(H) > 0.05 else None
            if not dHdd: continue
            hd = (ds - dr) / 2   # ours minus theirs, half-day minutes; each end rounds independently: +-0.5
            # ours - k*dHdd*ddec rounds both ends: ddec in ((hd - 0.5)/dHdd , (hd + 0.5)/dHdd) (sign aware)
            a, b = (hd - 0.5) / dHdd, (hd + 0.5) / dHdd
            a, b = min(a, b), max(a, b)
            lo_h[date] = max(lo_h[date], a); hi_h[date] = min(hi_h[date], b)
dates = sorted(lo_e)
E = np.array([(lo_e[d] + hi_e[d]) / 2 for d in dates]); W = np.array([hi_e[d] - lo_e[d] for d in dates])
print('eot correction bands: empty', int((W < 0).sum()), 'of', len(dates), ' median width %.4f min' % np.median(W[W > 0]))
dd = sorted(lo_h)
Dd = np.array([(lo_h[d] + hi_h[d]) / 2 for d in dd]) / RAD * 3600; Wd = np.array([hi_h[d] - lo_h[d] for d in dd]) / RAD * 3600
print('dec correction bands: empty', int((Wd < 0).sum()), 'of', len(dd), " median width %.2f arcsec" % np.median(Wd[Wd > 0]))
# monthly view
for y in (2024, 2025, 2026, 2027):
    row = []
    for m in range(1, 13):
        ix = [i for i, d in enumerate(dates) if d.year == y and d.month == m and W[i] > 0]
        jx = [i for i, d in enumerate(dd) if d.year == y and d.month == m and Wd[i] > 0]
        row.append('%+.3f/%+5.1f"' % (np.mean(E[ix]) if ix else np.nan, np.mean(Dd[jx]) if jx else np.nan))
    print(y, ' '.join(row))
np.save(os.path.join(CACHE, f'perday-{model}-{hour}.npy'), dict(dates=[str(d) for d in dates], E=E, W=W, ddates=[str(d) for d in dd], D=Dd, Wd=Wd), allow_pickle=True)
