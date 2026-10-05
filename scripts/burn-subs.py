#!/usr/bin/env python3
"""硬字幕成片：本机 ffmpeg 没编 libass/drawtext，用 PIL 把每句字幕画成透明 PNG，按时间叠到画面底部。
输入 assemble 出的 E0N.mp4 + E0N.srt，输出 E0N.final.mp4（发微信 / 抖音这类不显示外挂字幕的地方用它）
用法：burn-subs.py --work <作品目录> --ep 1 [--dir video]"""
import argparse, os, shutil, subprocess, sys, tempfile
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dzlang import load, L, T, font as subfont, wrap
ap = argparse.ArgumentParser(); ap.add_argument('--work', required=True); ap.add_argument('--ep', type=int, default=1)
ap.add_argument('--dir', default='video'); a = ap.parse_args()
load(os.path.abspath(a.work)); W = os.path.join(os.path.abspath(a.work), a.dir); E = f'E{a.ep:02d}'
font = subfont(54)  # 字体按故事语言（lang/langs.json），SUB_FONT 可覆盖
JOIN = '' if L()['wrap'] == 'char' else ' '  # 字幕文件里一句分成几行时，中文直接接上，英文、韩文用空格
LINE = 66  # 折行后每行的行高

def sec(x):
    h, m, r = x.split(':'); s, ms = r.split(','); return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000

cues = []
for b in open(f'{W}/{E}.srt', encoding='utf-8').read().strip().split('\n\n'):
    l = b.split('\n'); s, e = l[1].split(' --> '); cues.append((sec(s), sec(e), JOIN.join(l[2:])))
tmp = tempfile.mkdtemp()
ins, fc, prev = ['-i', f'{W}/{E}.mp4'], '', '0:v'
for i, (s, e, txt) in enumerate(cues):
    # 一行放不下（多是英文）就按词折行，往上长，最后一行的位置不变
    rows = wrap(ImageDraw.Draw(Image.new('RGBA', (1, 1))), txt, font, 1760) or ['']; up = LINE * (len(rows) - 1)
    im = Image.new('RGBA', (1920, 140 + up), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for k, r in enumerate(rows): d.text((960, 70 + LINE * k), r, font=font, fill='white', anchor='mm', stroke_width=4, stroke_fill='black')
    p = f'{tmp}/{i}.png'; im.save(p); ins += ['-i', p]
    fc += f"[{prev}][{i + 1}:v]overlay=0:H-{200 + up}:enable='between(t,{s},{e})'[v{i}];"; prev = f'v{i}'
subprocess.run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', fc.rstrip(';'), '-map', f'[{prev}]', '-map', '0:a',
                '-c:v', 'libx264', '-crf', '16', '-preset', os.environ.get('X264_PRESET', 'slow'), '-c:a', 'copy', '-movflags', '+faststart', f'{W}/{E}.final.mp4'], check=True)
shutil.rmtree(tmp)
print(T(f'✓ 硬字幕 {len(cues)} 句 → {W}/{E}.final.mp4', f'✓ burned {len(cues)} subtitles → {W}/{E}.final.mp4', f'✓ 자막 {len(cues)}줄 입힘 → {W}/{E}.final.mp4'))
