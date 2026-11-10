"""アプリアイコン（一般的な駐車場の「P」マーク: 青地に白の P）を作る。

    python -I tools/make_icons.py public/icons
"""
import sys

from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]
BLUE = (21, 101, 192, 255)
WHITE = (255, 255, 255, 255)


def make(size, path):
    img = Image.new("RGBA", (size, size), BLUE)
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", int(size * 0.72))
    except OSError:
        font = ImageFont.load_default()
    d.text((size / 2, size / 2), "P", font=font, fill=WHITE, anchor="mm")
    img.save(path)


make(192, f"{OUT}/icon-192.png")
make(512, f"{OUT}/icon-512.png")
print("ok")
