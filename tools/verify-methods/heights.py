"""
Look up the height above sea level of every listed place, from SRTM
(opentopodata.org, 100 points a request, a request a second), and write
it beside the coordinates as `heightM` — the authorities lower the
horizon for a town on a hill, and the phone's stand-in must too.

    python3 tools/verify-methods/heights.py morocco jakim kemenag

Reads and rewrites, in place:
  morocco  src/providers/data/moroccoCities.json      (lat/lng; null kept null)
  jakim    tools/national-tables/jakim-zones.ts        (towns: [name, lat, lon] → + height)
  kemenag  tools/national-tables/kemenag-places.json  (lat/lon)
A place that already has a height is not asked again.
"""
import json, re, sys, time, urllib.request, pathlib, ssl

# python.org's Python on a Mac ships without the system's roots.
try:
    import certifi
    _CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _CTX = ssl.create_default_context()

ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = 'https://api.opentopodata.org/v1/srtm30m?locations='


def lookup(points):
    out = []
    for i in range(0, len(points), 100):
        chunk = points[i:i + 100]
        q = '|'.join(f'{lat:.5f},{lon:.5f}' for lat, lon in chunk)
        for attempt in range(3):
            try:
                with urllib.request.urlopen(URL + q, timeout=30, context=_CTX) as r:
                    data = json.load(r)
                break
            except Exception as e:  # noqa: BLE001
                if attempt == 2:
                    raise
                time.sleep(3)
        if data.get('status') != 'OK':
            raise SystemExit(f'opentopodata: {data}')
        out += [max(0, round(x['elevation'] or 0)) for x in data['results']]
        time.sleep(1.1)
    return out


def morocco():
    p = ROOT / 'src/providers/data/moroccoCities.json'
    cities = json.loads(p.read_text())
    todo = [c for c in cities if isinstance(c.get('lat'), (int, float)) and isinstance(c.get('lng'), (int, float)) and 'heightM' not in c]
    hs = lookup([(c['lat'], c['lng']) for c in todo])
    for c, h in zip(todo, hs):
        c['heightM'] = h
    p.write_text(json.dumps(cities, ensure_ascii=False, indent=2) + '\n')
    print(f'morocco: {len(todo)} heights written')


def jakim():
    p = ROOT / 'tools/national-tables/jakim-zones.ts'
    s = p.read_text()
    pat = re.compile(r"\['([^']+)', (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)\]")
    towns = pat.findall(s)
    hs = lookup([(float(a), float(b)) for _, a, b in towns])
    it = iter(hs)
    s2 = pat.sub(lambda m: f"['{m.group(1)}', {m.group(2)}, {m.group(3)}, {next(it)}]", s)
    p.write_text(s2)
    print(f'jakim: {len(towns)} heights written')


def kemenag():
    p = ROOT / 'tools/national-tables/kemenag-places.json'
    places = json.loads(p.read_text())
    todo = [c for c in places if 'heightM' not in c]
    hs = lookup([(c['lat'], c['lon']) for c in todo])
    for c, h in zip(todo, hs):
        c['heightM'] = h
    p.write_text(json.dumps(places, ensure_ascii=False, indent=1) + '\n')
    print(f'kemenag: {len(todo)} heights written')


for name in sys.argv[1:]:
    {'morocco': morocco, 'jakim': jakim, 'kemenag': kemenag}[name]()
