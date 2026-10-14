"""Exact-minute fitting for any authority's table (the Sweden method, generalised).

A dataset is data/prayer-times/<folder>/v1/cities/<id>.json with days {"YYYY-MM-DD": [imsak, fajr, sunrise,
dhuhr, asr, maghrib, isha]}. Places and their starting coordinates come from a JSON list ({id, lat, lon}).
Each printed minute M is a constraint on the raw time r: the method's rounding of r + margin must give M.

    python3 table-exact.py algeria resid             # raw - printed per prayer, per place: margins and rounding
    python3 table-exact.py algeria fit [options]     # per-place coordinates for a model; misses per prayer

Options: --sun almanac|noaa|m_true|m_nofull|...   --hour H (UT of the daily sun)   --round nearest|ceil|floor
         --margins fajr,sunrise,dhuhr,asr,maghrib,isha   --angles F,I   --h0 -0.833   --fields ...
"""
import sys, os, json, math, itertools, importlib.util, datetime as dt
import numpy as np
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, '..', '..')
spec = importlib.util.spec_from_file_location('dx', os.path.join(HERE, 'diyanet-exact.py'))
dx = importlib.util.module_from_spec(spec); spec.loader.exec_module(dx)
RAD = math.pi / 180

AUTH = {
    'algeria': dict(folder='algeria', tz='Africa/Algiers', coords='src/providers/data/algeriaCities.json'),
    # Morocco's table is in GMT (the country left GMT+1 on 20 September 2026, and the
    # site republished the earlier rows); history-union.py gathers the rolling window's past.
    'morocco': dict(folder='morocco', tz='Etc/GMT', coords='src/providers/data/moroccoCities.json',
                    root=os.path.expanduser('~/.cache/mihrab/morocco-history'),
                    # rows the site published before it moved to GMT, still on GMT+1
                    plus1_before='2026-09-17'),
    # JAKIM: a zone's single table; the zone's first listed town to start from. jakim-year-fetch.py
    # gathers the whole current year (the repo keeps only the coming window).
    'malaysia': dict(folder='malaysia', tz='Asia/Kuala_Lumpur', coords='src/providers/data/jakimPlaces.json',
                     root=os.path.expanduser('~/.cache/mihrab/malaysia-year')),
}
KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']

