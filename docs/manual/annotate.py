"""Позначки на скріншотах: рамка навколо елемента, номер у кружечку і
стрілка від номера до рамки. Читає shots/NAME.png + shots/NAME.json
(координати пише shoot.mjs), пише shots/a/NAME.png."""
import json, glob, os, math, subprocess
from PIL import Image, ImageDraw, ImageFont
FONT = subprocess.run(['fc-match', '-f', '%{file}', 'Inter:bold'], capture_output=True, text=True).stdout
ACC, RING, WHITE = (139, 92, 246), (196, 181, 253), (255, 255, 255)
os.makedirs('shots/a', exist_ok=True)

def place(r, W, H, R, taken, rects, gap):
    x, y, w, h = r
    cands = [(x - gap, y - gap), (x + w + gap, y - gap), (x - gap, y + h + gap), (x + w + gap, y + h + gap),
             (x + w / 2, y - gap - R), (x + w / 2, y + h + gap + R), (x - gap - R, y + h / 2), (x + w + gap + R, y + h / 2)]
    if w < 260 and h < 120:
        cands = [cands[4], (x + w / 2, y - gap - R * 3.3), cands[5]] + cands[:4] + cands[6:]
    best, bs = None, 1e18
    for i, (cx, cy) in enumerate(cands):
        cx = min(max(cx, R + 4), W - R - 4); cy = min(max(cy, R + 4), H - R - 4)
        s = i * 3
        for (tx, ty) in taken:
            d = math.hypot(cx - tx, cy - ty)
            if d < 2.6 * R: s += 1000
        for (ox, oy, ow, oh) in rects:
            if ox - R < cx < ox + ow + R and oy - R < cy < oy + oh + R: s += 200
        if s < bs: best, bs = (cx, cy), s
    return best

def edge_point(cx, cy, r):
    x, y, w, h = r
    px = min(max(cx, x), x + w); py = min(max(cy, y), y + h)
    return px, py

for js in sorted(glob.glob('shots/*.json')):
    name = os.path.basename(js)[:-5]
    info = json.load(open(js))
    im = Image.open('shots/' + name + '.png').convert('RGB')
    W, H = im.size; s = W / info['vw']
    marks = [m for m in info['marks'] if m['r']]
    if not info['marks']:
        im.save('shots/a/' + name + '.png'); continue
    if name == '18-dock':
        # Смужка нижньої панелі з номером над кожною кнопкою.
        btns = [[v * s for v in m['r']] for m in info['marks'][:-1] if m['r']]
        dx, dy, dw, dh = [v * s for v in info['marks'][-1]['r']]
        top = int(dy - 46 * s)
        crop = im.crop((int(dx - 10 * s), top, int(dx + dw + 10 * s), int(dy + dh + 8 * s)))
        d = ImageDraw.Draw(crop); d.rectangle([0, 0, crop.size[0], int(40 * s)], fill=(16, 16, 22)); R = int(11 * s); font = ImageFont.truetype(FONT, int(12 * s))
        ox, oy = int(dx - 10 * s), top
        for i, (x, y, w, h) in enumerate(btns):
            cx, cy = x + w / 2 - ox, 22 * s
            d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=ACC)
            t = str(i + 1); tw = d.textlength(t, font=font)
            d.text((cx - tw / 2, cy - int(12 * s) * 0.62), t, font=font, fill=WHITE)
        crop.save('shots/a/' + name + '.png'); print('ok dock'); continue
    M = 0
    if info.get('clip'):
        # Збільшений фрагмент: поля навколо, щоб номерам було де стати.
        M = int(70 * s)
        big = Image.new('RGB', (W + 2 * M, H + 2 * M), (12, 12, 17)); big.paste(im, (M, M)); im = big; W, H = im.size
    d = ImageDraw.Draw(im, 'RGBA')
    R = int(15 * s); gap = int(22 * s); lw = max(2, int(2.2 * s))
    font = ImageFont.truetype(FONT, int(16 * s))
    rects = [[m['r'][0] * s + M, m['r'][1] * s + M, m['r'][2] * s, m['r'][3] * s] for m in marks]
    pad = 4 * s
    rects = [(x - pad, y - pad, w + 2 * pad, h + 2 * pad) for x, y, w, h in rects]
    taken = []
    for (x, y, w, h) in rects:
        d.rounded_rectangle([x, y, x + w, y + h], radius=int(7 * s), outline=RING + (255,), width=lw)
        d.rounded_rectangle([x, y, x + w, y + h], radius=int(7 * s), fill=ACC + (28,))
    for i, m in enumerate(info['marks']):
        if not m['r']: continue
        r = rects[marks.index(m)]
        cx, cy = place(r, W, H, R, taken, [q for q in rects if q is not r], gap)
        taken.append((cx, cy))
        ex, ey = edge_point(cx, cy, r)
        dist = math.hypot(ex - cx, ey - cy)
        if dist > R + 4:
            ux, uy = (ex - cx) / dist, (ey - cy) / dist
            sx, sy = cx + ux * R, cy + uy * R
            d.line([sx, sy, ex - ux * 2, ey - uy * 2], fill=RING, width=lw)
            ah = 9 * s; aw = 5 * s
            bx, by = ex - ux * ah, ey - uy * ah
            d.polygon([(ex, ey), (bx - uy * aw, by + ux * aw), (bx + uy * aw, by - ux * aw)], fill=RING)
        d.ellipse([cx - R - 3 * s, cy - R - 3 * s, cx + R + 3 * s, cy + R + 3 * s], fill=(255, 255, 255, 230))
        d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=ACC)
        t = str(i + 1)
        tw = d.textlength(t, font=font)
        d.text((cx - tw / 2, cy - int(16 * s) * 0.62), t, font=font, fill=WHITE)
    im.save('shots/a/' + name + '.png', optimize=True)
    print('ok', name, len(marks))
