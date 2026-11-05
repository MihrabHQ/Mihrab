#!/usr/bin/env python3
"""Copy the built panels where each store's upload reads them.

  python3 branding/tools/panels/publish.py

- F-Droid (and fastlane supply for Play): fastlane/metadata/android/<locale>/images/
  phoneScreenshots, sevenInchScreenshots, tenInchScreenshots, featureGraphic.png.
  F-Droid takes PNG or JPEG; JPEG keeps the repository small.
- App Store: fastlane/screenshots/<locale>/ (deliver's layout; the file name's
  device prefix picks the slot).
- Mac App Store and Microsoft Store: branding/store-upload/<store>/<lang>/,
  for the consoles that take files by hand.

Only languages built (store-panels/<set>/<lang>) are copied.
"""
import glob
import os
import shutil
import subprocess

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
P = os.path.join(ROOT, 'branding/store-panels')

FASTLANE_ANDROID = {
    'en': 'en-US', 'sv': 'sv-SE', 'ar': 'ar', 'tr': 'tr-TR', 'ur': 'ur', 'id': 'id', 'de': 'de-DE',
    'fr': 'fr-FR', 'es': 'es-ES', 'ru': 'ru-RU', 'bn': 'bn-BD', 'hi': 'hi-IN', 'zh': 'zh-CN',
}
APPLE = {
    'en': 'en-US', 'sv': 'sv', 'ar': 'ar-SA', 'tr': 'tr', 'ur': 'ur', 'id': 'id', 'de': 'de-DE',
    'fr': 'fr-FR', 'es': 'es-ES', 'ru': 'ru', 'bn': 'bn', 'hi': 'hi', 'zh': 'zh-Hans',
}


def jpeg(src, dst, quality=90):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    Image.open(src).convert('RGB').save(dst, quality=quality, optimize=True)


def langs(set_):
    return sorted(os.path.basename(d) for d in glob.glob(os.path.join(P, set_, '*')) if os.path.isdir(d))


def clear(d, pattern='*'):
    for f in glob.glob(os.path.join(d, pattern)):
        os.remove(f)


# F-Droid copies every file in these folders into its repo and never
# deletes one (see build_store.py): a new name is a second screenshot on the
# listing forever. So the panels go out under the names already there, in
# order, as PNG; a set longer than the names adds new ones after them.
FDROID_NAMES = {
    'phoneScreenshots': ['1_home', '2_mushaf', '3_month', '4_duas', '5_tasbih', '6_journal', '7_qibla', '8_qibla', '9_hifz'],
    'tenInchScreenshots': ['1_home', '2_spread', '3_month', '4_duas', '5_journal', '6_month'],
}


def png_small(src, dst):
    """A PNG, quantised (pngquant) to keep the repository light."""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    Image.open(src).convert('RGB').save(dst)
    subprocess.run(['pngquant', '--force', '--skip-if-larger', '--quality=80-95', '--output', dst, dst], check=False)


def android():
    for lang in langs('play-phone'):
        base = os.path.join(ROOT, 'fastlane/metadata/android', FASTLANE_ANDROID[lang], 'images')
        for slot, sets in (('phoneScreenshots', ['play-phone']), ('tenInchScreenshots', ['play-tablet'])):
            files = [f for set_ in sets for f in sorted(glob.glob(os.path.join(P, set_, lang, '*.png')))]
            # Nine names for the phone: the eight Play panels and the devices
            # panel (sets/fdroid-phone: Android frames, Play's size).
            if slot == 'phoneScreenshots':
                extra = sorted(glob.glob(os.path.join(P, 'fdroid-phone', lang, '*_devices.png')))
                files += extra[:1]
            names = FDROID_NAMES[slot]
            for i, f in enumerate(files):
                stem = names[i] if i < len(names) else '%d_%s' % (i + 1, os.path.basename(f)[3:-4])
                png_small(f, os.path.join(base, slot, stem + '.png'))
        feat = os.path.join(P, 'play-feature', lang, '01_feature.png')
        if os.path.exists(feat):
            Image.open(feat).convert('RGB').save(os.path.join(base, 'featureGraphic.png'))


