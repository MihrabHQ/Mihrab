"""Find Diyanet's exact inputs: for a city, which sun model and which coordinates make EVERY printed minute
(4 years of astronomical sunrise/sunset, Dhuhr, Asr, qibla time, and Fajr/Isha where the true angle applies)
round exactly. Each printed minute M constrains the raw time r to M-0.5 <= r < M+0.5.

    python3 tools/verify-methods/diyanet-exact.py 14351 [--models a,b] [--verbose]
"""
import json, os, sys, math, datetime as dt
from zoneinfo import ZoneInfo
import numpy as np

CACHE = os.path.expanduser('~/.cache/mihrab/diyanet')
TZ = ZoneInfo('Europe/Stockholm')
RAD = math.pi / 180
KAABA = (21.4225, 39.8262)

def load(iid):
    rows = []
    for y in range(2024, 2028):
        p = os.path.join(CACHE, 'raw', f'{iid}_{y}.json')
        if not os.path.exists(p): continue
        for r in json.load(open(p)):
            d, m, yy = map(int, r['gregorianDateShort'].split('.'))
            date = dt.date(yy, m, d)
            # skip the clock-change days: the printed clock is ambiguous there
            off0 = dt.datetime(yy, m, d, 0, tzinfo=TZ).utcoffset(); off1 = dt.datetime(yy, m, d, 23, tzinfo=TZ).utcoffset()
            if off0 != off1: continue
            rows.append((date, off0.total_seconds() / 60, r))
    return rows

def mins(s):
    # malformed placeholders (Boden's midnight-sun sunset prints '1.00:') are missing values
    if not s or len(s) != 5 or s[2] != ':' or not (s[:2] + s[3:]).isdigit(): return float('nan')
    return int(s[:2]) * 60 + int(s[3:])

# ---------------- sun models: (dec rad, eot min) at a UTC instant (days since J2000.0, float) ----------------
def almanac(D):
    g = (357.529 + 0.98560028 * D) % 360 * RAD
    q = (280.459 + 0.98564736 * D) % 360
    L = (q + 1.915 * np.sin(g) + 0.020 * np.sin(2 * g)) % 360
    e = (23.439 - 0.00000036 * D) * RAD
    ra = np.degrees(np.arctan2(np.cos(e) * np.sin(L * RAD), np.cos(L * RAD))) / 15 % 24
    eqt = q / 15 - ra; eqt = (eqt + 12) % 24 - 12
    return np.arcsin(np.sin(e) * np.sin(L * RAD)), eqt * 60

def make_almanac(L0, Lr, g0, gr, e0, er):
    def f(D):
        g = (g0 + gr * D) % 360 * RAD
        q = (L0 + Lr * D) % 360
        L = (q + 1.915 * np.sin(g) + 0.020 * np.sin(2 * g)) % 360
        e = (e0 - er * D) * RAD
        ra = np.degrees(np.arctan2(np.cos(e) * np.sin(L * RAD), np.cos(L * RAD))) / 15 % 24
        eqt = q / 15 - ra; eqt = (eqt + 12) % 24 - 12
        return np.arcsin(np.sin(e) * np.sin(L * RAD)), eqt * 60
    return f
aa_old = make_almanac(280.460, 0.9856474, 357.528, 0.9856003, 23.439, 0.0000004)

def make_meeus(aberr=False, nut_lon=False, nut_obl=False, eot_from='L0', c3=True, dec_aberr=None, dec_nut_lon=None, dec_nut_obl=None):
    """Meeus ch. 25 mean elements; optional apparent-place corrections."""
    def f(D):
        T = D / 36525
        L0 = (280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360
        M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) * RAD
        C = (1.914602 - T * (0.004817 + 0.000014 * T)) * np.sin(M) + (0.019993 - 0.000101 * T) * np.sin(2 * M) + (0.000289 * np.sin(3 * M) if c3 else 0)
        om = (125.04 - 1934.136 * T) * RAD
        lam = L0 + C
        if aberr: lam = lam - 0.00569
        if nut_lon: lam = lam - 0.00478 * np.sin(om)
        eps = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
        if nut_obl == 'full':
            Lm = (280.4665 + 36000.7698 * T) * RAD; Lmoon = (218.3165 + 481267.8813 * T) * RAD
            eps = eps + (9.20 * np.cos(om) + 0.57 * np.cos(2 * Lm) + 0.10 * np.cos(2 * Lmoon) - 0.09 * np.cos(2 * om)) / 3600
        elif nut_obl: eps = eps + 0.00256 * np.cos(om)
        ra = np.degrees(np.arctan2(np.cos(eps * RAD) * np.sin(lam * RAD), np.cos(lam * RAD))) % 360
        dlam, deps = L0 + C, eps
        if (aberr if dec_aberr is None else dec_aberr): dlam = dlam - 0.00569
        if (nut_lon if dec_nut_lon is None else dec_nut_lon): dlam = dlam - 0.00478 * np.sin(om)
        if (nut_obl if dec_nut_obl is None else dec_nut_obl) and not nut_obl: deps = deps + 0.00256 * np.cos(om)
        if nut_obl and dec_nut_obl is False: deps = deps - 0.00256 * np.cos(om)
        dec = np.arcsin(np.sin(deps * RAD) * np.sin(dlam * RAD))
        eot = ((L0 - ra + 180) % 360 - 180) * 4
        return dec, eot
    return f

