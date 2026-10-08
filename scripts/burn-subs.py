#!/usr/bin/env python3
"""硬字幕成片：本机 ffmpeg 没编 libass/drawtext，用 PIL 把每句字幕画成透明 PNG，按时间叠到画面底部。
输入 assemble 出的 E0N.mp4 + E0N.srt，输出 E0N.final.mp4（发微信 / 抖音这类不显示外挂字幕的地方用它）
用法：burn-subs.py --work <作品目录> --ep 1 [--dir video]"""
import argparse, os, shutil, subprocess, sys, tempfile
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dzlang import load, L, T, font as subfont, wrap, canvas
ap = argparse.ArgumentParser(); ap.add_argument('--work', required=True); ap.add_argument('--ep', type=int, default=1)
ap.add_argument('--dir', default='video'); a = ap.parse_args()
P = load(os.path.abspath(a.work)); W = os.path.join(os.path.abspath(a.work), a.dir); E = f'E{a.ep:02d}'
CW, CH = canvas()
# 字幕离底边多远：横屏 200 像素；竖屏放在下方五分之一处，让开短视频平台底部的标题、按钮
BOTTOM = 200 if CW >= CH else round(CH * 0.2)
SIZE = int(P.get('subSize', 54))  # 字号：project.json 的 subSize，默认 54；竖屏短片 64 左右更清楚
font = subfont(SIZE)  # 字体按故事语言（lang/langs.json），SUB_FONT 可覆盖
JOIN = '' if L()['wrap'] == 'char' else ' '  # 字幕文件里一句分成几行时，中文直接接上，英文、韩文用空格
LINE = round(SIZE * 66 / 54)  # 折行后每行的行高，跟着字号走
BOX = round(SIZE * 140 / 54)  # 单行字幕图的高度（描边留余量）

PUNCT = '，。！？、；：,.!?;:'

def balance(draw, txt, rows):
    """中文折成两行以上时重排：先在最靠中间、两半都放得下的标点处断开（行尾的标点去掉），没有就按字数对半分，
    避免第二行只剩一两个字"""
    if L()['wrap'] != 'char' or len(rows) != 2: return rows
    fits = lambda t: draw.textlength(t, font=font) <= CW - 160
    cands = [i for i, ch in enumerate(txt[:-1]) if ch in PUNCT and fits(txt[:i]) and fits(txt[i + 1:])]
    if cands:
        i = min(cands, key=lambda i: abs(len(txt[:i]) - len(txt[i + 1:])))
        return [txt[:i], txt[i + 1:]]
    h = (len(txt) + 1) // 2
    return [txt[:h], txt[h:]] if fits(txt[:h]) else rows

def sec(x):
    h, m, r = x.split(':'); s, ms = r.split(','); return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000

cues = []
for b in open(f'{W}/{E}.srt', encoding='utf-8').read().strip().split('\n\n'):
    l = b.split('\n'); s, e = l[1].split(' --> '); cues.append((sec(s), sec(e), JOIN.join(l[2:])))
tmp = tempfile.mkdtemp()
ins, fc, prev = ['-i', f'{W}/{E}.mp4'], '', '0:v'
for i, (s, e, txt) in enumerate(cues):
    # 一行放不下（多是英文）就按词折行，往上长，最后一行的位置不变
    dr = ImageDraw.Draw(Image.new('RGBA', (1, 1))); rows = balance(dr, txt, wrap(dr, txt, font, CW - 160) or ['']); up = LINE * (len(rows) - 1)
    im = Image.new('RGBA', (CW, BOX + up), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for k, r in enumerate(rows): d.text((CW // 2, BOX // 2 + LINE * k), r, font=font, fill='white', anchor='mm', stroke_width=4, stroke_fill='black')
    p = f'{tmp}/{i}.png'; im.save(p); ins += ['-i', p]
    fc += f"[{prev}][{i + 1}:v]overlay=0:H-{BOTTOM + up}:enable='between(t,{s},{e})'[v{i}];"; prev = f'v{i}'
subprocess.run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', fc.rstrip(';'), '-map', f'[{prev}]', '-map', '0:a',
                '-c:v', 'libx264', '-crf', '16', '-preset', os.environ.get('X264_PRESET', 'slow'), '-c:a', 'copy', '-movflags', '+faststart', f'{W}/{E}.final.mp4'], check=True)
shutil.rmtree(tmp)
print(T(f'✓ 硬字幕 {len(cues)} 句 → {W}/{E}.final.mp4', f'✓ burned {len(cues)} subtitles → {W}/{E}.final.mp4', f'✓ 자막 {len(cues)}줄 입힘 → {W}/{E}.final.mp4'))
