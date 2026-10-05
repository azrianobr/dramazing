#!/usr/bin/env python3
"""叙事预览：批量出片前，用分镜图拼一版无声粗剪，确认故事看得懂。
每切停留分镜时长（台词更长就按台词），左上角是镜头编号，底部是这一切的台词（人名：台词），
没有台词的切显示动作说明。缺图的切用黑底文字卡代替。输出 <dir>/E0N.preview.mp4
用法：preview.py --work <作品目录> --ep 1 [--dir video]"""
import argparse, json, os, re, shutil, subprocess, tempfile
from PIL import Image, ImageDraw, ImageFont
ap = argparse.ArgumentParser(); ap.add_argument('--work', required=True); ap.add_argument('--ep', type=int, default=1)
ap.add_argument('--dir', default='video'); a = ap.parse_args()
WORK = os.path.abspath(a.work); OUT = os.path.join(WORK, a.dir); os.makedirs(OUT, exist_ok=True)
E = f'E{a.ep:02d}'
FONT = os.environ.get('SUB_FONT', '/System/Library/Fonts/STHeiti Medium.ttc')
big, small = ImageFont.truetype(FONT, 46), ImageFont.truetype(FONT, 34)
load = lambda n: json.load(open(os.path.join(WORK, n), encoding='utf-8'))
project, script, board = load('project.json'), load('script.json'), load('storyboard.json')
name = {c['id']: c['name'] for c in project.get('characters', [])}
scenes = next(e for e in script['episodes'] if e['ep'] == a.ep)['scenes']
segs = next(e for e in board['episodes'] if e['ep'] == a.ep)['segments']
chars = lambda t: len(re.sub(r'[^\w]', '', t, flags=re.U))

def wrap(d, text, font, width):
    lines, cur = [], ''
    for ch in text:
        if d.textlength(cur + ch, font=font) > width: lines.append(cur); cur = ch
        else: cur += ch
    return lines + [cur] if cur else lines

def card(path, img, label, text):
    im = Image.open(img).convert('RGB').resize((1920, 1080)) if img and os.path.exists(img) else Image.new('RGB', (1920, 1080), (20, 20, 20))
    d = ImageDraw.Draw(im, 'RGBA')
    d.rounded_rectangle((30, 30, 250, 110), 14, fill=(0, 0, 0, 160)); d.text((140, 70), label, font=big, fill=(255, 230, 80), anchor='mm')
    rows = wrap(d, text, small, 1700)[:4]
    if rows:
        h = 50 * len(rows) + 30; d.rectangle((0, 1080 - h, 1920, 1080), fill=(0, 0, 0, 170))
        for i, r in enumerate(rows): d.text((960, 1080 - h + 40 + 50 * i), r, font=small, fill='white', anchor='mm')
    im.save(path)

tmp = tempfile.mkdtemp(); items, total = [], 0.0
for seg in segs:
    beats = scenes[seg['scene'] - 1]['beats']
    for i, c in enumerate(seg['cuts']):
        bs = beats[c['beats'][0] - 1:c['beats'][1]]
        said = [f"{name.get(b.get('who'), '')}{'（心声）' if b.get('inner') else ''}：{b['say']}" for b in bs if b.get('say')]
        text = '　'.join(said) or '［' + '；'.join(b['act'] for b in bs if b.get('act'))[:80] + '］'
        sec = max(c['seconds'], sum(chars(b['say']) / 3 + 1 for b in bs if b.get('say')))
        label = f"{seg['id'][-2:]}-{i + 1}"; p = f'{tmp}/{len(items):03d}.png'
        card(p, os.path.join(WORK, 'frames', seg['id'], f'f{i + 1}.png'), label, text)
        items.append((p, round(sec, 2))); total += sec
lst = f'{tmp}/list.txt'
with open(lst, 'w') as f:
    for p, s in items: f.write(f"file '{p}'\nduration {s}\n")
    f.write(f"file '{items[-1][0]}'\n")  # concat 要求最后一张再写一次，否则最后一切的时长被忽略
out = os.path.join(OUT, f'{E}.preview.mp4')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-vf', 'fps=24,format=yuv420p',
                '-c:v', 'libx264', '-crf', '23', '-movflags', '+faststart', out], check=True)
shutil.rmtree(tmp)
print(f'✓ 叙事预览 {len(items)} 切，约 {total:.0f} 秒 → {out}')
