#!/usr/bin/env python3
"""
The watch face's fonts for a MIP screen (garmin/watchface/resources/fonts/):
every figure and every word on the face.

A memory-in-pixel panel shows a pixel on or off — 64 colours and nothing
between them — so a font drawn for an AMOLED screen, thin and smoothed with
greys, comes out on it as a dither or as ragged stems. What reads on it is
what Garmin's own MIP faces use: heavy, simple forms whose every edge lies
on the pixel grid. So the face carries its own:

  * Tektur (OFL 1.1, garmin/tools/fonts/) — a face built of horizontals,
    verticals and 45° corners and nothing else: no curve to break into
    steps, and a 45° edge is one pixel over, one pixel down;
  * at each size, the WEIGHT is chosen so the vertical stem is a whole
    number of pixels (the font is variable: weight is a dial, not a
    choice of two), a quarter of the figure's height or as near as a
    whole pixel comes — chunky, and the same stem in every letter;
  * rendered one bit deep with FreeType's monochrome hinting, which sets
    the horizontals on whole rows too. No anti-aliasing anywhere.

The fonts, by what the face calls them (MihrabFaceView.mc):

  Clock40…76   the time: digits and the colon, at a ladder of heights
  Count18…28   the countdown: the same, and the box is exactly the ink
  Seconds15    the seconds beside the time
  Battery9     the figure inside the battery's circle
  Text18…28    the words — date, weather, prayer, steps, messages — named
               by the height of their capitals and figures: Latin with
               its accents (Swedish, German, French, Spanish, Turkish,
               Indonesian …) and Cyrillic
  Side14       am/pm and the day's high and low

    python3 garmin/tools/facefont.py            # writes the fonts
    python3 garmin/tools/facefont.py --specimen out.png   # and a sheet to look at

Needs Pillow and fontTools. Written as BMFont text files, which the Connect
IQ compiler reads. Also writes ../watchface/source/MihrabFaceCover.mc: the
characters the Text fonts hold, so the face can tell a line it can write in
them from one it cannot (Arabic, Greek, Thai …) and give that line the
watch's own font instead of blanks.

The figures' fonts have their base on the tops of the figures, with no
room above: a MIP panel is refreshed a line at a time and a partial update
is charged for every line its clip covers, so the clip for the seconds and
the countdown must be the ink and no more. In every font the ten figures
share one advance, so a countdown's pairs stand where they stood a second
ago and "88" is the widest two figures can be.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
TTF = os.path.join(HERE, 'fonts', 'Tektur.ttf')
OUT = os.path.join(HERE, '..', 'watchface', 'resources', 'fonts')
COVER = os.path.join(HERE, '..', 'watchface', 'source', 'MihrabFaceCover.mc')

DIGITS = '0123456789'
FIGURES = DIGITS + ':'
CLOCK_HEIGHTS = [76, 70, 64, 60, 56, 53, 50, 47, 44, 40]
COUNT_HEIGHTS = [28, 24, 20, 18]
TEXT_HEIGHTS = [28, 24, 20, 18]
SIDE = '0123456789 °/-–−:.,%apmAPM'

# The widths: Tektur's width runs 75 (condensed) to 100. The words a little
# narrower than the figures — a date and a prayer's line are the widest
# rows after the clock, and the dial is round.
WIDTH_FIGURES = 88
WIDTH_TEXT = 84

# What the Text fonts hold, where Tektur has the glyph: Basic Latin, Latin-1,
# Latin Extended-A, Romanian's comma letters, Greek, Cyrillic, and the
# punctuation the face's own strings use. (Not Vietnamese's stacked accents:
# they would add two rows of headroom to every line of every language.)
TEXT_RANGES = [(0x20, 0x7E), (0xA0, 0xFF), (0x100, 0x17F), (0x218, 0x21B), (0x370, 0x3FF), (0x400, 0x45F),
               (0x490, 0x491)]
TEXT_EXTRA = [0x2013, 0x2014, 0x2019, 0x2026, 0x2212]

# Tektur's stems, measured from the outlines: the vertical stem of H in
# thousandths of the em at weight w is 116 + 0.26·(w − 500); its capitals
# and figures are 700 high.
STEM_AT_500 = 116.0
STEM_PER_WEIGHT = 0.26
CAP = 700.0
WEIGHT_MIN, WEIGHT_MAX = 400, 900


def weight_for(height, stem):
    """The weight at which a font `height` pixels high has a stem of `stem` pixels."""
    w = 500 + (stem * CAP / height - STEM_AT_500) / STEM_PER_WEIGHT
    return max(WEIGHT_MIN, min(WEIGHT_MAX, w))


def stem_for(height, share):
    """A whole number of pixels, as near `share` of the height as there is."""
    return max(1, round(height * share))


def load(height, width, share):
    """The font whose '8' is `height` pixels tall, its stem a whole number of pixels."""
    stem = stem_for(height, share)
    weight = weight_for(height, stem)
    size = height
    f = None
    for _ in range(80):
        f = ImageFont.truetype(TTF, size)
        f.set_variation_by_axes([width, weight])
        l, t, r, b = mono_box(f, '8')
        got = b - t
        if got == height:
            break
        size += 1 if got < height else -1
    return f, stem, round(weight)


def mono_glyph(f, ch):
    """The glyph one bit deep: (image of its ink or None, x of the ink from the pen, y of its top from the baseline)."""
    l, t, r, b = f.getbbox(ch, anchor='ls')
    pad = 6
    w, h = max(1, r - l) + 2 * pad, max(1, b - t) + 2 * pad
    img = Image.new('1', (w, h), 0)
    d = ImageDraw.Draw(img)
    d.fontmode = '1'
    d.text((pad - l, pad - t), ch, font=f, fill=1, anchor='ls')
    box = img.getbbox()
    if box is None:
        return None, 0, 0
    return img.crop(box), box[0] - pad + l, box[1] - pad + t


def mono_box(f, ch):
    ink, x0, y0 = mono_glyph(f, ch)
    if ink is None:
        return 0, 0, 0, 0
    return x0, y0, x0 + ink.width, y0 + ink.height


def covered():
    """The code points the Text fonts hold: the ranges above, where Tektur has the glyph."""
    cmap = TTFont(TTF).getBestCmap()
    want = [c for a, b in TEXT_RANGES for c in range(a, b + 1)] + TEXT_EXTRA
    return [c for c in want if c in cmap and c != 0xAD]


def build(name, height, chars, width, share, tight):
    """
    One font. `tight`: the base is the top of the figures (the box is the
    ink); otherwise it is the top of the tallest glyph, accents included,
    and the line has the room its descenders need.
    """
    f, stem, weight = load(height, width, share)
    glyphs = []
    # Air between the letters. Tektur at these weights is set tight — drawn
    # for a headline in print — and on this panel two heavy stems a pixel
    # apart close into one. A third of the stem is added to every advance,
    # half of it before the ink.
    track = max(1, round(stem / 3))
    # One advance for the ten figures, the widest of them — in the fonts
    # whose figures change in place (`tight`). In the words' fonts a figure
    # keeps its own width: "11 Nov" is not a table.
    digit_adv = max(round(f.getlength(d)) for d in DIGITS) + track
    for ch in chars:
        ink, x0, y0 = mono_glyph(f, ch)
        adv = round(f.getlength(ch)) + track
        x0 += track // 2
        if tight and ch == '1':
            ink, x0, adv = footed_one(f, ink, stem, track)
        if tight and ch in DIGITS:
            # Centred in the shared advance, by its own side bearings.
            x0 += (digit_adv - adv) // 2
            adv = digit_adv
        elif ch == ':' and ink is not None:
            # The colon stands clear of the figures by most of a stem each
            # side (the figures' own air comes on top of it).
            side = max(1, round(stem * 0.6))
            x0 = side
            adv = ink.width + 2 * side
        glyphs.append((ch, ink, x0, y0, adv))
    tops = [g[3] for g in glyphs if g[1] is not None]
    bottoms = [g[3] + g[1].height for g in glyphs if g[1] is not None]
    figure_top = min(g[3] for g in glyphs if g[0] in DIGITS and g[1] is not None)
    base = -figure_top if tight else -min(tops)
    line = base + (1 if tight else max(0, max(bottoms)) + 1)

    # The sheet: rows no wider than 512.
    x, y, row_h, sheet_w = 1, 1, 0, 0
    placed = []
    for ch, ink, x0, y0, adv in glyphs:
        if ink is None:
            placed.append((ch, None, 0, 0, x0, y0, adv))
            continue
        if x + ink.width + 1 > 512:
            x, y, row_h = 1, y + row_h + 1, 0
        placed.append((ch, ink, x, y, x0, y0, adv))
        x += ink.width + 1
        row_h = max(row_h, ink.height)
        sheet_w = max(sheet_w, x)
    sheet_h = y + row_h + 1
    sheet = Image.new('RGBA', (sheet_w, sheet_h), (255, 255, 255, 0))
    lines = []
    for ch, ink, gx, gy, x0, y0, adv in placed:
        if ink is None:
            lines.append(f'char id={ord(ch)} x=0 y=0 width=0 height=0 xoffset=0 yoffset=0 xadvance={adv} page=0 chnl=15')
            continue
        white = Image.new('RGBA', ink.size, (255, 255, 255, 255))
        sheet.paste(white, (gx, gy), ink.convert('L'))
        lines.append(
            f'char id={ord(ch)} x={gx} y={gy} width={ink.width} height={ink.height} '
            f'xoffset={x0} yoffset={base + y0} xadvance={adv} page=0 chnl=15')
    sheet.save(os.path.join(OUT, name + '.png'))
    with open(os.path.join(OUT, name + '.fnt'), 'w') as out:
        out.write(f'info face="Tektur" size={f.size} bold=1 italic=0 charset="" unicode=1 '
                  f'stretchH=100 smooth=0 aa=1 padding=0,0,0,0 spacing=1,1\n')
        out.write(f'common lineHeight={line} base={base} scaleW={sheet_w} scaleH={sheet_h} '
                  f'pages=1 packed=0\n')
        out.write(f'page id=0 file="{name}.png"\n')
        out.write(f'chars count={len(lines)}\n')
        out.write('\n'.join(lines) + '\n')
    table = {ch: (ink, x0, base + y0, adv) for ch, ink, _gx, _gy, x0, y0, adv in placed}
    print(f'{name:10s} size {f.size:3d}  weight {weight}  stem {stem}px  base {base}  line {line}  '
          f'figure advance {digit_adv}  glyphs {len(lines)}  sheet {sheet_w}x{sheet_h}')
    return {'glyphs': table, 'base': base, 'line': line}


def footed_one(f, one, stem, track):
    """
    The 1 of the figures' fonts: Tektur's, on a foot.

    Where the ten figures share an advance — the clock, the countdown, the
    seconds: figures that change in place — Tektur's 1 is a stem and a flag
    in a box made for an 8, with a hole each side of it: "12:38" reads as
    "1 2:38". A foot the weight of the font's own horizontals, most of an
    8 wide, fills the box the way every fixed-width figure 1 does, and
    keeps the stem where the eye expects it.
    """
    two, _, _ = mono_glyph(f, '2')
    eight, _, _ = mono_glyph(f, '8')
    # The horizontal stroke: the full rows at the foot of the 2.
    bar = 0
    for y in range(two.height - 1, -1, -1):
        if all(two.getpixel((x, y)) for x in range(two.width // 4, two.width)):
            bar += 1
        else:
            break
    bar = max(1, bar)
    # The stem of the 1: the columns set at mid-height.
    mid = one.height // 2
    cols = [x for x in range(one.width) if one.getpixel((x, mid))]
    centre2 = cols[0] + cols[-1] + 1  # twice the stem's centre
    foot = round(eight.width * 0.8)
    # The foot centred under the stem; the flag stands out to the left of it.
    left = max(0, (foot - centre2 + 1) // 2)
    start = max(0, (2 * left + centre2 - foot) // 2)
    width = max(left + one.width, start + foot)
    img = Image.new('1', (width, one.height), 0)
    img.paste(one, (left, 0), one)
    ImageDraw.Draw(img).rectangle((start, one.height - bar, start + foot - 1, one.height - 1), fill=1)
    return img, track // 2, width + track


def ranges_of(codes):
    out = []
    for c in sorted(codes):
        if out and c == out[-1][1] + 1:
            out[-1][1] = c
        else:
            out.append([c, c])
    return out


def write_cover(codes):
    pairs = ranges_of(codes)
    flat = ', '.join(f'0x{a:X}, 0x{b:X}' for a, b in pairs)
    with open(COVER, 'w') as out:
        out.write(
            '// Written by garmin/tools/facefont.py — not by hand.\n'
            '//\n'
            '// The characters the face\'s own Text fonts hold, as [first, last] pairs in\n'
            '// order. A line with a character outside them — Arabic, Greek, Thai — is\n'
            '// written in the watch\'s own font instead (MihrabFaceView.mc, `pixelRows`).\n'
            'import Toybox.Lang;\n\n'
            'module MihrabFaceCover {\n'
            f'    const RANGES = [{flat}] as Array<Number>;\n\n'
            '    // Whether every character of the text is in the Text fonts.\n'
            '    function holds(text as String) as Boolean {\n'
            '        var chars = text.toCharArray();\n'
            '        var n = RANGES.size();\n'
            '        for (var i = 0; i < chars.size(); i++) {\n'
            '            var c = chars[i].toNumber();\n'
            '            var ok = false;\n'
            '            for (var r = 0; r < n && !ok; r += 2) {\n'
            '                if (c < RANGES[r]) {\n'
            '                    break;\n'
            '                }\n'
            '                ok = c <= RANGES[r + 1];\n'
            '            }\n'
            '            if (!ok) {\n'
            '                return false;\n'
            '            }\n'
            '        }\n'
            '        return true;\n'
            '    }\n'
            '}\n')


def write(font, text):
    """The text as the watch draws it from the font: its glyphs at their advances."""
    gap = (None, 0, 0, 6)
    width = sum(font['glyphs'].get(ch, gap)[3] for ch in text)
    img = Image.new('1', (width + 8, font['line'] + 6), 0)
    x = 4
    for ch in text:
        ink, x0, y0, adv = font['glyphs'].get(ch, gap)
        if ink is not None:
            img.paste(ink, (x + x0, 3 + y0), ink)
        x += adv
    return img


def specimen(path, fonts):
    """A sheet of the fonts as the panel shows them, three times the size, to look at."""
    rows = [
        ('Text20', 'Wed 11 Nov   8°'), ('Side14', '16°/7°  pm'), ('Clock60', '12:38'),
        ('Seconds15', '07'), ('Text24', 'Maghrib  16:42'), ('Count24', '05:49:12'),
        ('Text20', '4532  Tor 12 nov.'), ('Battery9', '87 100 45'),
        ('Text18', 'Soluppgång Öğle İkindi Çar'), ('Text18', 'Пт 13 нояб. Магриб Иша'),
        ('Text28', 'Dhuhr 12:38'), ('Count28', '10:38:07'), ('Count18', '00:04:59'), ('Clock76', '9:41'), ('Clock40', '0123456789'),
        ('Text24', 'Open Mihrab on your phone'), ('Text20', 'The quick brown fox jumps over the lazy dog'),
        ('Text20', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
    ]
    imgs = [write(fonts[name], text) for name, text in rows]
    w = max(i.width for i in imgs)
    out = Image.new('1', (w, sum(i.height for i in imgs)), 0)
    y = 0
    for i in imgs:
        out.paste(i, (0, y))
        y += i.height
    out.resize((out.width * 3, out.height * 3), Image.NEAREST).save(path)


def main():
    os.makedirs(OUT, exist_ok=True)
    for old in os.listdir(OUT):
        if old.endswith('.fnt') or old.endswith('.png'):
            os.remove(os.path.join(OUT, old))
    codes = covered()
    text_chars = ''.join(chr(c) for c in codes)
    entries, fonts = [], {}

    def add(font_id, height, chars, width, share, tight):
        name = font_id.lower()
        fonts[font_id] = build(name, height, chars, width, share, tight)
        entries.append(f'    <font id="{font_id}" filename="{name}.fnt" antialias="false"/>')

    for h in CLOCK_HEIGHTS:
        add(f'Clock{h}', h, FIGURES, WIDTH_FIGURES, 0.23, True)
    for h in COUNT_HEIGHTS:
        add(f'Count{h}', h, FIGURES, WIDTH_FIGURES, 0.21, True)
    add('Seconds15', 15, FIGURES, WIDTH_FIGURES, 0.2, True)
    add('Battery9', 9, FIGURES, WIDTH_FIGURES, 0.2, True)
    for h in TEXT_HEIGHTS:
        add(f'Text{h}', h, text_chars, WIDTH_TEXT, 0.21, False)
    add('Side14', 14, SIDE, WIDTH_TEXT, 0.2, False)

    with open(os.path.join(OUT, 'fonts.xml'), 'w') as out:
        out.write('<!-- garmin/tools/facefont.py: the face\'s fonts for a MIP screen — Tektur, one bit deep, every stem a whole pixel. -->\n<fonts>\n')
        out.write('\n'.join(entries) + '\n</fonts>\n')
    write_cover(codes)
    print(f'{len(codes)} characters in the Text fonts')
    if '--specimen' in sys.argv:
        specimen(sys.argv[sys.argv.index('--specimen') + 1], fonts)


if __name__ == '__main__':
    main()
