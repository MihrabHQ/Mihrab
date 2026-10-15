#!/usr/bin/env python3
"""
Country outlines for Automatic's routing (src/utils/data/countryShapes.json).

Automatic picks a country's own prayer-time source inside that country, so
it has to know the country — at a border town, on an island, across a
strait. These are Natural Earth's 1:10m admin-0 outlines (public domain),
for the countries with a source of their own and the neighbours they could
be confused with near a border, clipped to near those countries and
simplified to about 300 m.

    python3 tools/regions/build.py path/to/ne_10m_admin_0_countries.geojson

(https://github.com/nvkelso/natural-earth-vector, geojson/). Needs shapely.
"""
import json, sys, os
import shapely
from shapely.geometry import shape, box, mapping, MultiPolygon, Polygon
from shapely.ops import unary_union

# The countries with a source of their own (Natural Earth's ADM0_A3 → the
# code the app uses); parts that belong together are merged: Western Sahara
# with Morocco (the Habous ministry lists its cities), Northern Cyprus with
# Türkiye (Diyanet's districts take it in).
TARGETS = {'SWE': 'SE', 'MAR': 'MA', 'SAH': 'MA', 'DZA': 'DZ', 'SGP': 'SG', 'MYS': 'MY', 'IDN': 'ID', 'TUR': 'TR', 'CYN': 'TR'}
# Neighbours a point near a target could be in.
NEIGHBOURS = {
    'NOR': 'NO', 'FIN': 'FI', 'ALD': 'AX', 'DNK': 'DK', 'EST': 'EE', 'LVA': 'LV', 'LTU': 'LT', 'DEU': 'DE', 'POL': 'PL', 'RUS': 'RU',
    'ESP': 'ES', 'GIB': 'GI', 'PRT': 'PT', 'MRT': 'MR', 'TUN': 'TN', 'LBY': 'LY', 'MLI': 'ML', 'NER': 'NE',
    'BRN': 'BN', 'TLS': 'TL', 'PHL': 'PH', 'THA': 'TH', 'PNG': 'PG', 'AUS': 'AU', 'VNM': 'VN', 'KHM': 'KH', 'IND': 'IN',
    'CYP': 'CY', 'CNM': 'CY', 'ESB': 'CY', 'WSB': 'CY', 'GRC': 'GR', 'BGR': 'BG', 'SYR': 'SY', 'IRQ': 'IQ', 'IRN': 'IR',
    'GEO': 'GE', 'ARM': 'AM', 'AZE': 'AZ',
}
MARGIN = 0.6        # degrees around each target country the neighbours are kept in
TOLERANCE = 0.007   # simplification, degrees (Visvalingam–Whyatt, as GEOS's coverage simplifier does it)
MIN_AREA = 0.0003   # islands smaller than this (deg², ~3 km²) are left to the coastal reach
# Coarser where the coast is most of the outline and the borders run through
# forest (Indonesia's 17,000 islands), or only the stretch near a target matters.
TOLERANCE_BY = {'ID': 0.014, 'NO': 0.01, 'GR': 0.01, 'FI': 0.009, 'PH': 0.012, 'AU': 0.012}
MIN_AREA_BY = {'ID': 0.0015, 'PH': 0.001}
SCALE = 10_000      # coordinates stored as integers of 1e-4 degree

src = json.load(open(sys.argv[1]))
geoms = {}
for f in src['features']:
    a3 = f['properties']['ADM0_A3']
    code = TARGETS.get(a3) or NEIGHBOURS.get(a3)
    if not code:
        continue
    geoms.setdefault(code, []).append(shape(f['geometry']).buffer(0))
geoms = {c: unary_union(g) for c, g in geoms.items()}

target_codes = sorted(set(TARGETS.values()))
area = unary_union([box(*geoms[c].bounds).buffer(MARGIN, join_style=2) for c in target_codes])

def polygons(g):
    return list(g.geoms) if isinstance(g, MultiPolygon) else [g] if isinstance(g, Polygon) else [
        p for p in getattr(g, 'geoms', []) if isinstance(p, Polygon)]

# Simplified together, as a coverage: a border shared by two countries is
# simplified once, so it stays shared — no gap or overlap opens between
# Haparanda and Tornio, or Gibraltar and Spain.
codes = sorted(geoms)
clipped = [geoms[c] if c in target_codes else geoms[c].intersection(area) for c in codes]
simplified = {}
for tol in sorted(set([TOLERANCE, *TOLERANCE_BY.values()])):
    cov = shapely.coverage_simplify(clipped, tol)
    for c, g in zip(codes, cov):
        if TOLERANCE_BY.get(c, TOLERANCE) == tol:
            simplified[c] = g

out = {}
points = 0
for code in codes:
    g = simplified[code]
    polys = []
    for p in polygons(g):
        if p.area < MIN_AREA_BY.get(code, MIN_AREA):
            continue
        rings = []
        for ring in [p.exterior, *p.interiors]:
            flat = []
            for x, y in list(ring.coords)[:-1]:
                flat += [round(x * SCALE), round(y * SCALE)]
            if len(flat) >= 6:
                rings.append(flat)
                points += len(flat) // 2
        if rings:
            polys.append(rings)
    if polys:
        out[code] = polys

doc = {
    'source': 'Natural Earth 1:10m admin-0 countries (public domain), tools/regions/build.py',
    'scale': SCALE,
    'targets': target_codes,
    'countries': out,
}
dest = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'utils', 'data', 'countryShapes.json')
os.makedirs(os.path.dirname(dest), exist_ok=True)
json.dump(doc, open(dest, 'w'), separators=(',', ':'))
print(f'{len(out)} countries, {points} points, {os.path.getsize(dest) // 1024} KB')
