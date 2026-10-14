"""Joint exact fit, vectorised: for one city, the latitude, longitude, evaluation instant (hours UT) and horizon
constant h0 that leave the fewest printed minutes unexplained (sunrise, sunset, Dhuhr, Asr; optionally Fajr/Isha).
python3 diyanet-joint.py 14351 59.3333 18.0347 [--fields rise,set,transit,asr,fajr,isha] [--model almanac]"""
import sys, os, json, math, itertools, importlib.util, numpy as np
spec = importlib.util.spec_from_file_location('dx', '/Users/hassan/git/mihrab/tools/verify-methods/diyanet-exact.py')
dx = importlib.util.module_from_spec(spec); spec.loader.exec_module(dx)
RAD = math.pi / 180
DEC_HOUR = float(os.environ['DEC_HOUR']) if os.environ.get('DEC_HOUR') else None

class City:
    def __init__(self, iid):
        self.rows = dx.load(iid)
        self.D0 = np.array([dx.day_number(r[0], 0) for r in self.rows])
        self.off = np.array([r[1] for r in self.rows])
        get = lambda f: np.array([dx.mins(r[2][f]) for r in self.rows], float) - self.off
        self.p = dict(rise=get('astronomicalSunrise'), set=get('astronomicalSunset'), transit=get('dhuhr') - 5,
                      asr=get('asr') - 4, fajr=get('fajr'), isha=get('isha'))

    def times(self, lat, lon, hour, h0, model):
        dec, eot = dx.MODELS[model](self.D0 + hour / 24)
        if DEC_HOUR is not None: dec, _ = dx.MODELS[model](self.D0 + DEC_HOUR / 24)
        tr = 720 - 4 * lon - eot
        phi = lat * RAD
        sd, cd, sp, cp = np.sin(dec), np.cos(dec), math.sin(phi), math.cos(phi)
        def H(alt):
            c = (np.sin(alt * RAD) - sp * sd) / (cp * cd)
            with np.errstate(invalid='ignore'):
                return np.where(np.abs(c) <= 1, np.degrees(np.arccos(np.clip(c, -1, 1))) * 4, np.nan)
        noon_alt = 90 - np.abs(lat - np.degrees(dec))
        asr_alt = np.degrees(np.arctan(1 / (1 + np.tan((90 - noon_alt) * RAD))))
        return dict(transit=tr, rise=tr - H(h0), set=tr + H(h0), asr=tr + H(asr_alt), fajr=tr - H(-18), isha=tr + H(-16))

    def misses(self, lat, lon, hour, h0, model, fields, detail=False):
        t = self.times(lat, lon, hour, h0, model)
        n = 0; tot = 0; per = {}
        for f in fields:
            d = t[f] - self.p[f]
            d = (d + 720) % 1440 - 720
            ok = np.isfinite(d) & (np.abs(d) <= 3)          # floored / takdir days are not the formula's
            m = ok & (np.abs(d) >= 0.5)
            per[f] = (int(ok.sum() - m.sum()), int(ok.sum()))
            n += int(m.sum()); tot += int(ok.sum())
        return (n, per) if detail else n

def fit(city, lat, lon, model, fields, hours, h0s):
    best = None
    for hour in hours:
        for h0 in h0s:
            b = (city.misses(lat, lon, hour, h0, model, fields), lat, lon)
            for step in (0.004, 0.001, 0.00025, 0.00005, 0.00001):
                improved = True
                while improved:
                    improved = False
                    for i, j in itertools.product((-2, -1, 0, 1, 2), repeat=2):
                        if i == j == 0: continue
                        la, lo = b[1] + i * step, b[2] + j * step
                        m = city.misses(la, lo, hour, h0, model, fields)
                        if m < b[0]: b = (m, la, lo); improved = True
            if best is None or b[0] < best[0]: best = (b[0], b[1], b[2], hour, h0)
            print(f'  hour {hour:+.3f} h0 {h0:.4f}: misses {b[0]} at {b[1]:.5f} {b[2]:.5f}', flush=True)
    return best

if __name__ == '__main__':
    iid, lat, lon = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
    fields = sys.argv[sys.argv.index('--fields') + 1].split(',') if '--fields' in sys.argv else ['rise', 'set', 'transit', 'asr']
    model = sys.argv[sys.argv.index('--model') + 1] if '--model' in sys.argv else 'almanac'
    hours = [float(x) for x in sys.argv[sys.argv.index('--hours') + 1].split(',')] if '--hours' in sys.argv else [0.0]
    h0s = [float(x) for x in sys.argv[sys.argv.index('--h0') + 1].split(',')] if '--h0' in sys.argv else [-0.833]
    city = City(iid)
    best = fit(city, lat, lon, model, fields, hours, h0s)
    n, per = city.misses(best[1], best[2], best[3], best[4], model, ['rise', 'set', 'transit', 'asr', 'fajr', 'isha'], detail=True)
    print('BEST', best, 'all fields:', per)