def arg(name, default=None, cast=str):
    return cast(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default

def data_root(auth):
    a = AUTH[auth]
    return os.environ.get('TABLE_ROOT') or a.get('root') or os.path.join(REPO, 'data/prayer-times', a['folder'])

def mins(s):
    if not s or len(s) != 5 or s[2] != ':': return float('nan')
    return int(s[:2]) * 60 + int(s[3:])

class Place:
    def __init__(self, auth, pid, lat, lon):
        a = AUTH[auth]; tz = ZoneInfo(a['tz'])
        days = json.load(open(os.path.join(data_root(auth), 'v1/cities', f'{pid}.json')))['days']
        self.id, self.lat0, self.lon0 = pid, lat, lon
        self.dates = sorted(days)
        ds = [dt.date(*map(int, k.split('-'))) for k in self.dates]
        self.D0 = np.array([(d - dt.date(2000, 1, 1)).days - 0.5 for d in ds])
        off = np.array([dt.datetime(d.year, d.month, d.day, 12, tzinfo=tz).utcoffset().total_seconds() / 60 for d in ds])
        if a.get('plus1_before'): off = off + np.array([60 if k < a['plus1_before'] else 0 for k in self.dates])
        self.p = {k: np.array([mins(days[x][i + 1]) for x in self.dates]) - off for i, k in enumerate(KEYS)}

    def raw(self, lat, lon, sun='almanac', hour=0.0, angles=(18, 17), h0=-0.833, asr_signed=False, shadow=1):
        if hour == 'event':
            return self.raw_event(lat, lon, sun, angles, h0, asr_signed, shadow)
        dec, eot = dx.MODELS[sun](self.D0 + hour / 24)
        tr = 720 - 4 * lon - eot
        phi = lat * RAD; sp, cp = math.sin(phi), math.cos(phi); sd, cd = np.sin(dec), np.cos(dec)
        def H(alt):
            c = (np.sin(alt * RAD) - sp * sd) / (cp * cd)
            with np.errstate(invalid='ignore'):
                return np.where(np.abs(c) <= 1, np.degrees(np.arccos(np.clip(c, -1, 1))) * 4, np.nan)
        z = lat - np.degrees(dec)
        tz_ = np.tan(z * RAD) if asr_signed else np.tan(np.abs(z) * RAD)
        asr_alt = np.degrees(np.arctan(1 / (shadow + tz_)))
        return dict(fajr=tr - H(-angles[0]), sunrise=tr - H(h0), dhuhr=tr, asr=tr + H(asr_alt), maghrib=tr + H(h0), isha=tr + H(-angles[1]))

def _raw_event(self, lat, lon, sun, angles, h0, asr_signed, shadow, iters=3):
    """Each time from the sun AT that time (iterated from local noon), as an almanac computes it."""
    f = dx.MODELS[sun]
    phi = lat * RAD; sp, cp = math.sin(phi), math.cos(phi)
    def at(t):  # dec, eot at minutes t past 0h UT
        return f(self.D0 + t / 1440)
    iters = int(os.environ.get('PASSES', iters))
    START = os.environ.get('START', 'guess')
    t_noon = np.full(len(self.D0), 720 - 4 * lon)
    if START == 'ut0':  # NOAA: first eot at local mean midnight, then one pass at the estimate
        _, eot = at(np.full(len(self.D0), -4.0 * lon)); t_noon = 720 - 4 * lon - eot
    for _ in range(iters if START != 'ut0' else 1):
        _, eot = at(t_noon); t_noon = 720 - 4 * lon - eot
    out = {'dhuhr': t_noon}
    DEC_AT = os.environ.get('DEC_AT', 'event'); EOT_AT = os.environ.get('EOT_AT', 'event')
    fixed = {'noon': t_noon, 'ut0': np.zeros(len(self.D0)), 'lmn': np.full(len(self.D0), -4 * lon), 'loc0': np.full(len(self.D0), -60.0)}
    DEC_SHIFT = float(os.environ.get('DEC_SHIFT', '0'))
    if os.environ.get('EOT_FIX'): fixed['noon'] = np.full(len(self.D0), float(os.environ['EOT_FIX']))
    def event(alt_of, sign, start):
        t = start.copy() if START != 'ut0' else np.zeros(len(self.D0))
        for _ in range(iters):
            dec, eot = at(t + DEC_SHIFT)
            if DEC_AT != 'event': dec = at(fixed[DEC_AT])[0]
            if EOT_AT != 'event': eot = at(fixed[EOT_AT])[1]
            tr = 720 - 4 * lon - eot
            alt = alt_of(at(t_noon)[0] if (os.environ.get('ASR_NOON_DEC') and alt_of.__name__ == 'asr_alt') else dec)
            c = (np.sin(alt * RAD) - sp * np.sin(dec)) / (cp * np.cos(dec))
            with np.errstate(invalid='ignore'):
                h = np.where(np.abs(c) <= 1, np.degrees(np.arccos(np.clip(c, -1, 1))) * 4, np.nan)
            t = tr + sign * h
        return t
    const = lambda a: (lambda dec: np.full(len(self.D0), a))
    out['fajr'] = event(const(-angles[0]), -1, t_noon - 420)
    h0 = h0 - getattr(self, 'dip', 0.0)
    out['sunrise'] = event(const(h0), -1, t_noon - 360)
    out['maghrib'] = event(const(h0 + getattr(self, 'dip', 0.0) * (1 - getattr(self, 'setq', 1.0))), 1, t_noon + 360)
    out['isha'] = event(const(-angles[1]), 1, t_noon + 420)
    def asr_alt(dec):
        z = lat - np.degrees(dec)
        tz_ = np.tan(z * RAD) if asr_signed else np.tan(np.abs(z) * RAD)
        return np.degrees(np.arctan(1 / (shadow + tz_)))
    out['asr'] = event(asr_alt, 1, t_noon + 200)
    return out
Place.raw_event = _raw_event

def rounded(x, how):
    if os.environ.get('ROUND_HOURS'):  # an intermediate rounding of the time in decimal hours (local = UT+1, aligned)
        q = 10 ** int(os.environ['ROUND_HOURS']); x = np.round(x / 60 * q) / q * 60
    if how == 'ceil': return np.ceil(x - 1e-9)
    if how == 'floor': return np.floor(x + 1e-9)
    return np.floor(x + 0.5)

def misses(pl, lat, lon, cfg, fields=KEYS, detail=False):
    r = pl.raw(lat, lon, cfg['sun'], cfg['hour'], cfg['angles'], cfg['h0'], cfg['signed'])
    n = 0; per = {}
    for k in fields:
        v = rounded(r[k] + cfg['margins'][k], cfg['round'])
        d = (v - pl.p[k] + 720) % 1440 - 720
        ok = np.isfinite(d) & np.isfinite(pl.p[k])
        m = int((ok & (d != 0)).sum()); n += m; per[k] = (int(ok.sum()) - m, int(ok.sum()))
    return (n, per) if detail else n

def fit_place(pl, cfg, fields, steps=(0.01, 0.002, 0.0005, 0.0001)):
    b = (misses(pl, pl.lat0, pl.lon0, cfg, fields), pl.lat0, pl.lon0)
    for step in steps:
        improved = True
        while improved:
            improved = False
            for i, j in itertools.product((-2, -1, 0, 1, 2), repeat=2):
                if i == j == 0: continue
                la, lo = b[1] + i * step, b[2] + j * step
                m = misses(pl, la, lo, cfg, fields)
                if m < b[0]: b = (m, la, lo); improved = True
    return b

def load(auth):
    pts = json.load(open(os.path.join(REPO, AUTH[auth]['coords'])))
    out = []; seen = set()
    for c in pts:
        if c.get('lat') is None or c['id'] in seen: continue
        seen.add(c['id'])
        if 'lon' not in c: c['lon'] = c.get('lng')
        f = os.path.join(data_root(auth), 'v1/cities', f"{c['id']}.json")
        if os.path.exists(f):
            pl = Place(auth, c['id'], c['lat'], c['lon'])
            # a town on a hill: the horizon lowered by DIP_K * sqrt(height in m) degrees
            pl.dip = float(os.environ.get('DIP_K', '0')) * math.sqrt(max(c.get('heightM') or 0, 0))
            out.append((c, pl))
    return out

if __name__ == '__main__':
    auth, mode = sys.argv[1], sys.argv[2]
    m = arg('--margins', '0,0,0,0,3,0')
    hour_arg = arg('--hour', '0')
    cfg = dict(sun=arg('--sun', 'almanac'), hour=('event' if hour_arg == 'event' else float(hour_arg)), round=arg('--round', 'nearest'),
               angles=tuple(map(float, arg('--angles', '18,17').split(','))), h0=arg('--h0', -0.833, float),
               signed='--signed' in sys.argv, margins=dict(zip(KEYS, map(float, m.split(',')))))
    places = load(auth)
    if '--limit' in sys.argv: places = places[:arg('--limit', 0, int)]
    if mode == 'resid':
        # raw (no margin) minus printed, per prayer: the spread shows the rounding, the centre the margin
        allv = {k: [] for k in KEYS}
        for c, pl in places:
            r = pl.raw(pl.lat0, pl.lon0, cfg['sun'], cfg['hour'], cfg['angles'], cfg['h0'], cfg['signed'])
            for k in KEYS:
                d = (r[k] - pl.p[k] + 720) % 1440 - 720
                allv[k] += list(d[np.isfinite(d)])
        for k in KEYS:
            v = np.array(allv[k])
            print(f'{k:8s} n {len(v)}  mean {v.mean():+.3f}  p1 {np.percentile(v,1):+.3f} p5 {np.percentile(v,5):+.3f} median {np.median(v):+.3f} p95 {np.percentile(v,95):+.3f} p99 {np.percentile(v,99):+.3f}')
    elif mode == 'margins':
        # alternate: continuous per-prayer margins (global) <-> per-place coordinates
        coords = {c['id']: (pl.lat0, pl.lon0) for c, pl in places}
        fields = arg('--fields', ','.join(KEYS)).split(',')
        for it in range(arg('--iter', 3, int)):
            raws = {c['id']: pl.raw(*coords[c['id']], cfg['sun'], cfg['hour'], cfg['angles'], cfg['h0'], cfg['signed']) for c, pl in places}
            for k in fields:
                best = None
                for mg in np.arange(cfg['margins'][k] - 1.5, cfg['margins'][k] + 1.5, 0.02):
                    tot = 0
                    for c, pl in places:
                        d = rounded(raws[c['id']][k] + mg, cfg['round']) - pl.p[k]
                        tot += int((np.isfinite(d) & (d != 0)).sum())
                    if best is None or tot < best[0]: best = (tot, mg)
                cfg['margins'][k] = round(float(best[1]), 3)
            tot = 0
            for c, pl in places:
                b = fit_place(pl, cfg, fields); coords[c['id']] = (b[1], b[2]); tot += b[0]
            print(f'iter {it}: margins', cfg['margins'], 'misses', tot, flush=True)
    elif mode == 'dipfit':
        # with saved coordinates: each place's own horizon dip (degrees), from sunrise and Maghrib
        saved = json.load(open(os.path.expanduser(arg('--coords'))))
        fields = arg('--fields', 'sunrise,maghrib').split(',')
        tot = n = 0; out = {}
        for c, pl in places:
            s = saved.get(str(c['id']))
            if not s: continue
            best = None
            for dip in np.arange(float(os.environ.get("DIP_MIN", "-0.5")), 2.0, 0.005):
                pl.dip = dip
                m = misses(pl, s['lat'], s['lon'], cfg, fields)
                if best is None or m < best[0]: best = (m, dip)
            pl.dip = best[1]; out[str(c['id'])] = dict(s, dip=round(float(best[1]), 3), height=c.get('heightM'))
            mm, per = misses(pl, s['lat'], s['lon'], cfg, KEYS, detail=True)
            tot += mm; n += sum(x[1] for x in per.values())
            print(f"{c['id']:>4} h {c.get('heightM')}  dip {best[1]:.3f}  k {best[1] / max(math.sqrt(c.get('heightM') or 0), 1e-9):.4f}  misses {mm} " + ' '.join(f'{k} {per[k][0]}/{per[k][1]}' for k in KEYS), flush=True)
        print('TOTAL', tot, 'of', n)
        if '--save' in sys.argv: json.dump(out, open(os.path.expanduser(arg('--save')), 'w'), indent=1)
    elif mode == 'excess':
        # with saved coordinates: for each miss, how far the raw time lies outside its printed minute's window
        saved = json.load(open(os.path.expanduser(arg('--coords'))))
        rows = []
        for c, pl in places:
            s = saved.get(str(c['id'])) or saved.get(c['id'])
            if not s: continue
            r = pl.raw(s['lat'], s['lon'], cfg['sun'], cfg['hour'], cfg['angles'], cfg['h0'], cfg['signed'])
            for k in KEYS:
                x = r[k] + cfg['margins'][k]
                lo, hi = (pl.p[k] - 1, pl.p[k]) if cfg['round'] == 'ceil' else ((pl.p[k], pl.p[k] + 1) if cfg['round'] == 'floor' else (pl.p[k] - .5, pl.p[k] + .5))
                ex = np.where(x > hi, x - hi, np.where(x <= lo, x - lo, 0.0))
                for i in np.nonzero(np.isfinite(ex) & (ex != 0))[0]:
                    rows.append((k, pl.dates[i], c['id'], str(c.get('nameEn'))[:12], float(ex[i])))
        rows.sort(key=lambda t: (t[0], t[1]))
        for t in rows: print(f'{t[0]:8s} {t[1]} {t[2]:>5} {t[3]:12s} {t[4]:+.4f}')
        e = np.array([abs(t[4]) for t in rows]) if rows else np.zeros(1)
        print('n', len(rows), 'median |excess|', np.median(e), 'p90', np.percentile(e, 90), 'max', e.max())
    elif mode == 'fit':
        fields = arg('--fields', ','.join(KEYS)).split(',')
        tot = n = 0; res = {}
        for c, pl in places:
            b = fit_place(pl, cfg, fields)
            mm, per = misses(pl, b[1], b[2], cfg, KEYS, detail=True)
            res[c['id']] = dict(name=c.get('nameEn') or c.get('name'), lat=b[1], lon=b[2], misses=mm, per=per)
            tot += mm; n += sum(x[1] for x in per.values())
            if '--verbose' in sys.argv: print(f"{str(c.get('nameEn'))[:14]:14s} {b[1]:.4f} {b[2]:.4f} (geo {c['lat']:.4f} {c['lon']:.4f}) misses {mm}  " + ' '.join(f'{k} {per[k][0]}/{per[k][1]}' for k in KEYS), flush=True)
        agg = {k: sum(r['per'][k][1] - r['per'][k][0] for r in res.values()) for k in KEYS}
        print(f'TOTAL {len(res)} places: {tot} misses of {n} ({100 * tot / max(n, 1):.3f}%)', agg)
        if '--save' in sys.argv: json.dump(res, open(os.path.expanduser(arg('--save')), 'w'), indent=1, ensure_ascii=False)
