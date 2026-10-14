"""The Congress model with Diyanet's sun, against Diyanet's own tables (2024-2027) for every place: exact-minute
misses per prayer, and every miss listed. Uses snapped.json (Diyanet's coordinates, read off its tables).
python3 diyanet-all-prayers.py [--part k/n] [--only NAME]"""
import sys, os, json, subprocess, re
CACHE = os.path.expanduser('~/.cache/mihrab/diyanet')
HERE = os.path.dirname(os.path.abspath(__file__))
sn = json.load(open(os.path.join(CACHE, 'snapped.json')))
part, parts = map(int, sys.argv[sys.argv.index('--part') + 1].split('/')) if '--part' in sys.argv else (0, 1)
only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
keys = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']
for k, (iid, v) in enumerate(sorted(sn.items(), key=lambda kv: kv[1]['name'])):
    if k % parts != part: continue
    if only and not v['name'].startswith(only): continue
    out = subprocess.run(['python3', os.path.join(HERE, 'congress-model.py'), v['slug'] or 'x', str(v['lat']), str(v['lon']),
                          '--diyanet', iid, '--days', '2024-01-01:2027-12-31'], capture_output=True, text=True).stdout
    misses = []; n = 0
    for line in out.splitlines():
        m = re.match(r'^(\d{4}-\d\d-\d\d) (.*) \| (.*) \| (.*)$', line)
        if not m: continue
        n += 1
        diffs = [int(x) for x in m.group(4).split()]
        for kk, d in zip(keys, diffs):
            if d: misses.append((m.group(1), kk, d))
    per = {kk: sum(1 for x in misses if x[1] == kk) for kk in keys}
    print(f"{v['name'][:16]:16s} {v['lat']:.3f} {v['lon']:.3f} days {n} misses {len(misses):4d} " + ' '.join(f'{kk} {per[kk]}' for kk in keys) +
          ('  ' + ' '.join(f'{d}:{kk}{x:+d}' for d, kk, x in misses[:8]) if misses else ''), flush=True)
