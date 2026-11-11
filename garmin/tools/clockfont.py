#!/usr/bin/env python3
"""
The watch face's clock figures (garmin/watchface/resources/fonts/).

Garmin's number fonts jump from figures 37 px tall to 56 to 65, and a
two-digit hour with the weather and the seconds beside it fits only the
smallest. These are the app's own Roboto (Apache 2.0,
android/app/src/main/res/font/roboto_bold.ttf), digits and the colon only,
at a ladder of figure heights in between, so the face can take the largest
that fits the dial. Rendered one bit deep — no anti-aliasing for the MIP
screen to dither — and written as BMFont text files, which the Connect IQ
compiler reads.

    python3 garmin/tools/clockfont.py

Needs Pillow. The font's base sits on the tops of the figures, with no room
for accents above them, so the ascent the face measures is the ink.
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
TTF = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'font', 'roboto_bold.ttf')
OUT = os.path.join(HERE, '..', 'watchface', 'resources', 'fonts')
CHARS = '0123456789:'
HEIGHTS = [76, 70, 64, 60, 56, 53, 50, 47, 44, 40]
# The two things redrawn every second, in the same figures: the countdown
# (largest first) and the seconds beside the clock. Not for looks alone. A
# MIP panel is refreshed a line at a time, and a partial update is charged
# for every line its clip covers; a system font's box is a third taller
# than its figures, and how much taller differs from one firmware to the
# next, so the clip had to cover all of it. These have no room above or
# below the figures — the clip is the ink, and the second-by-second draw
# stays well inside the 30 ms a watch face is allowed.
COUNT_HEIGHTS = [28, 24, 20, 18]
SECONDS_HEIGHTS = [15]


def font_for(height):
    """The point size whose '8' is `height` pixels tall."""
    size = height
    f = None
    for _ in range(60):
        f = ImageFont.truetype(TTF, size)
        l, t, r, b = f.getbbox('8', anchor='ls')
        got = b - t
        if got == height:
            return f
        size += 1 if got < height else -1
    return f


def build(height, chars=CHARS, name=None):
    f = font_for(height)
    glyphs = []
    top = 0
    for ch in chars:
        l, t, r, b = f.getbbox(ch, anchor='ls')
        w, h = r - l + 4, b - t + 4
        img = Image.new('L', (w, h), 0)
        ImageDraw.Draw(img).text((2 - l, 2 - t), ch, font=f, fill=255, anchor='ls')
        img = img.point(lambda v: 255 if v >= 128 else 0)
        box = img.getbbox()
        ink = img.crop(box)
        # Where the ink sits relative to the pen and the baseline.
        x0 = box[0] - 2 + l
        y0 = box[1] - 2 + t
        glyphs.append((ch, ink, x0, y0, round(f.getlength(ch))))
        top = min(top, y0)
    base = -top
    width = sum(g[1].width + 1 for g in glyphs) + 1
    sheet_h = max(g[1].height for g in glyphs) + 2
    sheet = Image.new('RGBA', (width, sheet_h), (255, 255, 255, 0))
    x = 1
    lines = []
    for ch, ink, x0, y0, adv in glyphs:
        white = Image.new('RGBA', ink.size, (255, 255, 255, 255))
        sheet.paste(white, (x, 1), ink)
        lines.append(
            f'char id={ord(ch)} x={x} y=1 width={ink.width} height={ink.height} '
            f'xoffset={x0} yoffset={base + y0} xadvance={adv} page=0 chnl=15')
        x += ink.width + 1
    name = name or f'clock{height}'
    sheet.save(os.path.join(OUT, name + '.png'))
    with open(os.path.join(OUT, name + '.fnt'), 'w') as out:
        out.write(f'info face="Roboto Bold" size={f.size} bold=1 italic=0 charset="" unicode=1 '
                  f'stretchH=100 smooth=0 aa=1 padding=0,0,0,0 spacing=1,1\n')
        out.write(f'common lineHeight={base + 1} base={base} scaleW={width} scaleH={sheet_h} '
                  f'pages=1 packed=0\n')
        out.write(f'page id=0 file="{name}.png"\n')
        out.write(f'chars count={len(lines)}\n')
        out.write('\n'.join(lines) + '\n')
    return name, base, round(f.getlength('8'))


def main():
    os.makedirs(OUT, exist_ok=True)
    entries = []
    for h in HEIGHTS:
        name, base, adv = build(h)
        entries.append(f'    <font id="Clock{h}" filename="{name}.fnt" antialias="false" filter="{CHARS}"/>')
        print(name, 'base', base, 'digit advance', adv)
    for prefix, heights in (('Count', COUNT_HEIGHTS), ('Seconds', SECONDS_HEIGHTS)):
        for h in heights:
            name, base, adv = build(h, name=f'{prefix.lower()}{h}')
            entries.append(f'    <font id="{prefix}{h}" filename="{name}.fnt" antialias="false" filter="{CHARS}"/>')
            print(name, 'base', base, 'digit advance', adv)
    with open(os.path.join(OUT, 'fonts.xml'), 'w') as out:
        out.write('<!-- garmin/tools/clockfont.py: the clock, countdown and seconds figures in the app\'s Roboto. -->\n<fonts>\n')
        out.write('\n'.join(entries) + '\n</fonts>\n')


if __name__ == '__main__':
    main()
