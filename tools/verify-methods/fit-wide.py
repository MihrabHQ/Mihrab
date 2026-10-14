"""Wide coordinate search (coarse, then fine) for the cities whose table is not where the geocoder put them. python3 fit-wide.py gallivare ..."""
import sys, json, importlib, subprocess, re
sys.path.insert(0, '/Users/hassan/git/mihrab/tools/verify-methods')
fa = importlib.import_module('fit-all') if False else None
import importlib.util
spec = importlib.util.spec_from_file_location('fitall', '/Users/hassan/git/mihrab/tools/verify-methods/fit-all.py')
# reuse load/score without running its main loop: exec the top part
src = open('/Users/hassan/git/mihrab/tools/verify-methods/fit-all.py').read().split('slugs = ')[0]
exec(src)
for slug in sys.argv[1:]:
    city, days = load(slug)
    c = coords[city]; la0, lo0 = round(c['lat'] * 12) / 12, round(c['lng'] * 12) / 12
    coarse = max((score(days, la0 + i / 12, lo0 + j / 12), la0 + i / 12, lo0 + j / 12) for i in range(-18, 19) for j in range(-30, 31))
    la1, lo1 = coarse[1], coarse[2]
    fine = max((score(days, round(la1 * 60) / 60 + i / 60, round(lo1 * 60) / 60 + j / 60), round(round(la1 * 60) / 60 + i / 60, 4), round(round(lo1 * 60) / 60 + j / 60, 4)) for i in range(-5, 6) for j in range(-5, 6))
    la, lo = fine[1], fine[2]
    res = subprocess.run(['python3', HERE + '/congress-model.py', slug, str(la), str(lo), '--as-year', '2026'], capture_output=True, text=True).stdout
    m = re.search(r'exact share, all days: (.*?) \| within 1: (.*)', res)
    exact = [float(x) for x in re.findall(r'([\d.]+)%', m.group(1))]; within = [float(x) for x in re.findall(r'([\d.]+)%', m.group(2))]
    out[slug] = dict(city=city, lat=la, lon=lo, sunScore=fine[0], sunOf=3 * len(days), exact=exact, within1=within)
    print('%-14s ifis %.3f %.3f -> %8.4f %8.4f sun %4d/%d  exact %s  within1 %s' % (slug, c['lat'], c['lng'], la, lo, fine[0], 3 * len(days), ' '.join('%5.1f' % x for x in exact), ' '.join('%5.1f' % x for x in within)), flush=True)
    json.dump(out, open(out_path, 'w'), indent=1, ensure_ascii=False)