def make_meeus28(full=False, use_L0_eot=False):
    """Meeus ch. 25 apparent sun and ch. 28 equation of time: E = L0 - 0.0057183 - alpha + dpsi*cos(eps)."""
    def f(D):
        T = D / 36525
        L0 = (280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360
        M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) * RAD
        C = (1.914602 - T * (0.004817 + 0.000014 * T)) * np.sin(M) + (0.019993 - 0.000101 * T) * np.sin(2 * M) + 0.000289 * np.sin(3 * M)
        om = (125.04 - 1934.136 * T) * RAD
        eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
        if full:
            Lm = (280.4665 + 36000.7698 * T) * RAD; Lmoon = (218.3165 + 481267.8813 * T) * RAD
            dpsi = (-17.20 * np.sin(om) - 1.32 * np.sin(2 * Lm) - 0.23 * np.sin(2 * Lmoon) + 0.21 * np.sin(2 * om)) / 3600
            deps = (9.20 * np.cos(om) + 0.57 * np.cos(2 * Lm) + 0.10 * np.cos(2 * Lmoon) - 0.09 * np.cos(2 * om)) / 3600
        else:
            dpsi = -0.00478 * np.sin(om); deps = 0.00256 * np.cos(om)
        lam = L0 + C - 0.00569 + dpsi
        eps = eps0 + deps
        ra = np.degrees(np.arctan2(np.cos(eps * RAD) * np.sin(lam * RAD), np.cos(lam * RAD))) % 360
        dec = np.arcsin(np.sin(eps * RAD) * np.sin(lam * RAD))
        E = L0 - 0.0057183 - ra + dpsi * np.cos(eps * RAD)
        eot = ((E + 180) % 360 - 180) * 4
        return dec, eot
    return f

def make_noaa(y_corr=False, D_shift=0.0):
    def f(D):
        return noaa(D + D_shift, y_corr)
    return f

