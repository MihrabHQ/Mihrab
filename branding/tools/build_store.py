#!/usr/bin/env python3
"""Build the App Store screenshot + preview sets.

Raw screenshots live in branding/store/<device>/ at the exact pixel size App
Store Connect asks for.  This script turns each raw shot into the captioned
marketing image that goes on the product page, and drops a JPEG copy into the
fastlane folder the images are uploaded from.

  iPhone 6.9"  1320 x 2868   branding/store/ios-6.9   -> branding/store-previews
                                                      -> fastlane/screenshots/ios/6.9
  iPad 13"     2064 x 2752   branding/store/ipad-13   -> branding/store-previews-ipad
                                                      -> fastlane/screenshots/ipad/13

Both sizes are the ones Apple currently requires: 6.9" is the mandatory
iPhone slot and 13" the mandatory iPad one.  Smaller classes are optional and
App Store Connect scales these down for them, so no 6.5" set is kept.

Run from anywhere:  python3 branding/tools/build_store.py
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

from compose import compose, compose_landscape, headline_size  # noqa: E402
from PIL import Image  # noqa: E402

# Keyed by the part of the file name after the number, so the same screen
# can sit at a different position in different sets. The number is what
# fixes the running order on the product page.
#
# THE STORY IS branding/IDENTITY.md's, in its order: the day's prayers
# first, because that is where the name comes from, then the Qur'an read
# and listened to, then the remembrance between prayers, and the last
# panel closes on what makes the app yours. The first headline is the
# identity's own headline, so the first thing anyone reads on a store is
# the same sentence the website opens with. Voice rules from the same
# file: calm, precise, no superlatives, no guilt.
#
# "\\n" inside a headline is a deliberate line break.
CAPTIONS = {
    "home": (
        "For every prayer,\\nand everything between",
        "Prayer times, the Quran, dua and dhikr in one calm app",
    ),
    "mushaf": (
        "The Madinah mushaf,\\nin tajweed colour",
        "The recited word lights up; hold any word to hear it",
    ),
    "spread": (
        "The mushaf,\\nas it falls open",
        "Two facing pages in tajweed colour, as the Madinah print sets them",
    ),
    "tilawah": (
        "Tilawah, surah\\ninto surah",
        "42 reciters, the screen off, the page following the recited word",
    ),
    "ayah": (
        "Translation, tafsir\\nand tajweed",
        "13 translations, classical tafsir, every tajweed rule explained",
    ),
    "duas": (
        "The remembrance\\nbetween prayers",
        "100+ duas from Hisn al-Muslim, with transliteration",
    ),
    "tasbih": (
        "Dhikr, counted\\nquietly",
        "A tasbih for after the prayer, and for the rest of the day",
    ),
    "journal": (
        "Your prayers,\\nkept by you",
        "Log each prayer with one tap; the record stays on your devices",
    ),
    "month": (
        "The month ahead,\\nready to share",
        "Every day's times in one table, offline, as an image or a PDF",
    ),
    "qibla": (
        "Facing\\nthe Ka'bah",
        "A live bearing from your phone's own sensors",
    ),
}

# The tablet panels are landscape, and their text is a column beside the
# device: a line that fits across a phone does not fit there. Only the
# break moves; the words are the same.
LANDSCAPE_HEADLINES = {
    "home": "For every prayer,\\nand everything\\nbetween",
}


def caption(screen, landscape):
    headline, subhead = CAPTIONS[screen]
    if landscape:
        headline = LANDSCAPE_HEADLINES.get(screen, headline)
    return headline, subhead


# F-DROID NEVER DELETES A SCREENSHOT (see build() and docs/DISTRIBUTION.md),
# so the file names it has already copied are kept as SLOTS: the first
# panel is always written as the first name below, whatever it shows, and
# only a panel beyond the list gets a new name. Reordering the story then
# overwrites files F-Droid already holds rather than adding duplicates
# beside them. The names no longer describe the picture — F-Droid shows
# them in file-name order and never shows the name.
FDROID_SLOTS = {
    "phoneScreenshots": ["1_home", "2_mushaf", "3_month", "4_duas", "5_tasbih", "6_journal", "7_qibla"],
    "tenInchScreenshots": ["1_home", "2_spread", "3_month", "4_duas", "5_journal"],
}

SETS = [
    {
        "name": 'iPhone 6.9"',
        "src": "branding/store/ios-6.9",
        "previews": "branding/store-previews",
        "upload": "fastlane/screenshots/ios/6.9",
        "raw_size": (1320, 2868),
        "size": (1320, 2868),
        "radius": 0.062,
        "device_w": 0.66,
        "device_top": 0.300,
    },
    {
        "name": 'iPad 13"',
        "src": "branding/store/ipad-13",
        "previews": "branding/store-previews-ipad",
        "upload": "fastlane/screenshots/ipad/13",
        "raw_size": (2064, 2752),
        "size": (2064, 2752),
        "radius": 0.030,
        "device_w": 0.74,
        "device_top": 0.355,
    },
    {
        # Play caps a screenshot's long side at twice its short side, so the
        # phone's own 1080x2400 (2.22) cannot be uploaded as-is and the panel
        # is composed at 1080x2160 (exactly 2.00). F-Droid gets the same
        # panels, under plain 1-based names — see the note in build().
        "name": "Android phone",
        "src": "branding/store/play",
        "raw_size": (1080, 2400),
        "previews": "branding/play-previews",
        "upload": None,
        "fdroid": "fastlane/metadata/android/en-US/images/phoneScreenshots",
        "size": (1080, 2160),
        "radius": 0.050,
        "device_w": 0.62,
        # Low enough that a two-line subhead never pushes one device below
        # its neighbours: the set reads as one row on the store page.
        "device_top": 0.322,
    },
    {
        # A tablet is held in landscape and Play wants 16:9 or 9:16 exactly,
        # so these are the only panels built sideways. 1440 on the short side
        # clears Play's 1080 floor with room to spare.
        "name": "Android tablet",
        "src": "branding/store/play-tablet",
        "raw_size": (2560, 1600),
        "previews": "branding/play-previews-tablet",
        "upload": None,
        "fdroid": "fastlane/metadata/android/en-US/images/tenInchScreenshots",
        "size": (2560, 1440),
        "landscape": True,
        "radius": 0.022,
        "device_w": 0.66,
        "device_top": None,
    },
]


def check(path, size):
    im = Image.open(path)
    if im.size != size:
        raise SystemExit("%s is %s, expected %s" % (path, im.size, size))
    if im.mode != "RGB":
        raise SystemExit("%s carries an alpha channel; the stores reject those" % path)


def empty(path, suffixes):
    os.makedirs(path, exist_ok=True)
    for stale in sorted(os.listdir(path)):
        if stale.lower().endswith(suffixes):
            os.remove(os.path.join(path, stale))


def build(spec):
    src = os.path.join(ROOT, spec["src"])
    previews = os.path.join(ROOT, spec["previews"])
    empty(previews, (".png",))
    upload = spec.get("upload")
    if upload:
        upload = os.path.join(ROOT, upload)
        empty(upload, (".png", ".jpg", ".jpeg"))
    fdroid = spec.get("fdroid")
    if fdroid:
        fdroid = os.path.join(ROOT, fdroid)
        empty(fdroid, (".png", ".jpg", ".jpeg"))
    W, H = spec["size"]
    # Numbered files only: the Play folder also holds the feature graphic and
    # the icon, which are assets rather than panels.
    shots = sorted(f for f in os.listdir(src) if re.match(r"^\d\d_.*\.png$", f))
    if not shots:
        raise SystemExit("no screenshots in " + src)
    screens = [os.path.splitext(f)[0].split("_", 1)[1] for f in shots]
    missing = [x for x in screens if x not in CAPTIONS]
    if missing:
        raise SystemExit("no caption for " + ", ".join(missing))
    landscape = bool(spec.get("landscape"))
    hl = headline_size([caption(x, landscape)[0] for x in screens], W, H, landscape)
    for shot in shots:
        key = os.path.splitext(shot)[0]
        screen = key.split("_", 1)[1] if "_" in key else key
        if screen not in CAPTIONS:
            raise SystemExit("no caption for " + screen)
        headline, subhead = caption(screen, landscape)
        raw = os.path.join(src, shot)
        check(raw, spec["raw_size"])
        out = os.path.join(previews, shot)
        if spec.get("landscape"):
            compose_landscape(
                raw,
                out,
                W,
                H,
                headline,
                subhead,
                screen_radius_frac=spec["radius"],
                device_h_frac=spec["device_w"],
                device_x_frac=spec["device_top"],
                hl_size=hl,
            )
        else:
            compose(
                raw,
                out,
                W,
                H,
                headline,
                subhead,
                screen_radius_frac=spec["radius"],
                device_w_frac=spec["device_w"],
                device_top_frac=spec["device_top"],
                hl_size=hl,
            )
        if upload:
            jpg = os.path.join(upload, key + ".jpg")
            Image.open(out).convert("RGB").save(jpg, quality=92, subsampling=0)
        if fdroid:
            # F-Droid gets the same captioned panel as Play, under a plain
            # 1-based name because F-Droid orders by file name. It used to
            # get the raw capture, on the theory that F-Droid shows "real"
            # screenshots — which put a page of bare captures next to the
            # panels the listing had inherited, and read as two apps.
            #
            # KEEP THESE NAMES STABLE. F-Droid's server copies every file in
            # this folder into its own repo directory at build time and
            # never deletes one (fdroidserver update.py, insert_localized_
            # app_metadata: copy only, no cleanup). A renamed screenshot is a
            # second screenshot on the listing, forever, until an F-Droid
            # admin removes the old file by hand. Overwrite; do not rename.
            n = key.split("_", 1)
            slots = FDROID_SLOTS.get(os.path.basename(fdroid), [])
            i = int(n[0]) - 1
            plain = (slots[i] if i < len(slots) else "%d_%s" % (int(n[0]), n[1])) + ".png"
            Image.open(out).convert("RGB").save(os.path.join(fdroid, plain))
    went = [d for d in (spec["previews"], spec.get("upload"), spec.get("fdroid")) if d]
    print("%s: %d panels -> %s" % (spec["name"], len(shots), ", ".join(went)))




def android_assets():
    """Feature graphic and icon: Play's two non-screenshot assets, and the
    same two files F-Droid reads out of the fastlane tree."""
    from compose_wide import feature_graphic

    play = os.path.join(ROOT, "branding/store/play")
    home = os.path.join(play, "01_home.png")
    fg = os.path.join(play, "feature-graphic-1024x500.png")
    icon = os.path.join(play, "icon-512.png")
    feature_graphic(fg, home)
    images = os.path.join(ROOT, "fastlane/metadata/android/en-US/images")
    os.makedirs(images, exist_ok=True)
    # 24-bit, no alpha: Play rejects an alpha channel on the feature graphic.
    Image.open(fg).convert("RGB").save(os.path.join(images, "featureGraphic.png"))
    # 32-bit with an opaque alpha channel, which is what Play asks for.
    Image.open(icon).convert("RGBA").save(os.path.join(images, "icon.png"))
    print("Android assets: feature graphic + icon -> branding/store/play, %s" % images[len(ROOT) + 1 :])


if __name__ == "__main__":
    for spec in SETS:
        build(spec)
    android_assets()
