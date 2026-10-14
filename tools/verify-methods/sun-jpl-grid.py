"""A dense grid of the Sun's apparent declination and equation of time from JPL DE421 (skyfield),
for testing whether an authority's tables come from a precise ephemeris.

    pip3 install --user skyfield
    python3 sun-jpl-grid.py 2026-09-25 2027-06-10 ~/.cache/mihrab/sun-jpl.npz

D = days since J2000.0 (UT); eot in minutes such that transit = 720 - 4*lon - eot (lon east, minutes UT).
"""
import sys, os, datetime as dt
import numpy as np
from skyfield.api import load

a, b, out = sys.argv[1], sys.argv[2], os.path.expanduser(sys.argv[3])
d0 = (dt.date.fromisoformat(a) - dt.date(2000, 1, 1)).days - 0.5
d1 = (dt.date.fromisoformat(b) - dt.date(2000, 1, 1)).days - 0.5
D = np.arange(d0, d1, 5 / 1440)
ts = load.timescale(); eph = load(os.environ.get('EPH', 'de421.bsp'))
t = ts.ut1_jd(2451545.0 + D)
ra, dec, _ = eph['earth'].at(t).observe(eph['sun']).apparent().radec(epoch='date')
tmin = (D - np.floor(D + 0.5) + 0.5) * 1440  # minutes past 0h UT
eot = 4 * (((t.gast * 15 - ra._degrees) - (tmin - 720) / 4 + 180) % 360 - 180)
os.makedirs(os.path.dirname(out), exist_ok=True)
np.savez(out, D=D, dec=dec.radians, eot=eot)
print(len(D), 'points; eot range', eot.min(), eot.max())
