#!/usr/bin/env python3
"""叙事预览：批量出片前，用分镜图拼一版无声粗剪，确认故事看得懂。
每切停留分镜时长（台词更长就按台词），左上角是镜头编号，底部是这一切的台词（人名：台词），
没有台词的切显示动作说明。缺图的切用黑底文字卡代替。输出 <dir>/E0N.preview.mp4
用法：preview.py --work <作品目录> --ep 1 [--dir video]"""
import argparse, json, os, shutil, subprocess, sys, tempfile
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dzlang import load as load_project, L, T, font, wrap, speak_seconds
ap = argparse.ArgumentParser(); ap.add_argument('--work', required=True); ap.add_argument('--ep', type=int, default=1)
ap.add_argument('--dir', default='video'); a = ap.parse_args()
WORK = os.path.abspath(a.work); OUT = os.path.join(WORK, a.dir); os.makedirs(OUT, exist_ok=True)
E = f'E{a.ep:02d}'
project = load_project(WORK); PV = L()['preview']  # 字体、折行、标点按故事语言
big, small = font(46), font(34)
load = lambda n: json.load(open(os.path.join(WORK, n), encoding='utf-8'))
script, board = load('script.json'), load('storyboard.json')
name = {c['id']: c['name'] for c in project.get('characters', [])}
scenes = next(e for e in script['episodes'] if e['ep'] == a.ep)['scenes']
segs = next(e for e in board['episodes'] if e['ep'] == a.ep)['segments']

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
        said = [f"{name.get(b.get('who'), '')}{PV['inner'] if b.get('inner') else ''}{PV['colon']}{b['say']}" for b in bs if b.get('say')]
        text = PV['sep'].join(said) or PV['actOpen'] + PV['actSep'].join(b['act'] for b in bs if b.get('act'))[:80] + PV['actClose']
        sec = max(c['seconds'], sum(speak_seconds(b['say']) for b in bs if b.get('say')))
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
print(T(f'✓ 叙事预览 {len(items)} 切，约 {total:.0f} 秒 → {out}', f'✓ story preview: {len(items)} cuts, about {total:.0f}s → {out}', f'✓ 서사 미리보기 {len(items)}컷, 약 {total:.0f}초 → {out}'))
