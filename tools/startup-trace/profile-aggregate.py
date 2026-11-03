"""Count a launch's profile samples between two boot marks, across runs.

    python3 tools/startup-trace/profile-aggregate.py <dir> [from] [to] [depth]

<dir> holds runN.txt and runN.named.json pairs from profile.sh and
profile-annotate.js. Samples are placed on the boot timeline by the
profiler's start time (uptime and epoch, from the .txt) against js0.
"""
import json, re, glob, collections, sys

run_dir = sys.argv[1] if len(sys.argv) > 1 else '/tmp/prof'
phase_from = sys.argv[2] if len(sys.argv) > 2 else 'commit'
phase_to = sys.argv[3] if len(sys.argv) > 3 else 'raf'
depth = int(sys.argv[4]) if len(sys.argv) > 4 else 1

leaf = collections.Counter()
top = collections.Counter()
paths = collections.Counter()
total = 0
runs = 0
for txt in sorted(glob.glob(run_dir + '/run*.txt')):
    s = open(txt).read()
    m = re.search(r'enabled at uptime=(\d+) epoch=(\d+)', s)
    j = re.search(r'js0=(\d+)', s)
    if not m or not j:
        continue
    marks = {k: int(v) for k, v in re.findall(r'(\S+?)=(\d+)', s)}
    if phase_from not in marks or phase_to not in marks:
        continue
    up, ep = int(m.group(1)), int(m.group(2))
    js0_up = up + (int(j.group(1)) - ep)
    t0 = (js0_up + marks[phase_from]) * 1000
    t1 = (js0_up + marks[phase_to]) * 1000
    prof = txt.replace('.txt', '.named.json')
    try:
        d = json.load(open(prof))
    except Exception:
        continue
    runs += 1
    frames = d['stackFrames']
    def chain(sf):
        out = []
        while sf is not None and str(sf) in frames:
            f = frames[str(sf)]
            out.append(f.get('named') or f.get('name') or '(anon)')
            sf = f.get('parent')
        return out  # leaf first
    for smp in d['samples']:
        t = int(smp['ts'])
        if t0 <= t < t1:
            total += 1
            c = chain(smp['sf'])
            c = [x for x in c if x != '[root]']
            if c:
                leaf[c[0]] += 1
                # the first app-ish frame: skip react internals
                paths[' < '.join(c[:depth])] += 1
            # nearest frame from our src
            own = next((x for x in c if x.startswith('src/') or x.startswith('index.js')), None)
            top[own or (c[-1] if c else '?')] += 1

print(f'{runs} runs, {total} samples in {phase_from}->{phase_to}')
print('\n-- by leaf')
for k, v in leaf.most_common(25):
    print(f'{v:5} {k[:150]}')
print('\n-- by first frame in src/')
for k, v in top.most_common(25):
    print(f'{v:5} {k[:150]}')
if depth > 1:
    print('\n-- by path')
    for k, v in paths.most_common(30):
        print(f'{v:5} {k[:300]}')
