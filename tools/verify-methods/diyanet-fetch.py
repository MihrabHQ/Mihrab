"""Download Diyanet's own Swedish tables (awqatsalah API — the source Islamiska Förbundet republishes) for the
places in diyanet-sweden-points.json, and write them as a checkable table (not committed: their data, used only
to check ours):

    <out>/v1/cities/<ilceId>.json   {"days": {"YYYY-MM-DD": [imsak, fajr, sunrise, dhuhr, asr, maghrib, isha]}}
    <out>/v1/index.json             {"builtAt": ...}
    <out>/raw/<ilceId>_<year>.json  the API's rows as served (the research tools read these)

    python3 tools/verify-methods/diyanet-fetch.py [--out DIR] [--years 2026-2027] [--all-places]

--all-places lists every Swedish place Diyanet has (ezanvakti.emushaf.net) rather than the points file.
Default out: ~/.cache/mihrab/diyanet. Diyanet serves 2024 to next year.
"""
import json, os, sys, time, ssl, datetime as dt, urllib.request

try:
    import certifi
    CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX = ssl.create_default_context()

HERE = os.path.dirname(os.path.abspath(__file__))
out = os.path.expanduser(sys.argv[sys.argv.index('--out') + 1]) if '--out' in sys.argv else os.path.expanduser('~/.cache/mihrab/diyanet')
year = dt.date.today().year
years = range(year, year + 2)
if '--years' in sys.argv:
    a, b = sys.argv[sys.argv.index('--years') + 1].split('-'); years = range(int(a), int(b) + 1)
UA = {'User-Agent': 'Mihrab verification (+https://github.com/MihrabHQ/Mihrab)'}
raw = os.path.join(out, 'raw'); cities = os.path.join(out, 'v1', 'cities')
os.makedirs(raw, exist_ok=True); os.makedirs(cities, exist_ok=True)

def get(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), context=CTX, timeout=60) as r:
                return json.load(r)
        except Exception:
            if attempt == 3: raise
            time.sleep(2 * (attempt + 1))

if '--all-places' in sys.argv:
    places = {x['IlceID']: x['IlceAdi'].strip() for x in get('https://ezanvakti.emushaf.net/ilceler/731')}
else:
    places = {iid: v['name'] for iid, v in json.load(open(os.path.join(HERE, 'diyanet-sweden-points.json'))).items()}

failed = 0
for iid, name in places.items():
    days = {}
    for y in years:
        p = os.path.join(raw, f'{iid}_{y}.json')
        # this year's and later files are fetched afresh: Diyanet may publish or correct them
        if not os.path.exists(p) or y >= year:
            try:
                d = get(f'https://admin.awqatsalah.com/api/PlaceAPI/GetByYearCityId?cityId={iid}&year={y}')
                rows = (d.get('daily') or {}).get('data') or []
                if rows: json.dump(rows, open(p, 'w'))
                else: failed += 1; print('no rows', iid, name, y, str(d)[:120], flush=True)
            except Exception as e:
                failed += 1; print('failed', iid, name, y, e, flush=True)
            time.sleep(0.4)
        if not os.path.exists(p): continue
        for r in json.load(open(p)):
            dd, mm, yy = r['gregorianDateShort'].split('.')
            days[f'{yy}-{mm}-{dd}'] = ['', r['fajr'], r['sunrise'], r['dhuhr'], r['asr'], r['maghrib'], r['isha']]
    json.dump({'city': name, 'days': days}, open(os.path.join(cities, f'{iid}.json'), 'w'))
json.dump({'builtAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'years': list(years)}, open(os.path.join(out, 'v1', 'index.json'), 'w'))
print(f'{len(places)} places, years {years[0]}-{years[-1]}, {failed} failed fetches -> {out}')
sys.exit(1 if failed > len(places) else 0)