def apple():
    # English where the existing upload tooling reads it; every language
    # under fastlane/screenshots/<locale>/ for deliver.
    sets = (('APP_IPHONE_69', 'appstore-iphone', 'ios/6.9'), ('APP_IPAD_PRO_3GEN_129', 'appstore-ipad', 'ipad/13'), ('APP_DESKTOP', 'appstore-mac', 'mac'))
    for prefix, set_, legacy in sets:
        d = os.path.join(ROOT, 'fastlane/screenshots', legacy)
        os.makedirs(d, exist_ok=True)
        clear(d, '*.jpg')
        for f in sorted(glob.glob(os.path.join(P, set_, 'en', '*.png'))):
            jpeg(f, os.path.join(d, os.path.basename(f)[:-4] + '.jpg'))
    for lang in langs('appstore-iphone'):
        d = os.path.join(ROOT, 'fastlane/screenshots', APPLE[lang])
        os.makedirs(d, exist_ok=True)
        clear(d, '*.jpg')
        for prefix, set_, _ in sets:
            for f in sorted(glob.glob(os.path.join(P, set_, lang, '*.png'))):
                jpeg(f, os.path.join(d, f'{prefix}_{os.path.basename(f)[:-4]}.jpg'))


def manual():
    for store, set_ in (('msstore', 'msstore'), ('chromebook', 'play-chromebook')):
        for lang in langs(set_):
            d = os.path.join(ROOT, 'branding/store-upload', store, lang)
            os.makedirs(d, exist_ok=True)
            clear(d)
            for f in sorted(glob.glob(os.path.join(P, set_, lang, '*.png'))):
                jpeg(f, os.path.join(d, os.path.basename(f)[:-4] + '.jpg'))


def cover(src, size):
    """`src` scaled to fill `size` and cut to it from the middle."""
    im = Image.open(src).convert('RGB')
    w, h = size
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


# The wide panels the site and README show, one per platform.
WIDE = [('appstore-ipad', '03_spread'), ('appstore-mac', '01_hero'), ('msstore', '04_remember'), ('play-chromebook', '05_month')]


def web():
    """The README's and the site's pictures: compact, cross-platform, per language."""
    sc = os.path.join(P, 'showcase')
    Image.open(os.path.join(sc, 'en', '01_hero.png')).convert('RGB').save(os.path.join(ROOT, 'branding/github-hero.png'))
    readme = os.path.join(ROOT, 'branding/readme')
    jpeg(os.path.join(sc, 'en', '01_xplat.png'), os.path.join(readme, 'xplat.jpg'), 86)
    phones = sorted(glob.glob(os.path.join(P, 'play-phone', 'en', '*.png')))
    strip = Image.new('RGB', (405 * len(phones) + 12 * (len(phones) - 1), 720), (255, 255, 255))
    for i, f in enumerate(phones):
        strip.paste(Image.open(f).convert('RGB').resize((405, 720), Image.LANCZOS), (i * 417, 0))
    strip.save(os.path.join(readme, 'panels-phone.jpg'), quality=86, optimize=True)
    grid = Image.new('RGB', (2 * 1280 + 12, 2 * 720 + 12), (255, 255, 255))
    for i, (set_, name) in enumerate(WIDE):
        grid.paste(cover(os.path.join(P, set_, 'en', name + '.png'), (1280, 720)), ((i % 2) * 1292, (i // 2) * 732))
    grid.save(os.path.join(readme, 'panels-wide.jpg'), quality=86, optimize=True)

    img = os.path.join(ROOT, 'docs/assets/img')
    Image.open(os.path.join(sc, 'en', '01_og.png')).convert('RGB').save(os.path.join(img, 'og-hero.png'))
    # The devices alone carry no words: one picture for every page.
    jpeg(os.path.join(sc, 'en', '01_xplat.png'), os.path.join(img, 'panels', 'xplat.jpg'), 84)
    for lang in langs('play-phone'):
        d = os.path.join(img, 'panels', lang)
        os.makedirs(d, exist_ok=True)
        clear(d)
        for i, f in enumerate(sorted(glob.glob(os.path.join(P, 'play-phone', lang, '*.png')))):
            Image.open(f).convert('RGB').resize((540, 960), Image.LANCZOS).save(os.path.join(d, 'phone-%d.jpg' % (i + 1)), quality=82, optimize=True)
        for i, (set_, name) in enumerate(WIDE):
            cover(os.path.join(P, set_, lang, name + '.png'), (1280, 720)).save(os.path.join(d, 'wide-%d.jpg' % (i + 1)), quality=82, optimize=True)


if __name__ == '__main__':
    android()
    apple()
    manual()
    web()
    print('published')