def noaa(D, y_corr=False):
    T = D / 36525
    L0 = (280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360
    M = 357.52911 + T * (35999.05029 - 0.0001537 * T)
    ecc = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
    Mr = M * RAD
    C = (1.914602 - T * (0.004817 + 0.000014 * T)) * np.sin(Mr) + (0.019993 - 0.000101 * T) * np.sin(2 * Mr) + 0.000289 * np.sin(3 * Mr)
    om = (125.04 - 1934.136 * T) * RAD
    lam = L0 + C - 0.00569 - 0.00478 * np.sin(om)
    eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
    eps = eps0 + 0.00256 * np.cos(om)
    dec = np.arcsin(np.sin(eps * RAD) * np.sin(lam * RAD))
    y = np.tan((eps if y_corr else eps0) * RAD / 2) ** 2
    L0r = L0 * RAD
    eot = 4 / RAD * (y * np.sin(2 * L0r) - 2 * ecc * np.sin(Mr) + 4 * ecc * y * np.sin(Mr) * np.cos(2 * L0r) - 0.5 * y * y * np.sin(4 * L0r) - 1.25 * ecc * ecc * np.sin(2 * Mr))
    return dec, eot

def noaa32(D):
    f = np.float32
    D = np.asarray(D, dtype=np.float32)
    T = D / f(36525)
    L0 = np.mod(f(280.46646) + T * (f(36000.76983) + f(0.0003032) * T), f(360))
    M = f(357.52911) + T * (f(35999.05029) - f(0.0001537) * T)
    ecc = f(0.016708634) - T * (f(0.000042037) + f(0.0000001267) * T)
    Mr = M * f(RAD)
    C = (f(1.914602) - T * (f(0.004817) + f(0.000014) * T)) * np.sin(Mr) + (f(0.019993) - f(0.000101) * T) * np.sin(2 * Mr) + f(0.000289) * np.sin(3 * Mr)
    om = (f(125.04) - f(1934.136) * T) * f(RAD)
    lam = L0 + C - f(0.00569) - f(0.00478) * np.sin(om)
    eps0 = f(23) + (f(26) + (f(21.448) - T * (f(46.815) + T * (f(0.00059) - T * f(0.001813)))) / f(60)) / f(60)
    eps = eps0 + f(0.00256) * np.cos(om)
    dec = np.arcsin(np.sin(eps * f(RAD)) * np.sin(lam * f(RAD)))
    y = np.tan(eps * f(RAD) / 2) ** 2
    L0r = L0 * f(RAD)
    eot = f(4 / RAD) * (y * np.sin(2 * L0r) - 2 * ecc * np.sin(Mr) + 4 * ecc * y * np.sin(Mr) * np.cos(2 * L0r) - f(0.5) * y * y * np.sin(4 * L0r) - f(1.25) * ecc * ecc * np.sin(2 * Mr))
    return dec.astype(np.float64), eot.astype(np.float64)

import os as _os
DEC_ROUND = float(_os.environ.get('DEC_ROUND', '0'))   # arcminutes; 0 = none
EOT_ROUND = float(_os.environ.get('EOT_ROUND', '0'))   # seconds; 0 = none
def rounded(f):
    def g(D):
        dec, eot = f(D)
        if DEC_ROUND: dec = np.round(np.degrees(dec) * 60 / DEC_ROUND) * DEC_ROUND / 60 * RAD
        if EOT_ROUND: _o = float(_os.environ.get('EOT_ROUND_OFF', '0')); eot = (np.round((eot * 60 + _o) / EOT_ROUND) * EOT_ROUND - _o) / 60
        return dec, eot
    return g
MODELS = {'almanac': rounded(almanac), 'noaa': rounded(noaa), 'noaa_y': rounded(make_noaa(True)), 'noaa32': rounded(noaa32),
          'noaa_tt': rounded(make_noaa(False, 69.2/86400)), 'noaa_y_tt': rounded(make_noaa(True, 69.2/86400)), 'aa': rounded(aa_old),
          'm_true': rounded(make_meeus()), 'm_ab': rounded(make_meeus(aberr=True)),
          'm_app': rounded(make_meeus(aberr=True, nut_lon=True, nut_obl=True)),
          'm_ab_nl': rounded(make_meeus(aberr=True, nut_lon=True)), 'm_true_c2': rounded(make_meeus(c3=False)),
          'd_ab': rounded(make_meeus(dec_aberr=True)), 'd_nl': rounded(make_meeus(dec_nut_lon=True)),
          'd_no': rounded(make_meeus(dec_nut_obl=True)), 'd_app': rounded(make_meeus(dec_aberr=True, dec_nut_lon=True, dec_nut_obl=True)),
          'd_ab_no': rounded(make_meeus(dec_aberr=True, dec_nut_obl=True)), 'd_nl_no': rounded(make_meeus(dec_nut_lon=True, dec_nut_obl=True)),
          'm_no': rounded(make_meeus(nut_obl=True)), 'm28': rounded(make_meeus28()), 'm28full': rounded(make_meeus28(full=True)), 'm_nofull': rounded(make_meeus(nut_obl='full'))}

def day_number(date, hours_utc):
    """Days since J2000.0 (2000-01-01 12:00 TT ~ UT) at `hours_utc` on `date`."""
    return (dt.date(date.year, date.month, date.day) - dt.date(2000, 1, 1)).days - 0.5 + hours_utc / 24

# ---------------- the times, minutes past 00:00 UTC, vectorised over days ----------------
def compute(dates, lat, lon, model, at, iterate):
    """at: 'ut0' (0h UT), 'lmn' (local mean midnight), 'noon' (local mean noon), or a float hours UTC."""
    f = MODELS[model]
    if at == 'ut0': h = np.zeros(len(dates))
    elif at == 'lmn': h = np.full(len(dates), -lon / 15)
    elif at == 'noon': h = np.full(len(dates), 12 - lon / 15)
    else: h = np.full(len(dates), float(at))
    D = np.array([day_number(d, 0) for d in dates]) + h / 24
    dec, eot = f(D)
    transit = 720 - 4 * lon - eot
    phi = lat * RAD
    def ha(alt, dec):
        c = (np.sin(alt * RAD) - np.sin(phi) * np.sin(dec)) / (np.cos(phi) * np.cos(dec))
        with np.errstate(invalid='ignore'):
            return np.where(np.abs(c) <= 1, np.degrees(np.arccos(np.clip(c, -1, 1))) * 4, np.nan)
    def event(alt, sign):
        t = transit + sign * ha(alt, dec)
        for _ in range(iterate):
            d2, e2 = f(np.array([day_number(x, 0) for x in dates]) + t / 1440)
            tr2 = 720 - 4 * lon - e2
            t = tr2 + sign * ha(alt, d2)
        return t
    out = {}
    out['transit'] = transit if not iterate else None
    if iterate:
        t = transit
        for _ in range(iterate):
            _, e2 = f(np.array([day_number(x, 0) for x in dates]) + t / 1440); t = 720 - 4 * lon - e2
        out['transit'] = t
    out['rise'] = event(-0.833, -1)
    out['set'] = event(-0.833, 1)
    out['fajr'] = event(-18, -1)
    out['isha'] = event(-16, 1)
    noon_alt = 90 - np.abs(lat - np.degrees(dec))
    asr_alt = np.degrees(np.arctan(1 / (1 + np.tan((90 - noon_alt) * RAD))))
    out['asr'] = np.array([np.nan] * len(dates))
    for i in range(len(dates)):
        pass
    out['asr'] = transit + ha_vec(asr_alt, dec, phi)
    # qibla: the instant the sun's azimuth is the qibla's (morning, clockwise from north)
    q = qibla_azimuth(lat, lon)
    out['qibla'] = transit + qibla_hour_angle(q, dec, phi)
    return out

def ha_vec(alt, dec, phi):
    c = (np.sin(alt * RAD) - np.sin(phi) * np.sin(dec)) / (np.cos(phi) * np.cos(dec))
    with np.errstate(invalid='ignore'):
        return np.where(np.abs(c) <= 1, np.degrees(np.arccos(np.clip(c, -1, 1))) * 4, np.nan)

def qibla_azimuth(lat, lon):
    p1, l1 = lat * RAD, lon * RAD; p2, l2 = KAABA[0] * RAD, KAABA[1] * RAD
    return (math.degrees(math.atan2(math.sin(l2 - l1), math.cos(p1) * math.tan(p2) - math.sin(p1) * math.cos(l2 - l1))) + 360) % 360

def qibla_hour_angle(q, dec, phi):
    """Minutes from transit (negative: morning) at which the sun's azimuth equals q, by bisection."""
    def az(H):  # H in degrees, azimuth from north clockwise
        Hr = H * RAD
        return (np.degrees(np.arctan2(np.sin(Hr), np.cos(Hr) * np.sin(phi) - np.tan(dec) * np.cos(phi))) + 180) % 360
    lo = np.full(dec.shape, -179.9); hi = np.full(dec.shape, 0.0)
    for _ in range(50):
        mid = (lo + hi) / 2
        a = az(mid)
        go_right = a < q  # azimuth grows through the morning towards 180 at noon
        lo = np.where(go_right, mid, lo); hi = np.where(go_right, hi, mid)
    return (lo + hi) / 2 * 4

# ---------------- constraints ----------------
FIELDS = [  # (name in output, field in row, offset printed - raw)
    ('rise', 'astronomicalSunrise', 0), ('set', 'astronomicalSunset', 0), ('transit', 'dhuhr', 5),
    ('asr', 'asr', 4), ('qibla', 'qiblaTime', 0), ('fajr', 'fajr', 0), ('isha', 'isha', 0)]

def violations(rows, lat, lon, model, at, iterate, qoff=0, use=None, detail=False):
    dates = [r[0] for r in rows]
    t = compute(dates, lat, lon, model, at, iterate)
    tot = 0; n = 0; hits = {}; total = {}; worst = []
    for name, field, off in FIELDS:
        if use and name not in use: continue
        raw = t[name] + (qoff if name == 'qibla' else 0)
        for i, (date, offset, r) in enumerate(rows):
            v = raw[i]
            if not np.isfinite(v): continue
            # Fajr/Isha only where the true angle is printed; sunrise/sunset only where not floored
            printed = mins(r[field]) - offset - off
            # unwrap to the raw value's day
            while printed - v > 720: printed -= 1440
            while v - printed > 720: printed += 1440
            gap = abs(v - printed)
            if name in ('fajr', 'isha') and gap > 3: continue   # takdir days: not the true angle
            if name in ('rise', 'set') and gap > 3: continue    # floored days
            total[name] = total.get(name, 0) + 1
            if gap < 0.5: hits[name] = hits.get(name, 0) + 1
            else:
                tot += (gap - 0.5) ** 2; n += 1
                if detail: worst.append((round(gap - 0.5, 3), name, str(date), r[field], round((v + offset + off) % 1440, 3)))
    return tot, n, hits, total, sorted(worst, reverse=True)[:12]

def fit(rows, model, at, iterate, lat0, lon0, use=None):
    """Coordinates minimising the violations, coarse to fine."""
    best = (float('inf'), lat0, lon0)
    for step in (0.02, 0.005, 0.001, 0.0002, 0.00005):
        la0, lo0 = best[1], best[2]
        for i in range(-6, 7):
            for j in range(-6, 7):
                la, lo = la0 + i * step, lo0 + j * step
                s, n, *_ = violations(rows, la, lo, model, at, iterate, use=use)
                if (n, s) < (best[0] if isinstance(best[0], tuple) else (float('inf'), 0)):
                    best = ((n, s), la, lo)
        best = (best[0], best[1], best[2])
    return best

if __name__ == '__main__':
    iid = sys.argv[1]
    rows = load(iid)
    idx = json.load(open(os.path.join(CACHE, 'index.json')))
    print(idx[iid], len(rows), 'days')
    lat0 = float(sys.argv[sys.argv.index('--lat') + 1]) if '--lat' in sys.argv else 59.3333
    lon0 = float(sys.argv[sys.argv.index('--lon') + 1]) if '--lon' in sys.argv else 18.0333
    models = sys.argv[sys.argv.index('--models') + 1].split(',') if '--models' in sys.argv else ['almanac', 'noaa']
    ats = sys.argv[sys.argv.index('--at') + 1].split(',') if '--at' in sys.argv else ['ut0', 'lmn', 'noon']
    use = sys.argv[sys.argv.index('--use') + 1].split(',') if '--use' in sys.argv else ['rise', 'set', 'transit', 'asr']
    for model in models:
        for at in ats:
            for it in (0, 1):
                (n, s), la, lo = fit(rows, model, at, it, lat0, lon0, use=use)
                _, _, hits, total, worst = violations(rows, la, lo, model, at, it, use=None, detail=True)
                print(f'{model:8s} at={at:5s} iter={it}  lat {la:.5f} lon {lo:.5f}  misses(fit fields) {n}  ' +
                      ' '.join(f'{k} {hits.get(k,0)}/{total[k]}' for k in total), flush=True)
                if '--verbose' in sys.argv: print('   worst', worst[:6])

def _mix(dec_model, eot_model='noaa'):
    def f(D):
        return MODELS[dec_model](D)[0], MODELS[eot_model](D)[1]
    return f
for _k in ['almanac', 'm_true', 'm_app', 'aa', 'm_ab', 'd_app', 'm_no']:
    MODELS['mix_' + _k] = _mix(_k)

def _jpl():
    g = None
    def f(D):
        nonlocal g
        if g is None: g = np.load(_os.path.expanduser(_os.environ.get('SUN_JPL', '~/.cache/mihrab/sun-jpl.npz')))
        D = np.asarray(D, dtype=float)
        return np.interp(D, g['D'], g['dec']), np.interp(D, g['D'], g['eot'])
    return f
MODELS['jpl'] = rounded(_jpl())
MODELS['mix_jpl'] = _mix('jpl')          # JPL declination, NOAA equation of time
MODELS['jpl_eot_noaa_dec'] = _mix('noaa', 'jpl')

def _moon(sign, amp=6.454):
    def f(D):
        dec, eot = noaa(D, True)
        T = np.asarray(D) / 36525
        Dm = (297.8501921 + 445267.1114034 * T) * RAD   # Moon's mean elongation
        dl = amp / 3600 * np.sin(Dm)                      # Earth-Moon barycentre wobble in the Sun's longitude, deg
        return dec, eot + sign * 4 * dl
    return f
MODELS['noaa_moon+'] = _moon(1); MODELS['noaa_moon-'] = _moon(-1)
