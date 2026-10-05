#!/usr/bin/env python3
"""审片版：每个镜头左上角烧上编号「段-镜头」（如 02-4，按成片里的顺序数），先逐段烧、再拼接；
音频和软字幕取 assemble 出的正片 E0N.mp4 / E0N.srt。输出 E0N.review.mp4 和 E0N.review.txt（编号 ↔ 时间 ↔ 源文件）
用法：review.py --work <作品目录> --ep 1 [--dir video]"""
import argparse, json, os, shutil, subprocess, sys
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dzlang import load, L, T
ap = argparse.ArgumentParser(); ap.add_argument('--work', required=True); ap.add_argument('--ep', type=int, default=1)
ap.add_argument('--dir', default='video'); a = ap.parse_args()
load(os.path.abspath(a.work)); W = os.path.join(os.path.abspath(a.work), a.dir); E = f'E{a.ep:02d}'
segs = [l.split("'")[1] for l in open(f'{W}/{E}.concat.txt') if l.startswith('file')]
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 56)
tmp = f'{W}/.review'; os.makedirs(tmp, exist_ok=True)

def vdur(f):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                                          'stream=duration', '-of', 'csv=p=0', f]))

def badge(label, p):
    im = Image.new('RGBA', (220, 90), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, 219, 89), 14, fill=(0, 0, 0, 150))
    d.text((110, 45), label, font=font, fill=(255, 230, 80, 255), anchor='mm'); im.save(p)

table, T, parts = [], 0.0, []
for f in segs:
    seg = os.path.basename(f)[:-4]; shots = json.load(open(f'{W}/{seg}.shots.json'))
    ins, fc, last, t = ['-i', f], '', '0:v', 0.0
    for k, s in enumerate(shots):
        label = f'{seg[-2:]}-{k + 1}'; p = f'{tmp}/{label}.png'; badge(label, p); ins += ['-i', p]
        end = t + s['dur'] if k < len(shots) - 1 else 1e6  # 最后一个镜头延到段尾
        fc += f"[{last}][{k + 1}:v]overlay=30:30:enable='between(t,{t:.3f},{end - 0.001:.3f})'[o{k}];"; last = f'o{k}'
        table.append((label, T + t, f'{seg}/s{s["shot"]}.mp4')); t += s['dur']
    out = f'{tmp}/{seg}.mp4'; parts.append(out); T += vdur(f)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', fc.rstrip(';'), '-map', f'[{last}]',
                    '-an', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', out], check=True)
open(f'{tmp}/list.txt', 'w').write(''.join(f"file '{p}'\n" for p in parts))
# 不加 -shortest：它会把结尾截掉一截（实测会少几十帧）
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', f'{tmp}/list.txt',
                '-i', f'{W}/{E}.mp4', '-i', f'{W}/{E}.srt', '-map', '0:v', '-map', '1:a', '-map', '2',
                '-c', 'copy', '-c:s', 'mov_text', '-metadata:s:s:0', f"language={L()['iso3']}",
                '-movflags', '+faststart', f'{W}/{E}.review.mp4'], check=True)
shutil.rmtree(tmp)
with open(f'{W}/{E}.review.txt', 'w') as o:
    for label, s, src in table: o.write(f"{label}\t{s:6.2f}s {T('起', 'start', '시작')}\t{src}\n")
print(open(f'{W}/{E}.review.txt').read())
