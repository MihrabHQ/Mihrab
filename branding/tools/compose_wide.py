import sys, math
sys.path.insert(0,"branding/tools")
from PIL import Image, ImageDraw, ImageFilter
from compose import gradient_bg, rub_star, round_image, _font, ROUND_FONT, TEXT_FONT, ICON_PATH, CREAM, DESCRIPTOR

# branding/IDENTITY.md: the headline, the tagline, and the pillars in order.
HEADLINE = "For every prayer, and everything between."
TAGLINE = "Calm, private, offline-first."
PILLARS = "Prayer times · the Quran · Tilawah · Dua · Dhikr"

def device(shot_path, height, radius_frac=0.062):
    shot=Image.open(shot_path).convert("RGB")
    w=int(height*shot.width/shot.height)
    shot=shot.resize((w,height), Image.LANCZOS)
    rad=int(w*radius_frac)
    rr=round_image(shot,rad)
    frame=Image.new("RGBA",(w,height),(0,0,0,0))
    ImageDraw.Draw(frame).rounded_rectangle([0,0,w-1,height-1],radius=rad,outline=(238,228,212,90),width=max(2,int(w*0.006)))
    rr.alpha_composite(frame)
    return rr

def paste_with_shadow(canvas, dev, x, y, blur, sh_alpha=130):
    sh=Image.new("RGBA",canvas.size,(0,0,0,0))
    m=Image.new("L",dev.size,0)
    ImageDraw.Draw(m).rounded_rectangle([0,0,dev.size[0],dev.size[1]],radius=int(dev.size[0]*0.062),fill=sh_alpha)
    sh.paste(Image.new("RGBA",dev.size,(0,0,0,255)),(x,y+int(canvas.size[1]*0.012)),m)
    sh=sh.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(sh)
    canvas.alpha_composite(dev,(x,y))

def feature_graphic(out, home, W=1024,H=500, SS=3):
    # Drawn at SS× and reduced once with Lanczos: at 1024×500 a phone scaled
    # straight down and then rotated came out soft, and so did the type.
    # `home` is the night Today screen (and-home-night.png) — the moon and
    # stars over the countdown are the app's face in the dark band Play
    # crops to.
    OW,OH=W,H; W,H=W*SS,H*SS
    c=gradient_bg(W,H).convert("RGBA")
    c.alpha_composite(rub_star(int(W*0.5),CREAM,16),(int(W*0.60),int(H*0.35)))
    c.alpha_composite(rub_star(int(W*0.22),CREAM,20),(int(-W*0.05),int(-H*0.15)))
    d=ImageDraw.Draw(c)
    mx=int(W*0.06); iy=int(H*0.20); isz=int(H*0.20)
    icon=round_image(Image.open(ICON_PATH).convert("RGBA").resize((isz,isz), Image.LANCZOS),int(isz*0.24))
    c.alpha_composite(icon,(mx,iy))
    tx=mx+isz+int(W*0.02)
    d.text((tx, iy-isz*0.06), "Mihrab", font=_font(ROUND_FONT,int(H*0.15),"Bold"), fill=CREAM)
    d.text((tx, iy+isz*0.73), DESCRIPTOR, font=_font(TEXT_FONT,int(H*0.050),"Medium"), fill=(238,228,212,200))
    d.text((mx, iy+isz+int(H*0.07)), "For every prayer,", font=_font(ROUND_FONT,int(H*0.072),"Bold"), fill=CREAM)
    d.text((mx, iy+isz+int(H*0.16)), "and everything between.", font=_font(ROUND_FONT,int(H*0.072),"Bold"), fill=CREAM)
    d.text((mx, iy+isz+int(H*0.285)), TAGLINE, font=_font(TEXT_FONT,int(H*0.046),"Medium"), fill=(238,228,212,200))
    # One phone on the right, bleeding off top/bottom. Barely tilted: at 8
    # degrees the prayer rows fell far enough across the width that each time
    # lined up with the NEXT prayer's name, and a graphic whose whole subject
    # is prayer times cannot afford to look like it has them wrong.
    dev=device(home, int(H*1.28))
    dev=dev.rotate(-2.5, expand=True, resample=Image.BICUBIC)
    paste_with_shadow(c, dev, int(W*0.66), int(H*0.06), int(W*0.02))
    c.convert("RGB").resize((OW,OH), Image.LANCZOS).save(out); print("wrote",out,(OW,OH))

def hero(out, home, quran, duas, W=1600,H=900, xs=(0.52,0.70,0.88), ts=1.0, dh_frac=0.86):
    c=gradient_bg(W,H).convert("RGBA")
    c.alpha_composite(rub_star(int(W*0.42),CREAM,14),(int(W*0.60),int(H*0.30)))
    c.alpha_composite(rub_star(int(W*0.16),CREAM,20),(int(-W*0.03),int(-H*0.10)))
    d=ImageDraw.Draw(c)
    mx=int(W*0.055); iy=int(H*0.10); isz=int(H*0.115)
    icon=round_image(Image.open(ICON_PATH).convert("RGBA").resize((isz,isz)),int(isz*0.24))
    c.alpha_composite(icon,(mx,iy))
    # Wordmark and descriptor share the icon's height: the name in its
    # upper part, the descriptor under it, both clear of each other.
    tx = mx+isz+int(W*0.018)
    d.text((tx, iy-isz*0.10), "Mihrab", font=_font(ROUND_FONT,int(H*0.092),"Bold"), fill=CREAM)
    d.text((tx, iy+isz*0.70), DESCRIPTOR, font=_font(TEXT_FONT,int(H*0.034*ts),"Medium"), fill=(238,228,212,200))
    d.text((mx, iy+isz+int(H*0.10)), "For every prayer,", font=_font(ROUND_FONT,int(H*0.058*ts),"Semibold"), fill=CREAM)
    d.text((mx, iy+isz+int(H*0.175)), "and everything between.", font=_font(ROUND_FONT,int(H*0.058*ts),"Semibold"), fill=CREAM)
    d.text((mx, iy+isz+int(H*0.265)), TAGLINE, font=_font(TEXT_FONT,int(H*0.040*ts),"Medium"), fill=(238,228,212,205))
    d.text((mx, iy+isz+int(H*0.325)), PILLARS, font=_font(TEXT_FONT,int(H*0.034*ts),"Medium"), fill=(238,228,212,170))
    # three devices, staggered, right/bottom
    dh=int(H*dh_frac)
    dv_home=device(home,dh); dv_q=device(quran,int(dh*0.94)); dv_d=device(duas,int(dh*0.88))
    baseY=int(H*0.20)
    paste_with_shadow(c, dv_d, int(W*xs[2]), baseY+int(H*0.10), int(W*0.014))
    paste_with_shadow(c, dv_q, int(W*xs[1]), baseY+int(H*0.05), int(W*0.014))
    paste_with_shadow(c, dv_home, int(W*xs[0]), baseY, int(W*0.014))
    c.convert("RGB").save(out); print("wrote",out,(W,H))

if __name__=="__main__":
    import sys
    IOS="branding/screenshots-source/Simulator Screenshot - iPhone 17 Pro Max - 2026-05-06 at %s.png"
    home=IOS%"07.59.39"; quran=IOS%"08.05.11"; duas=IOS%"07.59.52"
    feature_graphic("branding/store/play/feature-graphic-1024x500.png", home)
    hero("branding/store/github-hero.png", home, quran, duas)
    # play icon 512
    from PIL import Image
    Image.open(ICON_PATH).convert("RGB").resize((512,512), Image.LANCZOS).save("branding/store/play/icon-512.png")
    print("icon 512 done")
