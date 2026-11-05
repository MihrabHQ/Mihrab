#!/usr/bin/env python3
"""Copy a raw capture into branding/store-raw/<device>/, tidying its status bar.

  prep_raw.py <device> <name> <capture.png> [--icons]

--icons clears the notification icons beside an Android clock (the app's
own ongoing notification, Play Protect's shield): the strip right of the
clock is replaced by the empty strip in the middle of the same bar, so
the sky or page behind it carries on.
"""
import os
import sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))


def clear_icons(im, box=None):
    w, h = im.size
    s = w / 1080
    if box:
        x0, x1, y0, y1 = box
    else:
        y0, y1 = int(18 * s), int(118 * s)
        x0, x1 = int(192 * s), int(420 * s)
    sx = x1 + 40
    src = im.crop((sx, y0, sx + (x1 - x0), y1))
    im.paste(src, (x0, y0))
    return im


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    device, name, cap = args
    im = Image.open(cap).convert('RGB')
    for a in sys.argv:
        if a == '--icons':
            im = clear_icons(im)
        elif a.startswith('--icons='):
            im = clear_icons(im, tuple(int(v) for v in a[8:].split(',')))
    out = os.path.join(ROOT, 'branding/store-raw', device, name + '.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im.save(out, optimize=True)
    print(os.path.relpath(out, ROOT))


if __name__ == '__main__':
    main()
