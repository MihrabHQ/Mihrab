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
# Countries with a calculation method of their own, which AlAdhan's Automatic
# picks there and the app lists (Umm al-Qura, Egypt, Karachi, Tehran, Gulf,
# Kuwait, Qatar, Dubai, Russia, Tunisia, Portugal, Jordan): Automatic does not
# hand these to Diyanet for being near a place it lists. Only a rough outline
# is needed — a point the coarse outline misplaces near a border is answered
# by the precise outlines above where they reach, and otherwise errs toward
# AlAdhan's national method — so they are kept whole, simplified to about
# 3 km (India and Bangladesh 4, Russia 10), with islands under ~200 km²
# (Russia's under ~2,000) left to the reach.
NATIONAL = {
    'SAU': 'SA', 'ARE': 'AE', 'QAT': 'QA', 'KWT': 'KW', 'BHR': 'BH', 'OMN': 'OM', 'IRN': 'IR', 'IRQ': 'IQ',
    'JOR': 'JO', 'EGY': 'EG', 'PAK': 'PK', 'IND': 'IN', 'BGD': 'BD', 'RUS': 'RU', 'TUN': 'TN', 'PRT': 'PT',
}
NATIONAL_TOLERANCE = 0.03
NATIONAL_TOLERANCE_BY = {'RU': 0.1, 'IN': 0.04, 'BD': 0.04}
NATIONAL_MIN_AREA = 0.02
NATIONAL_MIN_AREA_BY = {'RU': 0.2}
# Other countries' land next to those (Badajoz by Portugal, Narva by Russia,
# Jericho by Jordan, Astara by Iran): the rough outlines and their reach
# cross a land border by up to ten kilometres or more, and a town there is
# not on the neighbour's method. Everything not in NATIONAL within FOREIGN_STRIP
# degrees of them, shrunk by FOREIGN_TOLERANCE before it is simplified by as
# much, so that it never reaches over the border into the country itself.
FOREIGN_STRIP = 0.4
FOREIGN_TOLERANCE = 0.003
FOREIGN_MIN_AREA = 0.0003
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
national = {}
others = []
for f in src['features']:
    a3 = f['properties']['ADM0_A3']
    if a3 in NATIONAL:
        national.setdefault(NATIONAL[a3], []).append(shape(f['geometry']).buffer(0))
    else:
        others.append(shape(f['geometry']).buffer(0))
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

def flatten(g, min_area):
    """Polygons as rings of flat scaled integers; returns (polys, points)."""
    polys, n = [], 0
    for p in polygons(g):
        if p.area < min_area:
            continue
        rings = []
        for ring in [p.exterior, *p.interiors]:
            flat = []
            for x, y in list(ring.coords)[:-1]:
                flat += [round(x * SCALE), round(y * SCALE)]
            if len(flat) >= 6:
                rings.append(flat)
                n += len(flat) // 2
        if rings:
            polys.append(rings)
    return polys, n

national = {c: unary_union(g) for c, g in national.items()}
ncodes = sorted(national)
nout = {}
npoints = 0
for tol in sorted(set([NATIONAL_TOLERANCE, *NATIONAL_TOLERANCE_BY.values()])):
    group = [c for c in ncodes if NATIONAL_TOLERANCE_BY.get(c, NATIONAL_TOLERANCE) == tol]
    for c, g in zip(group, shapely.coverage_simplify([national[c] for c in group], tol)):
        polys, n = flatten(g, NATIONAL_MIN_AREA_BY.get(c, NATIONAL_MIN_AREA))
        if polys:
            nout[c] = polys
            npoints += n

# Another country's land beside the national ones (FOREIGN_STRIP above).
national_all = unary_union(list(national.values()))
strip = shapely.simplify(national_all, 0.05).buffer(FOREIGN_STRIP, quad_segs=1)
foreign = unary_union(others).intersection(strip).buffer(-FOREIGN_TOLERANCE)
foreign = shapely.simplify(foreign, FOREIGN_TOLERANCE, preserve_topology=True)
fout, fpoints = flatten(foreign, FOREIGN_MIN_AREA)

doc = {
    'source': 'Natural Earth 1:10m admin-0 countries (public domain), tools/regions/build.py',
    'scale': SCALE,
    'targets': target_codes,
    'countries': out,
    # Rough outlines of the countries with a method of their own (NATIONAL).
    'national': nout,
    # Other countries' land along the national ones' borders, as polygons.
    'foreign': fout,
}
dest = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'utils', 'data', 'countryShapes.json')
os.makedirs(os.path.dirname(dest), exist_ok=True)
json.dump(doc, open(dest, 'w'), separators=(',', ':'))
print(f'{len(out)} countries, {points} points; {len(nout)} national, {npoints} points; foreign {len(fout)} polygons, {fpoints} points; {os.path.getsize(dest) // 1024} KB')
