#!/usr/bin/env python3
"""
Where the thermometer reads Fahrenheit (src/utils/data/fahrenheitShapes.json),
for the weather on the Garmin watch face (src/utils/temperatureUnit.ts).

The United States with its territories, Liberia, the Bahamas, Belize, the
Cayman Islands, Palau, Micronesia and the Marshall Islands; with their
neighbours' land near them, so that a town across a border river (Windsor,
Tijuana) is known to be on the other side and not handed over by the
coastal reach. Natural Earth's 1:10m admin-0 outlines (public domain),
simplified together as a coverage so a shared border stays shared.

    python3 tools/regions/fahrenheit.py path/to/ne_10m_admin_0_countries.geojson

(https://github.com/nvkelso/natural-earth-vector, geojson/). Needs shapely.
"""
import json, sys, os
import shapely
from shapely.geometry import shape, box, MultiPolygon, Polygon
from shapely.ops import unary_union

FAHRENHEIT = {'USA', 'PRI', 'VIR', 'GUM', 'ASM', 'MNP', 'LBR', 'BHS', 'BLZ', 'CYM', 'PLW', 'FSM', 'MHL'}
# Land next to those: kept within MARGIN degrees of them.
NEIGHBOURS = {'CAN', 'MEX', 'CUB', 'GTM', 'HND', 'SLE', 'GIN', 'CIV', 'RUS', 'BVI', 'HTI', 'TCA', 'JAM'}
MARGIN = 0.5
TOLERANCE = 0.015   # degrees, about one and a half kilometres
MIN_AREA = 0.005    # islands smaller than this (deg², ~50 km²) are left to the reach
SCALE = 1000        # coordinates as integers of 1e-3 degree

src = json.load(open(sys.argv[1]))
f_geoms, n_geoms = [], []
for f in src['features']:
    a3 = f['properties']['ADM0_A3']
    g = shape(f['geometry']).buffer(0)
    if a3 in FAHRENHEIT:
        f_geoms.append(g)
    elif a3 in NEIGHBOURS:
        n_geoms.append(g)

fahrenheit = unary_union(f_geoms)
parts = list(fahrenheit.geoms) if isinstance(fahrenheit, MultiPolygon) else [fahrenheit]
near = unary_union([box(*p.bounds).buffer(MARGIN, join_style=2) for p in parts])
others = unary_union(n_geoms).intersection(near)

simplified = shapely.coverage_simplify([fahrenheit, others], TOLERANCE)

def flatten(g):
    polys, n = [], 0
    ps = list(g.geoms) if hasattr(g, 'geoms') else [g]
    for p in ps:
        if not isinstance(p, Polygon) or p.area < MIN_AREA:
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

fout, fn = flatten(simplified[0])
oout, on = flatten(simplified[1])
doc = {
    'source': 'Natural Earth 1:10m admin-0 countries (public domain), tools/regions/fahrenheit.py',
    'scale': SCALE,
    'fahrenheit': fout,
    'others': oout,
}
dest = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'utils', 'data', 'fahrenheitShapes.json')
json.dump(doc, open(dest, 'w'), separators=(',', ':'))
print(f'fahrenheit {len(fout)} polygons, {fn} points; others {len(oout)} polygons, {on} points; {os.path.getsize(dest) // 1024} KB')
