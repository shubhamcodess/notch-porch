#!/usr/bin/env python3
"""Generates docs/banner.gif: the README title card.
Needs Pillow and ffmpeg, and macOS (uses the system SF Pro font).  Run from the repo root:  python3 scripts/make-banner.py
"""
import math, os, random, shutil, subprocess, tempfile
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1280, 400
FPS = 12
TITLE, SUB = 'Notch Porch', 'A widget dock that lives in your MacBook’s notch.'
SF = '/System/Library/Fonts/SFNS.ttf'          # variable: [width, optical size, grade, weight]
INK, MUTED, ACCENT = (29, 29, 31), (99, 107, 122), (255, 55, 95)
CELL = 16

def font(size, weight, opsz):
    f = ImageFont.truetype(SF, size)
    f.set_variation_by_axes([100, opsz, 400, weight])
    return f

def lerp(a, b, t): return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

def gradient():
    """soft macOS-style light blue and white, diagonal, with a white bloom under the notch"""
    stops = [(0.0, (205, 226, 255)), (0.5, (250, 252, 255)), (1.0, (178, 208, 255))]
    gw, gh = 160, 50
    small = Image.new('RGB', (gw, gh))
    px = small.load()
    for y in range(gh):
        for x in range(gw):
            t = (x / gw * 0.78 + y / gh * 0.22)
            for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
                if t0 <= t <= t1:
                    px[x, y] = lerp(c0, c1, (t - t0) / (t1 - t0)); break
    img = small.resize((W, H), Image.BICUBIC)
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse((W / 2 - 420, -260, W / 2 + 420, 200), fill=150)
    glow = glow.filter(ImageFilter.GaussianBlur(70))
    return Image.composite(Image.new('RGB', (W, H), (255, 255, 255)), img, glow)

BASE = gradient()
cols, rows = W // CELL, H // CELL
PIX_ROWS = 5                                   # the bottom 5 rows dissolve into pixels
rnd = random.Random(7)
cells = {(c, r): rnd.random() for r in range(rows - PIX_ROWS, rows) for c in range(cols)}

def pixel_layer(img, frame):
    out = img.copy()
    d = ImageDraw.Draw(out)
    small = img.resize((cols, rows), Image.BOX)
    for (c, r), v in cells.items():
        depth = (r - (rows - PIX_ROWS)) / (PIX_ROWS - 1)           # 0 at the top of the band, 1 at the very bottom
        wob = (math.sin(frame * 0.22 + c * 0.9 + r * 1.7) + 1) / 2   # slow shimmer
        if v > 0.12 + 0.82 * depth: continue                         # sparser further up
        base = small.getpixel((c, r))
        tint = (58, 125, 255) if (c * 7 + r * 3) % 5 else (255, 255, 255)
        amount = 0.10 + 0.34 * depth * (0.55 + 0.45 * wob)
        d.rectangle((c * CELL, r * CELL, c * CELL + CELL - 1, r * CELL + CELL - 1), fill=lerp(base, tint, amount))
    return out

def ease(t): t = max(0.0, min(1.0, t)); return 1 - (1 - t) ** 3

f_title, f_sub = font(104, 720, 96), font(30, 400, 28)

def draw_frame(i, intro, hold, outro):
    img = pixel_layer(BASE, i)
    fade = 1.0
    if i >= intro + hold: fade = 1 - (i - intro - hold) / outro
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # the notch, hanging from the top edge, with the collapsed-state items beside it
    cx = W / 2
    d.rounded_rectangle((cx - 130, -30, cx + 130, 36), radius=18, fill=(0, 0, 0, 255))
    d.ellipse((cx - 130 - 40, 10, cx - 130 - 18, 32), fill=ACCENT + (255,))
    rng = random.Random(i // 2)
    for k in range(4):
        h = 6 + rng.randint(0, 14)
        x = cx + 130 + 20 + k * 6
        d.rounded_rectangle((x, 32 - h, x + 3, 32), radius=1, fill=ACCENT + (255,))
    # title, letter by letter
    tw = f_title.getlength(TITLE)
    x = cx - tw / 2
    base_y = 124
    for n, ch in enumerate(TITLE):
        t = ease((i - 2 - n * 0.9) / 7)
        a = int(255 * t * fade)
        if a > 0:
            y = base_y + (1 - t) * 18
            d.text((x, y + 2), ch, font=f_title, fill=(255, 255, 255, int(a * 0.8)))
            d.text((x, y), ch, font=f_title, fill=INK + (a,))
        x += f_title.getlength(ch)
    ts = ease((i - 12) / 9)
    if ts > 0:
        a = int(255 * ts * fade)
        sw = f_sub.getlength(SUB)
        d.text((cx - sw / 2, 252 + (1 - ts) * 10), SUB, font=f_sub, fill=MUTED + (a,))
    out = img.convert('RGBA')
    out.alpha_composite(layer)
    return out.convert('RGB')

def main():
    intro, hold, outro = 22, 48, 5
    total = intro + hold + outro
    tmp = tempfile.mkdtemp()
    for i in range(total):
        draw_frame(i, intro, hold, outro).save(os.path.join(tmp, f'f{i:03d}.png'))
    pal, out = os.path.join(tmp, 'pal.png'), os.path.join('docs', 'banner.gif')
    src = ['-framerate', str(FPS), '-i', os.path.join(tmp, 'f%03d.png')]
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *src, '-vf', 'palettegen=max_colors=128:stats_mode=full', pal], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *src, '-i', pal, '-lavfi', 'paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle', out], check=True)
    shutil.rmtree(tmp)
    print('wrote', out, round(os.path.getsize(out) / 1024), 'KB')

if __name__ == '__main__':
    main()
