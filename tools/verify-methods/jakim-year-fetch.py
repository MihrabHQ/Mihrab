"""JAKIM's whole current year for every zone, for fitting (the repo keeps only the coming window).

    python3 jakim-year-fetch.py ~/.cache/mihrab/malaysia-year

Writes <out>/v1/cities/<n>.json ({days: {date: [imsak, fajr, syuruk, dhuhr, asr, maghrib, isha]}}),
n numbered as tools/national-tables/jakim-zones.ts orders the zones.
"""
import sys, os, re, json, time, urllib.request, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
out = os.path.expanduser(sys.argv[1])
src = open(os.path.join(HERE, '..', 'national-tables', 'jakim-zones.ts')).read()
codes = re.findall(r"code:\s*'([A-Z]{3}\d{2})'", src)
MONTHS = dict(Jan=1, Feb=2, Mac=3, Apr=4, Mei=5, Jun=6, Jul=7, Ogos=8, Sep=9, Okt=10, Nov=11, Dis=12)
UA = 'Mihrab dataset builder (+https://github.com/MihrabHQ/Mihrab; mihrab@elghamri.se)'
os.makedirs(os.path.join(out, 'v1', 'cities'), exist_ok=True)
hm = lambda s: s[:5]
for i, code in enumerate(codes, 1):
    url = f'https://www.e-solat.gov.my/index.php?r=esolatApi/takwimsolat&period=year&zone={code}'
    for attempt in range(3):
        try:
            # curl, for the system's certificate store (python.org builds ship none)
            j = json.loads(subprocess.run(['curl', '-sS', '--max-time', '30', '-A', UA, url], capture_output=True, check=True).stdout); break
        except Exception as e:
            if attempt == 2: raise
            time.sleep(2)
    days = {}
    for r in j['prayerTime']:
        d, mo, y = re.match(r'(\d+)-(\w+)-(\d+)', r['date']).groups()
        days[f'{y}-{MONTHS[mo]:02d}-{int(d):02d}'] = [hm(r[k]) for k in ('imsak', 'fajr', 'syuruk', 'dhuhr', 'asr', 'maghrib', 'isha')]
    json.dump(dict(id=i, code=code, days=days), open(os.path.join(out, 'v1', 'cities', f'{i}.json'), 'w'))
    print(code, len(days), flush=True)
    time.sleep(0.3)
