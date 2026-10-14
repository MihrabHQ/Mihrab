"""
The International Prayer Times Congress method (Istanbul 2021; Diyanet
and the European Council for Fatwa), as published at awqatsalah.com
("Tespit Kriterleri") and as its tables turn out to realise it — the
tables Islamiska Förbundet prints for Sweden are Diyanet's, row for row.

    python3 tools/verify-methods/congress-model.py stockholm 59.3333 18.0333 [--as-year 2026] [--days a:b]

Exact-minute agreement per prayer is printed; the aim is 100 %.
"""
import json, math, os, sys, datetime as dt
from zoneinfo import ZoneInfo

TZ = ZoneInfo('Europe/Stockholm')
RAD = math.pi / 180
DAY = dt.timedelta(days=1)

# ---------- the sun, as the tables take it: the Almanac's low-precision position at 0h UT ----------
SOLAR_HOUR = None    # None: the sun's position at 0h UT of the date (the Almanac's day); a number: hours past local solar midnight
RISE_SET, FAJR, ISHA = -0.833, -18, -16
TEMKIN = dict(sunrise=-7, dhuhr=5, asr=4, maghrib=7)
FLOOR = 300           # minutes: the day and the night are never shorter
BAND = 20             # minutes: the gradual transition's reach
ANCHOR_SLACK = 1      # minutes: a midsummer night this close to the floor counts as floored
ROUND = 'nearest'

SUN = 'diyanet'
RATIO = 'next'
ITER = 0
RAMP_END = os.environ.get('RAMP_END', 'band')
RATIO_ROUND = os.environ.get('RATIO_ROUND') == '1'
CARRY_ROUND = os.environ.get('CARRY_ROUND') == '1'
CARRY_RUN = os.environ.get('CARRY_RUN', '1') == '1'

# Diyanet's sun, read off its tables (diyanet-*.py, October 2026): Meeus's mean elements and
# equation of the centre, the TRUE (geometric) longitude, the apparent obliquity (mean + nutation),
# the equation of time as L0 - RA, all at 0h UT less 45 s, the equation of time 0.106 s later.
DIYANET_INSTANT_S = -45
DIYANET_EOT_ADD_MIN = 0.00176

def sun_diyanet(t_utc):
    jd = t_utc.timestamp() / 86400 + 2440587.5
    T = (jd - 2451545.0) / 36525
    L0 = (280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360
    M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) * RAD
    C = (1.914602 - T * (0.004817 + 0.000014 * T)) * math.sin(M) + (0.019993 - 0.000101 * T) * math.sin(2 * M) + 0.000289 * math.sin(3 * M)
    om = (125.04 - 1934.136 * T) * RAD
    Lm = (280.4665 + 36000.7698 * T) * RAD; Lmoon = (218.3165 + 481267.8813 * T) * RAD
    eps = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
    eps += (9.20 * math.cos(om) + 0.57 * math.cos(2 * Lm) + 0.10 * math.cos(2 * Lmoon) - 0.09 * math.cos(2 * om)) / 3600
    lam = L0 + C
    ra = math.degrees(math.atan2(math.cos(eps * RAD) * math.sin(lam * RAD), math.cos(lam * RAD))) % 360
    dec = math.asin(math.sin(eps * RAD) * math.sin(lam * RAD))
    eot = ((L0 - ra + 180) % 360 - 180) * 4 + DIYANET_EOT_ADD_MIN
    return dec, eot

def sun_at(t_utc, lat, lon):
    """Declination (rad) and equation of time (minutes) at an instant."""
    if SUN == 'diyanet':
        return sun_diyanet(t_utc + dt.timedelta(seconds=DIYANET_INSTANT_S))
    if SUN == 'mixA':   # NOAA declination, Almanac equation of time
        return sun_noaa(t_utc, lat, lon)[0], sun_praytimes(t_utc)[1]
    if SUN == 'mixB':
        return sun_praytimes(t_utc)[0], sun_noaa(t_utc, lat, lon)[1]
    if SUN == 'spencer':
        doy = (t_utc.date() - dt.date(t_utc.year, 1, 1)).days
        g = 2 * math.pi * (doy + (t_utc.hour - 12) / 24) / 365
        dec = 0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g) + 0.000907 * math.sin(2 * g) - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g)
        eot = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g) - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
        return dec, eot
    if SUN == 'praytimes':
        return sun_praytimes(t_utc)
    return sun_noaa(t_utc, lat, lon)

