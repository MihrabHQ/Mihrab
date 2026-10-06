#!/usr/bin/env python3
"""iPhone Duo screenshots, plus the wide header and search-results art.

App Store Connect's iPhone Duo slot takes 2007 x 2853 (portrait). Its
panels are built the way the iPad ones are — same captions, same frame —
from the iPad raw shots, because a Duo screen is nearly the iPad's shape
(0.70 against 0.75).

  python3 branding/tools/build_duo.py

writes   branding/store-duo/01_home.png ...      2007 x 2853
         branding/store-wide/header-3840x1646.png
         branding/store-wide/search-results-3840x2560.png
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
os.chdir(ROOT)

import build_store  # noqa: E402
import compose_wide  # noqa: E402
from compose import compose, headline_size  # noqa: E402

DUO = (2007, 2853)
WIDE = (3840, 1646)
SEARCH = (3840, 2560)  # 3:2, one of the three sizes Apple lists

SRC = os.path.join(ROOT, "branding/store/ipad-13")
OUT_DUO = os.path.join(ROOT, "branding/store-duo")
OUT_WIDE = os.path.join(ROOT, "branding/store-wide")


def duo():
    os.makedirs(OUT_DUO, exist_ok=True)
    names = sorted(f for f in os.listdir(SRC) if f.endswith(".png"))
    keys = [os.path.splitext(n)[0].split("_", 1)[1] for n in names]
    caps = [build_store.caption(k, False) for k in keys]
    hl = headline_size([c[0] for c in caps], DUO[0], DUO[1])
    for n, (headline, sub) in zip(names, caps):
        compose(
            os.path.join(SRC, n),
            os.path.join(OUT_DUO, n),
            DUO[0],
            DUO[1],
            headline,
            sub,
            screen_radius_frac=0.030,
            device_w_frac=0.74,
            device_top_frac=0.355,
            hl_size=hl,
        )


def wide():
    os.makedirs(OUT_WIDE, exist_ok=True)
    home = os.path.join(ROOT, "branding/store/ios-6.9/01_home.png")
    compose_wide.feature_graphic(
        os.path.join(OUT_WIDE, "header-3840x1646.png"), home, W=WIDE[0], H=WIDE[1], SS=2
    )
    shots = [os.path.join(ROOT, "branding/store/ios-6.9", f) for f in ("01_home.png", "02_mushaf.png", "05_duas.png")]
    compose_wide.hero(
        os.path.join(OUT_WIDE, "search-results-3840x2560.png"), *shots, W=SEARCH[0], H=SEARCH[1], xs=(0.50, 0.64, 0.78), ts=0.72, dh_frac=0.74
    )


if __name__ == "__main__":
    duo()
    wide()
