#!/usr/bin/env python3
"""
Time one screen-recorded cold start (see video.sh).

Prints `visible=… content=…`, both in ms after the launch animation began:
  visible  — the first frame that already looks like the end screen, stale
             or live: when the person can read their times
  content  — the first frame from which the screen stays within a small
             distance of how the recording ends: what the person came for.
Only the middle of the screen counts for `content`, so a ticking countdown
or a heads-up notification does not keep it from settling.
"""
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

video = sys.argv[1]
tmp = tempfile.mkdtemp()
# Every frame the recorder wrote, small and grey, with its timestamp.
proc = subprocess.run(
    ['ffmpeg', '-v', 'info', '-i', video, '-vf', 'scale=90:-1,format=gray,showinfo',
     '-fps_mode', 'passthrough', os.path.join(tmp, 'f%04d.png')],
    capture_output=True, text=True)
times = [float(t) for t in re.findall(r'pts_time:([0-9.]+)', proc.stderr)]
frames = []
for idx, t in enumerate(times, start=1):
    p = os.path.join(tmp, f'f{idx:04d}.png')
    if os.path.exists(p):
        frames.append((t, np.asarray(Image.open(p), dtype=np.float32)))
if len(frames) < 3:
    print('error=no-frames')
    sys.exit(0)

def dist(a, b, top_only=False):
    if top_only:
        # The middle of the screen: not the bottom (a ticking clock) and not
        # the top fifth, where a heads-up notification may slide in — a
        # force-stop clears the app's ongoing notification, and the launch
        # posts it again.
        h = a.shape[0]
        a, b = a[h // 5:h * 3 // 4], b[h // 5:h * 3 // 4]
    return float(np.mean(np.abs(a - b)))

launcher = frames[0][1]
final = frames[-1][1]
start = next((t for t, f in frames if dist(f, launcher) > 2.0), None)
if start is None:
    print('error=no-launch')
    sys.exit(0)
# The first frame that already looks like the screen the launch ends on
# (stale or live): the moment the person can read their times.
visible = None
for t, f in frames:
    if t <= start:
        continue
    if dist(f, final, top_only=True) < 12.0:
        visible = t
        break
content = None
for k, (t, f) in enumerate(frames):
    if t <= start:
        continue
    if all(dist(g, final, top_only=True) < 3.0 for _, g in frames[k:]):
        content = t
        break
out = []
if visible is not None:
    out.append(f'visible={round((visible - start) * 1000)}')
if content is not None:
    out.append(f'content={round((content - start) * 1000)}')
print(' '.join(out) or 'error=unsettled')
