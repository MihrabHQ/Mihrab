#!/usr/bin/env python3
"""Check every store asset against the rule the store actually enforces.

Written because a whole Play set shipped at 1320x2868 — a ratio of 2.17,
where Play's limit is 2.00 — and nothing in the repo said so. Run it after
`branding/tools/panels/build.mjs` and `publish.py`, before uploading anything:

    python3 branding/tools/verify_store.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

from PIL import Image  # noqa: E402

problems = []
checked = 0


def files(rel, exts=(".png", ".jpg")):
    path = os.path.join(ROOT, rel)
    if not os.path.isdir(path):
        problems.append("%s does not exist" % rel)
        return []
    return [
        os.path.join(path, f)
        for f in sorted(os.listdir(path))
        if f.lower().endswith(exts) and not f.startswith(".")
    ]


def folder(rel, size, mode="RGB", count=None, exts=(".png", ".jpg")):
    """Every image in `rel` must be exactly `size` and exactly `mode`.

    `mode` may be a tuple. A palette PNG ("P", what pngquant writes for
    F-Droid) passes only when it carries no transparency: no store takes
    alpha in a screenshot."""
    global checked
    fs = files(rel, exts)
    if count and not (count[0] <= len(fs) <= count[1]):
        problems.append("%s holds %d files, wanted %d-%d" % (rel, len(fs), count[0], count[1]))
    for f in fs:
        checked += 1
        im = Image.open(f)
        name = os.path.relpath(f, ROOT)
        if im.size != size:
            problems.append("%s is %dx%d, wanted %dx%d" % ((name,) + im.size + size))
        modes = mode if isinstance(mode, tuple) else (mode,)
        if im.mode not in modes:
            problems.append("%s is %s, wanted %s" % (name, im.mode, "/".join(modes)))
        if im.mode == "P" and "transparency" in im.info:
            problems.append("%s is a palette PNG with transparency" % name)


def play_ratio(rel, limit=2.0, exts=(".png", ".jpg")):
    """Play: the long side may not exceed `limit` times the short side."""
    for f in files(rel, exts):
        w, h = Image.open(f).size
        r = max(w, h) / min(w, h)
        if r > limit + 1e-6:
            problems.append(
                "%s is %dx%d — ratio %.3f, Play allows at most %.2f"
                % (os.path.relpath(f, ROOT), w, h, r, limit)
            )


def exact_ratio(rel, ratio, exts=(".png", ".jpg")):
    """Play tablets: 16:9 landscape or 9:16 portrait, nothing between."""
    for f in files(rel, exts):
        w, h = Image.open(f).size
        r = max(w, h) / min(w, h)
        if abs(r - ratio) > 0.005:
            problems.append(
                "%s is %dx%d — ratio %.3f, Play wants %.3f for tablets"
                % (os.path.relpath(f, ROOT), w, h, r, ratio)
            )
        if min(w, h) < 1080:
            problems.append("%s short side is %d, Play's tablet floor is 1080" % (os.path.relpath(f, ROOT), min(w, h)))


# The store panels (branding/tools/panels), English; every language is the
# same size, so English stands for all thirteen.
SP = "branding/store-panels/"

# ---- Apple: 6.9" iPhone and 13" iPad are the two required slots; Mac ----
folder(SP + "appstore-iphone/en", (1320, 2868), count=(3, 10), exts=(".png",))
folder("fastlane/screenshots/ios/6.9", (1320, 2868), count=(3, 10), exts=(".jpg",))
# The iPad panels are landscape: App Store Connect takes 2752x2064 as well
# as 2064x2752 for the 13-inch slot.
folder(SP + "appstore-ipad/en", (2752, 2064), count=(3, 10), exts=(".png",))
folder("fastlane/screenshots/ipad/13", (2752, 2064), count=(3, 10), exts=(".jpg",))
folder(SP + "appstore-mac/en", (2880, 1800), count=(1, 10), exts=(".png",))
folder("fastlane/screenshots/mac", (2880, 1800), count=(1, 10), exts=(".jpg",))

# ---- Play: eight phones at most, tablets and Chromebooks 16:9 ----
folder(SP + "play-phone/en", (1080, 1920), count=(2, 8), exts=(".png",))
play_ratio(SP + "play-phone/en", 2.0)
for s in ("play-tablet", "play-chromebook"):
    folder(SP + s + "/en", (2560, 1440), count=(4, 8), exts=(".png",))
    exact_ratio(SP + s + "/en", 16 / 9)

# ---- Microsoft Store: 16:9, up to ten ----
folder(SP + "msstore/en", (3840, 2160), count=(1, 10), exts=(".png",))

for rel, size, mode in (
    ("branding/store/play/feature-graphic-1024x500.png", (1024, 500), "RGB"),
    ("branding/store/play/icon-512.png", (512, 512), "RGBA"),
    ("fastlane/metadata/android/en-US/images/featureGraphic.png", (1024, 500), "RGB"),
    ("fastlane/metadata/android/en-US/images/icon.png", (512, 512), "RGBA"),
):
    p = os.path.join(ROOT, rel)
    if not os.path.isfile(p):
        problems.append("%s is missing" % rel)
        continue
    checked += 1
    im = Image.open(p)
    if im.size != size:
        problems.append("%s is %dx%d, wanted %dx%d" % ((rel,) + im.size + size))
    if im.mode != mode:
        problems.append("%s is %s, wanted %s" % (rel, im.mode, mode))

# ---- F-Droid: the same captioned panels as Play, no alpha ----
# The panel sizes, not the raw capture sizes. F-Droid has no cap of eight,
# so the phone folder carries a ninth (the every-device panel). Names in
# these folders must stay stable — see the note in panels/publish.py.
folder("fastlane/metadata/android/en-US/images/phoneScreenshots", (1080, 1920), mode=("RGB", "P"), count=(2, 9), exts=(".png",))
play_ratio("fastlane/metadata/android/en-US/images/phoneScreenshots", 2.0)
folder("fastlane/metadata/android/en-US/images/tenInchScreenshots", (2560, 1440), mode=("RGB", "P"), count=(2, 8), exts=(".png",))

if problems:
    print("%d problem(s) across %d files:\n" % (len(problems), checked))
    for p in problems:
        print("  - " + p)
    sys.exit(1)
print("ALL STORE ASSETS PASS (%d files)" % checked)
