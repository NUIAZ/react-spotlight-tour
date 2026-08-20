"""
scripts/make-gif.py: assembles docs/tour.gif from docs/tour-frames/*.png.

Frames are one per tour step (captured by screenshots.mjs). Each frame holds
for 1.6 seconds, which reads as "a person clicking Next", and the GIF loops.
Downscaled to 900px wide to keep the file friendly for a README and a
LinkedIn upload. Requires Pillow: python scripts/make-gif.py
"""
from PIL import Image
import glob, os

HERE = os.path.dirname(os.path.abspath(__file__))
frames_dir = os.path.join(HERE, '..', 'docs', 'tour-frames')
out = os.path.join(HERE, '..', 'docs', 'tour.gif')
files = sorted(glob.glob(os.path.join(frames_dir, 'f*.png')))
if not files:
    raise SystemExit('no frames; run scripts/screenshots.mjs first')
W = 900
imgs = []
for f in files:
    im = Image.open(f).convert('RGB')
    h = round(im.height * W / im.width)
    imgs.append(im.resize((W, h), Image.LANCZOS))
imgs[0].save(out, save_all=True, append_images=imgs[1:], duration=1600, loop=0, optimize=True)
print('wrote', out, f'({os.path.getsize(out)//1024} KB, {len(imgs)} frames)')
