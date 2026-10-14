"""namazvakti.com (Türkiye Takvimi): one city's year against bare astronomy, per column.

    python3 nv-resid.py /tmp/nvs/xml/16741.xml [sun]

Prints, per column, raw − printed (minutes): mean, min, max, and a monthly profile. The raw times are the
sun at 0° (sunrise/sunset, upper limb not included), 19° (Imsak), 18° (Sabah), 17° (Isha), transit, Asr 1 and 2.
"""
import sys, re, os, math, datetime as dt, importlib.util
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('dx', os.path.join(HERE, 'diyanet-exact.py'))
dx = importlib.util.module_from_spec(spec); spec.loader.exec_module(dx)
RAD = math.pi / 180

def parse(path):
    s = open(path, encoding='utf-8').read()
    head = re.search(r'<cityinfo ([^>]*)>', s).group(1)
    a = dict(re.findall(r'(\w+)="([^"]*)"', head))
    lat = (int(a['arzDer']) + int(a['arzDak']) / 60) * (1 if a['arzYon'] == 'N' else -1)
    lon = (int(a['tulDer']) + int(a['tulDak']) / 60) * (1 if a['tulYon'] == 'E' else -1)
    mer = (int(a['STulDer']) + int(a['STulDak']) / 60) * (1 if a['STulYon'] == 'E' else -1)
    ym = re.search(r'<!--(\d{4})-->', s); year = int(ym.group(1)) if ym else int(os.environ.get('NV_YEAR', '2026'))
    rows = []
    for m in re.finditer(r'<prayertimes dayofyear="(\d+)" day="(\d+)" month="(\d+)">([^<]*)</prayertimes>', s):
        doy, d, mo = int(m.group(1)), int(m.group(2)), int(m.group(3))
        y = year - 1 if doy == 0 else (year + 1 if mo == 1 and doy > 300 else year)
        cols = m.group(4).split('\t')
        def mins(t):
            t = t.strip().lstrip('*')   # '*' marks a time held over from another day (the high north)
            return int(t.split(':')[0]) * 60 + int(t.split(':')[1]) if ':' in t else float('nan')
        rows.append((dt.date(y, mo, d), [mins(c) for c in cols[:14]], doy))
    return dict(a=a, lat=lat, lon=lon, mer=mer, height=float(a.get('height') or 0), rows=rows,
                summer=(a.get('summerStart'), a.get('summerEnd')), name=a.get('cityNameEN'))

def summer_offset(c):
    a, b = c['summer']
    if not a or not b: return np.zeros(len(c['rows']))
    a, b = int(a), int(b)
    doy = np.array([r[2] for r in c['rows']])
    inside = ((doy >= a) & (doy < b)) if a <= b else ((doy >= a) | (doy < b))   # the south: summer spans the new year
    return np.where(inside, 60.0, 0.0)

def raw_times(lat, lon, dates, sun='m28full', at_event=True):
    D0 = np.array([(d - dt.date(2000, 1, 1)).days - 0.5 for d in dates])
    f = dx.MODELS[sun]
    at = lambda t: f(D0 + t / 1440)
    noon = np.full(len(D0), 720 - 4 * lon)
    for _ in range(3): noon = 720 - 4 * lon - at(noon)[1]
    sp, cp = math.sin(lat * RAD), math.cos(lat * RAD)
    def ev(alt_of, sign, start):
        t = start.copy()
        for _ in range(3):
            dec, eot = at(t if at_event else noon)
            c = (np.sin(np.radians(alt_of(dec))) - sp * np.sin(dec)) / (cp * np.cos(dec))
            with np.errstate(invalid='ignore'):
                h = np.where(np.abs(c) <= 1, np.degrees(np.arccos(np.clip(c, -1, 1))) * 4, np.nan)
            t = 720 - 4 * lon - eot + sign * h
        return t
    K = lambda a: (lambda dec: a)
    asr = lambda s: (lambda dec: np.degrees(np.arctan(1 / (s + np.tan(np.abs(lat * RAD - dec))))))
    return dict(f19=ev(K(-19), -1, noon - 420), f18=ev(K(-18), -1, noon - 420), rise=ev(K(0), -1, noon - 360), noon=noon,
                asr1=ev(asr(1), 1, noon + 200), asr2=ev(asr(2), 1, noon + 240), set=ev(K(0), 1, noon + 360),
                i17=ev(K(-17), 1, noon + 420), i19=ev(K(-19), 1, noon + 420))

if __name__ == '__main__':
    c = parse(sys.argv[1]); sun = sys.argv[2] if len(sys.argv) > 2 else 'm28full'
    dates = [r[0] for r in c['rows']]; P = np.array([r[1] for r in c['rows']], dtype=float)
    off = c['mer'] * 4   # the file's clock: the standard meridian (summer time ignored here)
    R = raw_times(c['lat'], c['lon'], dates, sun)
    print(c['name'], 'lat', c['lat'], 'lon', c['lon'], 'mer', c['mer'], 'height', c['height'], 'summer', c['summer'])
    pairs = [('imsak', 0, 'f19'), ('sabah', 1, 'f18'), ('sunrise', 2, 'rise'), ('dhuhr', 5, 'noon'), ('asr', 6, 'asr1'), ('asr2', 7, 'asr2'), ('maghrib', 9, 'set'), ('isha', 11, 'i17'), ('isha2', 12, 'i19')]
    months = np.array([d.month for d in dates])
    for name, col, k in pairs:
        x = R[k] + off - P[:, col]
        x = (x + 720) % 1440 - 720
        ok = np.isfinite(x)
        prof = ' '.join(f'{np.nanmean(x[(months == m) & ok]):+.2f}' for m in range(1, 13))
        print(f'{name:8s} mean {np.nanmean(x):+6.2f} min {np.nanmin(x):+6.2f} max {np.nanmax(x):+6.2f} | {prof}')

def windows(path, sun='m28full', at_event=True):
    """Per column: the shifts s that make ceil(raw + s) (and floor) equal the printed minute on every day."""
    c = parse(path); dates = [r[0] for r in c['rows']]; P = np.array([r[1] for r in c['rows']], dtype=float)
    R = raw_times(c['lat'], c['lon'], dates, sun, at_event); off = c['mer'] * 4 + summer_offset(c)
    out = {}
    for name, col, k in [('imsak', 0, 'f19'), ('sabah', 1, 'f18'), ('sunrise', 2, 'rise'), ('dhuhr', 5, 'noon'), ('asr', 6, 'asr1'), ('asr2', 7, 'asr2'), ('maghrib', 9, 'set'), ('isha', 11, 'i17'), ('isha2', 12, 'i19')]:
        x = R[k] + off; p = P[:, col]
        d = (p - x + 720) % 1440 - 720   # printed - raw
        ok = np.isfinite(d)
        # ceil(x + s) == p  <=> p - 1 < x + s <= p  <=> s in (d - 1, d]
        out[name] = dict(ceil=(float(np.max(d[ok] - 1)), float(np.min(d[ok]))), floor=(float(np.max(d[ok])), float(np.min(d[ok] + 1))))
    return c, out
