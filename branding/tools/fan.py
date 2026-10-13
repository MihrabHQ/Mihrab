#!/usr/bin/env python3
"""Fan five phone captures into one picture — a hand of cards, the middle
one in front, every screen's top in view — on a transparent ground.

  python3 branding/tools/fan.py OUT.png A.png B.png C.png D.png E.png

Used for the Sky theme's hours and the full-screen alerts on the site and
in the README (`docs/assets/img/shot-*.png`, `branding/readme/1*_*.png`).
Captures are 1080x2400; the result is 1600 wide.
"""
import math
import sys
from PIL import Image, ImageDraw, ImageFilter

W, H, R, PAD = 540, 1200, 40, 60
ANGLES = [-16, -8, 0, 8, 16]
PIVOT = 2900


def phone(path):
    im = Image.open(path).convert('RGBA').resize((W, H), Image.LANCZOS)
    mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, W - 1, H - 1), radius=R, fill=255)
    im.putalpha(mask)
    sh = Image.new('RGBA', (W + 2 * PAD, H + 2 * PAD), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((PAD, PAD + 18, PAD + W - 1, PAD + H - 1 + 18), radius=R, fill=(10, 8, 20, 120))
    sh = sh.filter(ImageFilter.GaussianBlur(26))
    sh.paste(im, (PAD, PAD), im)
    return sh


def fan(paths, out, width=1600):
    canvas = Image.new('RGBA', (4000, 5000), (0, 0, 0, 0))
    cx, py = 2000, 4600
    layers = []
    for path, a in zip(paths, ANGLES):
        rot = phone(path).rotate(-a, resample=Image.BICUBIC, expand=True)
        t = math.radians(a)
        rx, ry = -PIVOT * math.sin(t), PIVOT * math.cos(t)
        layers.append((rot, int(cx - rx - rot.width / 2), int(py - ry - rot.height / 2)))
    for i in [0, 4, 1, 3, 2]:
        rot, x, y = layers[i]
        canvas.alpha_composite(rot, (x, y))
    canvas = canvas.crop(canvas.getbbox())
    w, h = canvas.size
    canvas.resize((width, int(h * width / w)), Image.LANCZOS).save(out, optimize=True)
    print(out, width, int(h * width / w))


if __name__ == '__main__':
    fan(sys.argv[2:7], sys.argv[1])
