"""The "GET IT FROM Microsoft Store" badge, drawn to match the others.

Microsoft's own badge is a dark grey pill with a faint edge and lighter type,
so beside the Play, F-Droid, GitHub and Obtainium buttons it read as a
different family. This redraws it in theirs: black fill, the same grey edge,
the same 564x168 box, "GET IT FROM" over the store's name in the same faces.
The Store's bag is lifted from Microsoft's badge (kept as
`branding/badges/source/microsoft-official.png`) so the mark itself is theirs.

    python3 branding/tools/microsoft_badge.py
"""
import sys

sys.path.insert(0, "branding/tools")

from PIL import Image, ImageDraw  # noqa: E402

from compose import ROUND_FONT, TEXT_FONT, _font  # noqa: E402

W, H = 564, 168
BORDER = (166, 166, 166)
SOURCE = "branding/badges/source/microsoft-official.png"
# The official badge's fill, which is knocked out around the bag.
SOURCE_BG = (32, 32, 32)


def _bag():
    """The Store bag from the official badge, its grey background made clear."""
    src = Image.open(SOURCE).convert("RGBA").crop((30, 38, 120, 126))
    px = src.load()
    for y in range(src.height):
        for x in range(src.width):
            r, g, b, a = px[x, y]
            # How far from the old fill: 0 is background, 24+ is the bag.
            d = max(abs(r - SOURCE_BG[0]), abs(g - SOURCE_BG[1]), abs(b - SOURCE_BG[2]))
            if d < 24:
                px[x, y] = (r, g, b, round(a * d / 24))
    bbox = src.getbbox()
    return src.crop(bbox)


def build(out="branding/badges/microsoft.png"):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(
        [2, 2, W - 3, H - 3], radius=20, fill=(0, 0, 0, 255), outline=BORDER, width=3
    )

    bag = _bag()
    size = 100
    bag = bag.resize((round(bag.width * size / bag.height), size), Image.LANCZOS)
    img.alpha_composite(bag, (32, (H - size) // 2))

    x = 32 + bag.width + 22
    room = W - 24 - x
    d.text((x, 34), "GET IT FROM", font=_font(TEXT_FONT, 31, "Semibold"), fill=(255, 255, 255))
    name = "Microsoft Store"
    size = 62
    while size > 30 and d.textlength(name, font=_font(ROUND_FONT, size, "Medium")) > room:
        size -= 1
    font = _font(ROUND_FONT, size, "Medium")
    # Sit the name's baseline where the others' sits, whatever size it fit at.
    d.text((x - 2, 130), name, font=font, fill=(255, 255, 255), anchor="ls")

    img.save(out)
    print("wrote", out, img.size, "name at", size)


if __name__ == "__main__":
    build()