def sun_praytimes(t_utc):
    if True:
        # PrayTimes.js (Astronomical Almanac's low-precision formulas)
        jd = t_utc.timestamp() / 86400 + 2440587.5
        D = jd - 2451545.0
        g = (357.529 + 0.98560028 * D) % 360
        q = (280.459 + 0.98564736 * D) % 360
        L = (q + 1.915 * math.sin(g * RAD) + 0.020 * math.sin(2 * g * RAD)) % 360
        e = 23.439 - 0.00000036 * D
        RA = math.atan2(math.cos(e * RAD) * math.sin(L * RAD), math.cos(L * RAD)) / RAD / 15
        RA %= 24
        eqt = q / 15 - RA
        eqt = ((eqt + 12) % 24) - 12
        decl = math.asin(math.sin(e * RAD) * math.sin(L * RAD))
        return decl, eqt * 60
    return sun_noaa(t_utc, lat, lon)

def sun_noaa(t_utc, lat, lon):
    """NOAA."""
    jd = t_utc.timestamp() / 86400 + 2440587.5
    T = (jd - 2451545) / 36525
    L0 = (280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360
    M = 357.52911 + T * (35999.05029 - 0.0001537 * T)
    e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
    Mr = M * RAD
    C = (1.914602 - T * (0.004817 + 0.000014 * T)) * math.sin(Mr) + (0.019993 - 0.000101 * T) * math.sin(2 * Mr) + 0.000289 * math.sin(3 * Mr)
    lam = L0 + C - 0.00569 - 0.00478 * math.sin((125.04 - 1934.136 * T) * RAD)
    eps = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * math.cos((125.04 - 1934.136 * T) * RAD)
    dec = math.asin(math.sin(eps * RAD) * math.sin(lam * RAD))
    y = math.tan(eps * RAD / 2) ** 2
    eot = 4 / RAD * (y * math.sin(2 * L0 * RAD) - 2 * e * math.sin(Mr) + 4 * e * y * math.sin(Mr) * math.cos(2 * L0 * RAD) - 0.5 * y * y * math.sin(4 * L0 * RAD) - 1.25 * e * e * math.sin(2 * Mr))
    return dec, eot

class Solar:
    """One day's sun: transit and the crossings, all from the position at the solar hour; times as minutes past the day's local midnight."""
    def __init__(self, day, lat, lon):
        self.day = day
        ref = dt.datetime(day.year, day.month, day.day, tzinfo=dt.timezone.utc)
        if SOLAR_HOUR is not None: ref += dt.timedelta(hours=SOLAR_HOUR - lon / 15)
        self.dec, self.eot = sun_at(ref, lat, lon)
        self.lat, self.lon = lat, lon
        noon_utc = dt.datetime(day.year, day.month, day.day, 12, tzinfo=dt.timezone.utc) - dt.timedelta(minutes=4 * lon + self.eot)
        # Minutes are counted from 00:00 UTC of the date — a frame the clock
        # changes cannot bend; the clock is applied only when printing.
        self.day_start = dt.datetime(day.year, day.month, day.day, tzinfo=dt.timezone.utc)
        self.transit = (noon_utc - self.day_start).total_seconds() / 60
        for _ in range(ITER):
            _, eot = sun_at(self.day_start + dt.timedelta(minutes=self.transit), lat, lon)
            self.transit = 720 - 4 * lon - eot
    def hour_angle(self, alt, dec=None):
        dec = self.dec if dec is None else dec
        c = (math.sin(alt * RAD) - math.sin(self.lat * RAD) * math.sin(dec)) / (math.cos(self.lat * RAD) * math.cos(dec))
        if c < -1 or c > 1: return None
        return math.acos(c) / RAD * 4  # minutes from transit
    def _event(self, alt, sign):
        h = self.hour_angle(alt)
        if h is None: return None
        t = self.transit + sign * h
        for _ in range(ITER):
            # the sun where it actually is at the event (PrayTimes-style iteration)
            dec, eot = sun_at(self.day_start + dt.timedelta(minutes=t), self.lat, self.lon)
            transit = 720 - 4 * self.lon - eot
            h = self.hour_angle(alt, dec)
            if h is None: return None
            t = transit + sign * h
        return t
    def rising(self, alt): return self._event(alt, -1)
    def setting(self, alt): return self._event(alt, +1)
    def asr(self):
        noon_alt = 90 - abs(self.lat - self.dec / RAD)
        if noon_alt <= 0: return None
        alt = math.atan(1 / (1 + math.tan((90 - noon_alt) * RAD))) / RAD
        return self.setting(alt)

# ---------- the method ----------
class Model:
    def __init__(self, lat, lon, year):
        self.lat, self.lon, self.year = lat, lon, year
        self.cache = {}
        self.sol = {}
    def solar(self, day):
        if day not in self.sol: self.sol[day] = Solar(day, self.lat, self.lon)
        return self.sol[day]

    def printed_rise_set(self, day):
        """Printed (temkin) sunrise and Maghrib with the five-hour floors, minutes past the day's midnight."""
        if ('rs', day) in self.cache: return self.cache[('rs', day)]
        s = self.solar(day)
        dhuhr = s.transit + TEMKIN['dhuhr']
        sr = s.rising(RISE_SET); ss = s.setting(RISE_SET)
        sr = None if sr is None else sr + TEMKIN['sunrise']
        ss = None if ss is None else ss + TEMKIN['maghrib']
        half = FLOOR / 2
        noon_up = 90 - abs(self.lat - s.dec / RAD) > RISE_SET
        # the night is never shorter than five hours, 2.5 h either side of the midnight after the
        # printed Dhuhr — or, where midsummer's night is floored at both ends, of the season's
        # anchoring Dhuhr (dhuhr_extremes): the floored times never step back
        if self.midsummer_floors():
            hi, lo = self.dhuhr_extremes(day)
            nsr, nss = hi - 720 + half, lo + 720 - half
        else:
            nsr, nss = dhuhr - 720 + half, dhuhr + 720 - half
        if sr is None or ss is None:
            # the sun neither rises nor sets: midnight sun (up at noon) or polar night
            sr, ss = (nsr, nss) if noon_up else (dhuhr - half, dhuhr + half)
        # the day is never shorter than five hours, about the printed Dhuhr — each end on its own
        sr = min(sr, dhuhr - half)
        ss = max(ss, dhuhr + half)
        sr = max(sr, nsr)
        ss = min(ss, nss)
        self.cache[('rs', day)] = (sr, ss)
        return sr, ss

    def dhuhr_extremes(self, day):
        k = ('dx', day)
        if k not in self.cache:
            mid = dt.date(day.year, 6, 21)
            dh = lambda d: self.solar(d).transit + TEMKIN['dhuhr']
            if day <= mid:
                # before midsummer: sunrise held against midsummer's Dhuhr; Maghrib, once floored,
                # against the latest Dhuhr since its floor began — the floored Maghrib never steps back
                d0 = day
                while d0 > day - dt.timedelta(days=120) and self.maghrib_floored(d0 - DAY): d0 -= DAY
                run = [dh(d0 + dt.timedelta(days=i)) for i in range((day - d0).days + 1)] if self.maghrib_floored(day) else [dh(day)]
                self.cache[k] = (max(dh(day), dh(mid)), min(max(run), dh(mid)))
            else:            # after it: every Dhuhr from midsummer on — the times never step back
                vals = [dh(mid + dt.timedelta(days=i)) for i in range((day - mid).days + 1)]
                self.cache[k] = (max(vals), min(vals))
        return self.cache[k]

    def maghrib_floored(self, day):
        s = self.solar(day); st = s.setting(RISE_SET)
        return st is None or st + TEMKIN['maghrib'] > s.transit + TEMKIN['dhuhr'] + 720 - FLOOR / 2

    def midsummer_floors(self):
        """Is the midsummer night floored at both ends — the day's own floors leaving it
        five hours, or within a minute of five (Torsby's 300.5 is anchored, Fagersta's
        302 is not)? Then that night is anchored for the whole season."""
        if 'floors' not in self.cache:
            s = self.solar(dt.date(self.year, 6, 21))
            sr, ss = s.rising(RISE_SET), s.setting(RISE_SET)
            dhuhr = s.transit + TEMKIN['dhuhr']; half = FLOOR / 2
            if sr is None or ss is None: self.cache['floors'] = True
            else:
                psr = max(sr + TEMKIN['sunrise'], dhuhr - 720 + half)
                pss = min(ss + TEMKIN['maghrib'], dhuhr + 720 - half)
                self.cache['floors'] = 1440 - (pss - psr) <= FLOOR + ANCHOR_SLACK
        return self.cache['floors']

    def night(self, day):
        """The day's night: 24 h less the printed day (sunrise to Maghrib), minutes."""
        sr, ss = self.printed_rise_set(day)
        return 1440 - (ss - sr)

    def fajr18(self, day): return self.solar(day).rising(FAJR)
    def isha16(self, day): return self.solar(day).setting(ISHA)

    def ratio(self):
        """(S/3)/N on the last day before midsummer on which the 18° dawn formed, with printed times."""
        if 'r' in self.cache: return self.cache['r']
        d = dt.date(self.year, 6, 21)
        while self.fajr18(d) is None: d -= DAY
        sr, ss = self.printed_rise_set(d)
        _, pss = self.printed_rise_set(d - DAY)
        if RATIO_ROUND:   # the share from printed (minute-rounded) times
            f18 = math.floor(self.fajr18(d) + 0.5); sr_, ss_ = math.floor(sr + 0.5), math.floor(ss + 0.5)
            S = f18 + 1440 - ss_; N = 1440 - (ss_ - sr_)
            self.cache['r'] = (S / 3) / N; self.cache['rday'] = d
            return self.cache['r']
        if RATIO == 'prev':      # sharia night from the previous Maghrib to this dawn, over this day's night
            S = self.fajr18(d) - (pss - 1440); N = self.night(d)
        elif RATIO == 'prevN':   # same, over the previous day's night
            S = self.fajr18(d) - (pss - 1440); N = self.night(d - DAY)
        elif RATIO == 'next':    # from this day's Maghrib to the next dawn, which no longer forms: use this dawn shifted a day
            S = self.fajr18(d) + 1440 - ss; N = self.night(d)
        else:                    # 'before': the old night-before definition
            S = self.fajr18(d) - (pss - 1440); N = sr - (pss - 1440)
        self.cache['r'] = (S / 3) / N
        self.cache['rday'] = d
        return self.cache['r']

    def gap_days(self):
        """First and last day the 18° dawn does not form."""
        if 'gap' in self.cache: return self.cache['gap']
        d = dt.date(self.year, 6, 21)
        if self.fajr18(d) is not None: self.cache['gap'] = None; return None
        a = d
        while self.fajr18(a - DAY) is None: a -= DAY
        b = d
        while self.fajr18(b + DAY) is None: b += DAY
        self.cache['gap'] = (a, b)
        return a, b

    def carried(self, day):
        k = ('car', day)
        if k not in self.cache: self.cache[k] = self._carried(day)
        return self.cache[k]

    def _carried(self, day):
        """Fajr and Isha from the carried ratio: Isha = Maghrib + r·N, Fajr = sunrise − r·(18/16)·N."""
        r = self.ratio()
        sr, ss = self.printed_rise_set(day)
        if CARRY_ROUND: sr, ss = math.floor(sr + 0.5), math.floor(ss + 0.5)
        n = 1440 - (ss - sr)
        fajr, isha = sr - r * (FAJR / ISHA) * n, ss + r * n
        # where the midsummer floors are in force: never an earlier Fajr nor a later Isha than on any
        # day between midsummer and this one (the floored sunrise's running rule, carried through)
        if self.midsummer_floors() and CARRY_RUN:
            mid = dt.date(day.year, 6, 21)
            if day > mid:
                prev = self.carried(day - DAY)
                fajr, isha = max(fajr, prev[0]), min(isha, prev[1])
            elif day < mid:
                mf, mi = self.carried(mid)
                fajr, isha = max(fajr, mf), min(isha, mi)
        elif self.midsummer_floors():
            mid = dt.date(day.year, 6, 21)
            if day != mid:
                mf, mi = self.carried(mid)
                fajr, isha = max(fajr, mf), min(isha, mi)
        return fajr, isha

    def times(self, day):
        s = self.solar(day)
        sr, ss = self.printed_rise_set(day)
        dhuhr = s.transit + TEMKIN['dhuhr']
        asr = s.asr()
        asr = dhuhr if asr is None else asr + TEMKIN['asr']   # not formed: Dhuhr's time is Asr's (the published rule)
        asr = max(dhuhr, min(asr, ss))
        f18, i16 = self.fajr18(day), self.isha16(day)
        gap = self.gap_days()
        fajr, isha = f18, i16
        if gap:
            d1, d2 = gap
            if d1 <= day <= d2:
                fajr, isha = self.carried(day)
            elif day < d1:
                fajr = self.ramp(day, 'in', 'fajr')
                isha = self.ramp(day, 'in', 'isha')
            else:
                fajr = self.ramp(day, 'out', 'fajr')
                isha = self.ramp(day, 'out', 'isha')
        if fajr is None: fajr = sr - 60
        if isha is None: isha = ss + 60
        return dict(fajr=fajr, sunrise=sr, dhuhr=dhuhr, asr=asr, maghrib=ss, isha=isha)

    def true(self, key, day):
        return self.fajr18(day) if key == 'fajr' else self.isha16(day)

    def true_ratio(self, key, day):
        """The ratio the day's true time would imply."""
        t = self.true(key, day)
        if t is None: return None
        sr, ss = self.printed_rise_set(day); n = self.night(day)
        return (sr - t) / ((FAJR / ISHA) * n) if key == 'fajr' else (t - ss) / n

    def ramp(self, day, side, key):
        """The gradual transition (tedrici geçiş) between the true time and the takdir.

        The takdir at the gap's edge, T, is the reference. The transition
        covers the days next to the gap on which the true time lies within
        BAND minutes of T; across them the printed time runs in a straight
        line from BAND minutes away (at the far end) to T (at the edge).
        Outside those days the true time is printed."""
        d1, d2 = self.gap_days()
        idx = 0 if key == 'fajr' else 1
        k = (side, key)
        if k not in self.cache:
            edge = d1 if side == 'in' else d2
            T = self.carried(edge)[idx]
            step = -DAY if side == 'in' else DAY
            d = edge + step
            far = None
            # walking away from the gap: the true time starts far beyond T, enters
            # the band and leaves it again; the far end is the last day of that run
            while abs((d - edge).days) < 200:
                t = self.true(key, d)
                if t is not None and abs(t - T) <= BAND: far = d
                elif far is not None: break
                d += step
            self.cache[k] = (edge, T, far)
        edge, T, far = self.cache[k]
        if far is None: return self.true(key, day)
        inside = (far <= day < edge) if side == 'in' else (edge < day <= far)
        if not inside: return self.true(key, day)
        sign = 1 if key == 'fajr' else -1      # Fajr sits later than the takdir, Isha earlier
        k = abs((day - edge).days); n = abs((far - edge).days)
        if RAMP_END == 'true':     # the line ends on the true time of the far day
            return T + (self.true(key, far) - T) * k / n
        if RAMP_END == 'next':     # the line ends a day beyond, at the band's edge
            return T + sign * BAND * k / (n + 1)
        return T + sign * BAND * k / n

def hhmm(m, day_start=None):
    if ROUND == 'nearest': x = math.floor(m + 0.5)
    elif ROUND == 'floor': x = math.floor(m)
    else: x = math.ceil(m)
    if day_start is not None:
        t = (day_start + dt.timedelta(minutes=x)).astimezone(TZ)
        return '%02d:%02d' % (t.hour, t.minute)
    x %= 1440
    return '%02d:%02d' % (x // 60, x % 60)

def main():
    global SUN, SOLAR_HOUR, RATIO
    global ITER
    if '--iter' in sys.argv: ITER = int(sys.argv[sys.argv.index('--iter') + 1])
    slug, lat, lon = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
    if '--sun' in sys.argv: SUN = sys.argv[sys.argv.index('--sun') + 1]
    if '--ratio' in sys.argv: RATIO = sys.argv[sys.argv.index('--ratio') + 1]
    if '--hour' in sys.argv: SOLAR_HOUR = float(sys.argv[sys.argv.index('--hour') + 1])
    if '--diyanet' in sys.argv:
        # Diyanet's own table for the place (diyanet-fetch.py cache), genuine years only
        iid = sys.argv[sys.argv.index('--diyanet') + 1]
        table = {}
        for yy in range(2024, 2028):
            pth = os.path.expanduser(f'~/.cache/mihrab/diyanet/raw/{iid}_{yy}.json')
            if not os.path.exists(pth): continue
            for r in json.load(open(pth)):
                d_, m_, y_ = r['gregorianDateShort'].split('.')
                table[f'{y_}-{m_}-{d_}'] = ['', r['fajr'], r['sunrise'], r['dhuhr'], r['asr'], r['maghrib'], r['isha']]
    else:
        table = json.load(open(f'/Users/hassan/git/mihrab/data/prayer-times/v1/cities/{slug}.json'))['days']
    as_year = int(sys.argv[sys.argv.index('--as-year') + 1]) if '--as-year' in sys.argv else None
    models = {}
    keys = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']
    months, rows = {}, []
    for date in sorted(table):
        y, m, d = map(int, date.split('-'))
        if as_year: y = as_year
        if m == 2 and d == 29: continue
        if y not in models: models[y] = Model(lat, lon, y)
        day = dt.date(y, m, d)
        ours = models[y].times(day)
        start = models[y].solar(day).day_start
        theirs = table[date][1:]
        diffs = []
        for k, t in zip(keys, theirs):
            o = hhmm(ours[k], start); om = int(o[:2]) * 60 + int(o[3:]); tm = int(t[:2]) * 60 + int(t[3:])
            dif = om - tm
            if dif > 720: dif -= 1440
            if dif < -720: dif += 1440
            diffs.append(dif)
        rows.append((date, diffs, [hhmm(ours[k], start) for k in keys], theirs))
        months.setdefault(date[:7], []).append(diffs)
    print('month    ' + '  '.join('%9s' % k for k in keys) + '   (mean diff / share exact)')
    for mo in sorted(months):
        ds = months[mo]
        print(mo, ' '.join('%5.1f/%3.0f%%' % (sum(d[i] for d in ds) / len(ds), 100 * sum(d[i] == 0 for d in ds) / len(ds)) for i in range(6)))
    allrows = [d for ds in months.values() for d in ds]
    print('exact share, all days:', ' '.join('%s %.1f%%' % (k, 100 * sum(d[i] == 0 for d in allrows) / len(allrows)) for i, k in enumerate(keys)),
          '| within 1:', ' '.join('%.1f%%' % (100 * sum(abs(d[i]) <= 1 for d in allrows) / len(allrows)) for i in range(6)))
    m0 = models[min(models)]
    if m0.gap_days(): print('gap', m0.gap_days(), 'ratio day', m0.cache.get('rday'), 'r=%.4f' % m0.ratio(), 'ramps', {k: (str(v[0]), round(v[1], 2), str(v[2])) for k, v in m0.cache.items() if isinstance(k, tuple) and k[0] in ('in', 'out')})
    if '--days' in sys.argv:
        a, b = sys.argv[sys.argv.index('--days') + 1].split(':')
        for date, diffs, ours, theirs in rows:
            if a <= date <= b:
                print(date, ' '.join(ours), '|', ' '.join(theirs), '|', ' '.join('%+d' % x for x in diffs))

if __name__ == '__main__':
    main()
