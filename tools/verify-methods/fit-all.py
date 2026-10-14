"""Fit Diyanet's coordinates for every Swedish city in the dataset and score the Congress model on each.
Writes diyanet-sweden-coords.json (slug -> lat, lon, scores). python3 fit-all.py [slug ...]"""
import sys, os, json, datetime as dt, importlib, subprocess, re
sys.path.insert(0, '/Users/hassan/git/mihrab/tools/verify-methods')
cm = importlib.import_module('congress-model')
HERE = '/Users/hassan/git/mihrab/tools/verify-methods'
CITIES = '/Users/hassan/git/mihrab/data/prayer-times/v1/cities'
coords = json.load(open('/Users/hassan/git/mihrab/src/providers/islamiskaForbundetCoords.json'))
out_path = HERE + '/diyanet-sweden-coords.json'
out = json.load(open(out_path)) if os.path.exists(out_path) else {}
def load(slug):
    j = json.load(open(f'{CITIES}/{slug}.json'))
    table = j['days']; days = []
    for date in sorted(table):
        y, m, d = map(int, date.split('-'))
        if (m, d) == (2, 29): continue
        if date.startswith('2027') and ('2026' + date[4:]) in table: continue
        days.append((dt.date(2026, m, d), table[date][1:]))
    return j['city'], days
def score(days, la, lo):
    M = cm.Model(la, lo, 2026); hits = 0
    for day, t in days:
        s = M.solar(day); sr, ss = M.printed_rise_set(day); dh = s.transit + 5
        for k, v in ((1, sr), (2, dh), (4, ss)):
            if cm.hhmm(v, s.day_start) == t[k]: hits += 1
    return hits
slugs = sys.argv[1:] or sorted(f[:-5] for f in os.listdir(CITIES) if f.endswith('.json'))
for slug in slugs:
    city, days = load(slug)
    c = coords[city]; la0, lo0 = c['lat'], c['lng']
    best = max((score(days, round(la0 * 60) / 60 + i / 60, round(lo0 * 60) / 60 + j / 60), round(round(la0 * 60) / 60 + i / 60, 4), round(round(lo0 * 60) / 60 + j / 60, 4))
               for i in range(-12, 13) for j in range(-18, 19))
    la, lo = best[1], best[2]
    res = subprocess.run(['python3', HERE + '/congress-model.py', slug, str(la), str(lo), '--as-year', '2026'], capture_output=True, text=True).stdout
    m = re.search(r'exact share, all days: (.*?) \| within 1: (.*)', res)
    exact = [float(x) for x in re.findall(r'([\d.]+)%', m.group(1))]; within = [float(x) for x in re.findall(r'([\d.]+)%', m.group(2))]
    out[slug] = dict(city=city, lat=la, lon=lo, sunScore=best[0], sunOf=3 * len(days), exact=exact, within1=within)
    print('%-14s %8.4f %8.4f sun %4d/%d  exact %s  within1 %s' % (slug, la, lo, best[0], 3 * len(days), ' '.join('%5.1f' % x for x in exact), ' '.join('%5.1f' % x for x in within)))
    json.dump(out, open(out_path, 'w'), indent=1, ensure_ascii=False)
