"""Every day a dataset folder has ever held, from the git history: a rolling window (Morocco's thirty
days) becomes months of the authority's table to fit against.

    python3 history-union.py morocco ~/.cache/mihrab/morocco-history

Writes <out>/v1/cities/<id>.json with the union of days; a day whose published times changed between
builds keeps the latest and is listed in <out>/changed.json.
"""
import sys, os, json, subprocess

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
folder, out = sys.argv[1], os.path.expanduser(sys.argv[2])
rel = f'data/prayer-times/{folder}/v1/cities'
commits = subprocess.run(['git', '-C', REPO, 'log', '--reverse', '--format=%H', '--all', '--', rel], capture_output=True, text=True).stdout.split()
union, meta, changed = {}, {}, []
cat = subprocess.Popen(['git', '-C', REPO, 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
def blob(spec):
    cat.stdin.write((spec + '\n').encode()); cat.stdin.flush()
    head = cat.stdout.readline().decode().split()
    if len(head) < 3 or head[1] == 'missing': return None
    data = cat.stdout.read(int(head[2])); cat.stdout.read(1)
    return data
for c in commits:
    ls = subprocess.run(['git', '-C', REPO, 'ls-tree', '--name-only', f'{c}:{rel}'], capture_output=True, text=True).stdout.split()
    for name in ls:
        if not name.endswith('.json'): continue
        b = blob(f'{c}:{rel}/{name}')
        if b is None: continue
        try: d = json.loads(b)
        except Exception: continue
        u = union.setdefault(name, {})
        meta[name] = {k: v for k, v in d.items() if k != 'days'}
        for day, row in d.get('days', {}).items():
            if day in u and u[day] != row: changed.append([name, day, u[day], row])
            u[day] = row
os.makedirs(os.path.join(out, 'v1', 'cities'), exist_ok=True)
for name, days in union.items():
    json.dump(dict(meta[name], days=dict(sorted(days.items()))), open(os.path.join(out, 'v1', 'cities', name), 'w'))
json.dump(changed, open(os.path.join(out, 'changed.json'), 'w'))
print(len(commits), 'commits;', len(union), 'cities;', 'days per city', min(map(len, union.values())), '-', max(map(len, union.values())), '; changed rows', len(changed))
