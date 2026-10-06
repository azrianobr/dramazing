#!/usr/bin/env python3
"""叙事预览：批量出片前，用分镜图拼一版无声粗剪，确认故事看得懂。
每切停留分镜时长（台词更长就按台词），左上角是镜头编号，底部是这一切的台词（人名：台词），
没有台词的切显示动作说明。缺图的切用黑底文字卡代替。画布按 project.json 的 aspect（不写是 16:9）。
插入镜头（cut.insert）取素材中间那一帧，按 insert.fit 放进画布；素材还没有时同样用文字卡。输出 <dir>/E0N.preview.mp4
用法：preview.py --work <作品目录> --ep 1 [--dir video]"""
import argparse, json, os, shutil, subprocess, sys, tempfile
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dzlang import load as load_project, L, T, font, wrap, speak_seconds, canvas, insert_of, title_of, title_image, fit_image, IMAGE_EXT
ap = argparse.ArgumentParser(); ap.add_argument('--work', required=True); ap.add_argument('--ep', type=int, default=1)
ap.add_argument('--dir', default='video'); a = ap.parse_args()
WORK = os.path.abspath(a.work); OUT = os.path.join(WORK, a.dir); os.makedirs(OUT, exist_ok=True)
E = f'E{a.ep:02d}'
project = load_project(WORK); PV = L()['preview']  # 字体、折行、标点按故事语言
CW, CH = canvas()
big, small = font(46), font(34)
load = lambda n: json.load(open(os.path.join(WORK, n), encoding='utf-8'))
script, board = load('script.json'), load('storyboard.json')
name = {c['id']: c['name'] for c in project.get('characters', [])}
scenes = next(e for e in script['episodes'] if e['ep'] == a.ep)['scenes']
segs = next(e for e in board['episodes'] if e['ep'] == a.ep)['segments']

def still(src, at):
    """视频素材取第 at 秒的一帧，图片素材原样打开"""
    if src.lower().endswith(IMAGE_EXT): return Image.open(src)
    p = f'{tmp}/grab.png'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(at), '-i', src, '-frames:v', '1', p], check=True)
    return Image.open(p)


def card(path, im, label, text):
    im = im if im is not None else Image.new('RGB', (CW, CH), (20, 20, 20))
    d = ImageDraw.Draw(im, 'RGBA')
    d.rounded_rectangle((30, 30, 250, 110), 14, fill=(0, 0, 0, 160)); d.text((140, 70), label, font=big, fill=(255, 230, 80), anchor='mm')
    rows = wrap(d, text, small, CW - 220)[:4]
    if rows:
        h = 50 * len(rows) + 30; d.rectangle((0, CH - h, CW, CH), fill=(0, 0, 0, 170))
        for i, r in enumerate(rows): d.text((CW // 2, CH - h + 40 + 50 * i), r, font=small, fill='white', anchor='mm')
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
        ins = insert_of(c)
        src = os.path.join(WORK, ins['file']) if ins else os.path.join(WORK, 'frames', seg['id'], f'f{i + 1}.png')
        im = fit_image(still(src, c['seconds'] / 2), CW, CH, ins['fit'] if ins else 'crop') if os.path.exists(src) else None
        tt = title_of(c)
        if tt:  # 花字照剪辑的样子画上去，预览里就能看到名字卡的位置
            im = (im if im is not None else Image.new('RGB', (CW, CH), (20, 20, 20))).convert('RGBA')
            im.alpha_composite(title_image(tt, CW, CH)); im = im.convert('RGB')
        card(p, im, label, text)
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
