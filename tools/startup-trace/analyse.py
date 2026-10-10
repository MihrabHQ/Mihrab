#!/usr/bin/env python3
"""
Read tools/startup-trace/out/ and print where a cold start's time went.

  python3 tools/startup-trace/analyse.py           # boot timeline medians
  python3 tools/startup-trace/analyse.py --modules # + the module table

The module table needs a --trace run. `self` is the time a module's own
top level took, `incl` adds everything it pulled in; the files are grouped
by directory too, so a package that costs a lot in many small modules
still shows up.
"""
import os
import re
import statistics
import sys
from collections import defaultdict

OUT = os.path.join(os.path.dirname(__file__), 'out')


def timeline():
    rows = []
    for line in open(os.path.join(OUT, 'boot.log')):
        vals = dict(re.findall(r'([a-z0-9-]+)=(\d+)', line))
        rows.append(vals)
    keys = ['displayed', 'prejs', 'procjs', 'napp', 'nrn', 'nactivity', 'index', 'app', 'settings', 'home', 'load', 'tz', 'week', 'status', 'past', 'ready', 'ready-cache', 'commit', 'raf', 'paint']
    print(f'{len(rows)} cold starts (median ms). displayed: the system\'s first frame; prejs: activity start to the bundle running; the rest: since the bundle started')
    for k in keys:
        vs = [int(r[k]) for r in rows if k in r]
        if vs:
            print(f'  {k:10s} {statistics.median(vs):7.0f}   (min {min(vs)}, max {max(vs)})')
    fb = sum(1 for r in rows if 'paint-fallback' in r)
    if fb:
        print(f'  {fb} run(s) never painted Home (fallback timer)')


def modules():
    names = {}
    for line in open(os.path.join(OUT, 'modules.tsv')):
        mid, p = line.rstrip('\n').split('\t', 1)
        names[mid] = p
    rows = []
    for line in open(os.path.join(OUT, 'trace.txt')):
        for tok in line.split('] ', 1)[1].split():
            mid, self_, incl = tok.split(':')
            rows.append((names.get(mid, '#' + mid), float(self_), float(incl)))
    total = sum(r[1] for r in rows)
    print(f'\n{len(rows)} modules initialised before the first paint, {total:.0f} ms of top-level code')
    print('\nslowest by self time:')
    for name, s, i in sorted(rows, key=lambda r: -r[1])[:40]:
        print(f'  {s:7.1f} {i:8.1f}  {name}')
    groups = defaultdict(lambda: [0, 0.0])
    for name, s, _ in rows:
        parts = name.split('/')
        if parts[0] == 'node_modules':
            key = '/'.join(parts[:3] if parts[1].startswith('@') else parts[:2])
        else:
            key = '/'.join(parts[:2])
        groups[key][0] += 1
        groups[key][1] += s
    print('\nby package / directory:')
    for key, (n, s) in sorted(groups.items(), key=lambda kv: -kv[1][1])[:30]:
        print(f'  {s:7.1f} ms  {n:4d} modules  {key}')


timeline()
if '--modules' in sys.argv:
    modules()
