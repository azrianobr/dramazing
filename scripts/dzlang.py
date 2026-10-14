"""Python 脚本的语言层，和 lib.mjs 同一套规则：故事语言读 project.json 的 language（没写按 zh），
各语言的语音识别代码、语速、字幕字体见 lang/langs.json；T(中文, English, 한국어) 选界面语言。"""
import json, os, re
from PIL import Image, ImageFilter, ImageFont, ImageOps

LANGS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lang', 'langs.json'), encoding='utf-8'))
_story, _rate, _loaded, _aspect, _tail, _subfont, _work = 'zh', None, False, '16:9', None, None, '.'
_maxspeed, _minshot, _cutrate = 1.3, 2.0, None


def load(work):
    """读作品的 project.json，定下故事语言；返回 project"""
    global _story, _rate, _loaded, _aspect, _tail, _subfont, _maxspeed, _minshot, _cutrate, _work
    p = json.load(open(os.path.join(work, 'project.json'), encoding='utf-8'))
    _story, _rate, _loaded, _aspect = p.get('language', 'zh'), p.get('speechRate'), True, p.get('aspect', '16:9')
    _tail, _work = p.get('cutTail'), work
    _maxspeed, _minshot, _cutrate = p.get('maxSpeed', 1.3), p.get('minShot', 2.0), p.get('cutRate')
    _subfont = p.get('subFont') and os.path.join(work, p['subFont'])  # 相对 project.json 所在目录；绝对路径原样用
    if _story not in LANGS: raise SystemExit(f'project.json language "{_story}": {" / ".join(LANGS)}')
    canvas()  # aspect 写错就在这里停
    return p


def ui():
    """界面语言：环境变量 DRAMAZING_LANG > 作品的故事语言 > 系统 LANG > 英文"""
    env, sys = os.environ.get('DRAMAZING_LANG'), (os.environ.get('LC_ALL') or os.environ.get('LANG') or '')[:2]
    return env if env in LANGS else _story if _loaded else sys if sys in LANGS else 'en'


def T(zh, en, ko): return {'zh': zh, 'en': en, 'ko': ko}.get(ui(), en)
def story(): return _story
def L(): return LANGS[_story]


def units(t):
    """台词长度：中文、韩文数字，英文数词；标点不算"""
    if L()['unit'] == 'word': return len([w for w in str(t).split() if re.search(r'\w', w)])
    return len(re.sub(r'[^\w]', '', str(t), flags=re.U))


def speak_seconds(t): return units(t) / (_rate or L()['rate']) + 1


def sub_font_path():
    """字幕字体文件：环境变量 SUB_FONT > project.json 的 subFont > 故事语言的默认字体（返回 None）"""
    return os.environ.get('SUB_FONT') or _subfont


def font(size):
    """字幕字体：见 sub_font_path；都没写按故事语言"""
    path = sub_font_path()
    return ImageFont.truetype(path, size) if path else ImageFont.truetype(L()['font'], size, index=L().get('fontIndex', 0))


def wrap(draw, text, fnt, width):
    """按宽度折行：中文按字，英文、韩文按词（空格）"""
    if L()['wrap'] == 'char':
        lines, cur = [], ''
        for ch in text:
            if draw.textlength(cur + ch, font=fnt) > width: lines.append(cur); cur = ch
            else: cur += ch
        return lines + [cur] if cur else lines
    lines, cur = [], ''
    for w in text.split():
        t = f'{cur} {w}' if cur else w
        if cur and draw.textlength(t, font=fnt) > width: lines.append(cur); cur = w
        else: cur = t
    return lines + [cur] if cur else lines


def cut_tail():
    """project.cutTail：有台词的镜头在台词说完后再留几秒就切（不写 = 至少留到分镜时长）"""
    return _tail

def max_speed():
    """project.maxSpeed：--rate 自动加速的系数上限（不写 = 1.3；超快节奏的片子可以放到 1.5 左右）"""
    return _maxspeed

def cut_rate():
    """project.cutRate：cut.py 自动加速的目标语速（每秒字数 / 词数），命令行 --rate 优先；不写 = 不自动加速"""
    return _cutrate

def min_shot():
    """project.minShot：剪辑后每个镜头最短几秒（成片秒数，不写 = 2.0）"""
    return _minshot

def canvas():
    """成片画布（宽, 高），和 lib.mjs 的 parseAspect 同一算法：project.aspect 写成 宽:高，长边 1920，短边取偶数"""
    m = re.fullmatch(r'(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)', str(_aspect).strip())
    if not m or not (float(m[1]) > 0 and float(m[2]) > 0): raise SystemExit(f'project.json aspect "{_aspect}": 16:9 / 9:16 / ...')
    r = float(m[1]) / float(m[2]); even = lambda x: int(round(x / 2) * 2)
    return (1920, even(1920 / r)) if r >= 1 else (even(1920 * r), 1920)


def insert_of(cut):
    """插入镜头（见 lib.mjs 的 insertOf）：{file, fit}，不是插入镜头返回 None"""
    v = cut.get('insert')
    if v is None: return None
    return {'file': v, 'fit': 'blur'} if isinstance(v, str) else {'fit': 'blur', **v}


def cover_of(cut):
    """录屏盖画面（见 lib.mjs 的 coverOf）：{file, at, fit, seconds}。这一切照常出片、照常有台词和声音，
    从第 at 秒起画面换成素材，盖 seconds 秒（不写 = 素材全长），声音还是这一切自己的。没写返回 None"""
    v = cut.get('cover')
    if v is None: return None
    return {'at': 1.0, 'fit': 'blur', **({'file': v} if isinstance(v, str) else v)}


def chat_frames(t, w, h, n, fps=24):
    """聊天气泡花字（title.style = "chat"）：n 帧 w×h 透明图。气泡尾巴尖在 (x, y)（画面比例），tail 朝 left / right。
    先弹出（0.2 秒回弹）显示「正在输入」三个点，0.5 秒起展开成文字，最后 0.15 秒淡出。默认白底黑字，bg / color 写 #RRGGBB 可改，带淡阴影。
    字体：title.font > 环境变量 CHAT_FONT > TITLE_FONT > 字幕字体（路径，.ttc 可写成 路径:序号）"""
    import math
    from PIL import ImageDraw
    spec = (t.get('font') and os.path.join(_work, t['font'])) or os.environ.get('CHAT_FONT') or os.environ.get('TITLE_FONT') or sub_font_path()
    path, idx = (spec.rsplit(':', 1) if spec and re.search(r':\d+$', spec) else (spec, 0))
    S = 3  # 先按 3 倍画再缩小，圆角才不毛
    base = min(w, h); fs = round(base * 0.075)
    f = ImageFont.truetype(path, fs * S, index=int(idx)) if path else ImageFont.truetype(L()['font'], fs * S, index=L().get('fontIndex', 0))
    tb = ImageDraw.Draw(Image.new('RGBA', (1, 1))).textbbox((0, 0), t['text'], font=f)
    padx, pady = round(fs * 0.62) * S, round(fs * 0.48) * S
    bh = max(tb[3] - tb[1], fs * S) + pady * 2
    full_w = tb[2] - tb[0] + padx * 2; dots_w = round(fs * 2.6) * S
    tail_w = round(fs * 0.42) * S; left = t.get('tail', 'left') == 'left'
    hexc = lambda v, dv: tuple(int((v or dv).lstrip('#')[k:k + 2], 16) for k in (0, 2, 4))
    BG, FG = hexc(t.get('bg'), '#FFFFFF'), hexc(t.get('color'), '#181818')  # 气泡底色、字色
    cache = {}

    def bubble(bw, text_a, dot_phase):
        key = (bw, round(text_a, 2), round(dot_phase, 2) if text_a < 1 else 0)
        if key in cache: return cache[key]
        W, H = bw + tail_w + 24 * S, bh + 24 * S
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        x0 = tail_w if left else 0; y0 = 0
        ty = y0 + bh * 0.62  # 尾巴在气泡下半部
        d.rounded_rectangle((x0, y0, x0 + bw, y0 + bh), radius=round(bh * 0.32), fill=BG + (255,))
        tip = (0, ty + fs * 0.25 * S) if left else (x0 + bw + tail_w, ty + fs * 0.25 * S)
        edge = x0 + 2 * S if left else x0 + bw - 2 * S
        d.polygon([tip, (edge, ty - fs * 0.32 * S), (edge, ty + fs * 0.12 * S)], fill=BG + (255,))
        if text_a < 1:  # 三个点，依次一闪一闪
            r = round(fs * 0.14) * S; cx = x0 + bw / 2; cy = y0 + bh / 2
            for k in range(3):
                a = 0.35 + 0.65 * max(0, math.sin((dot_phase - k * 0.18) * math.pi * 2.2)) if text_a == 0 else 1 - text_a
                c = round(150 - 60 * a); px = cx + (k - 1) * r * 3.2
                d.ellipse((px - r, cy - r, px + r, cy + r), fill=(c, c, c, round(255 * (1 - text_a))))
        if text_a > 0:
            layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
            ImageDraw.Draw(layer).text((x0 + (bw - (tb[2] - tb[0])) / 2 - tb[0], y0 + (bh - (tb[3] - tb[1])) / 2 - tb[1]), t['text'], font=f, fill=FG + (round(255 * text_a),))
            im.alpha_composite(layer)
        # 阴影
        sh = Image.new('RGBA', im.size, (0, 0, 0, 0)); sh.putalpha(im.getchannel('A').point(lambda v: v * 0.28))
        sh = sh.filter(ImageFilter.GaussianBlur(6 * S)); out = Image.new('RGBA', im.size, (0, 0, 0, 0))
        out.alpha_composite(sh, (0, 4 * S)); out.alpha_composite(im)
        out = out.resize((W // S, H // S), Image.LANCZOS)
        anchor = (tip[0] / S, tip[1] / S)
        cache[key] = (out, anchor); return cache[key]

    ease_back = lambda u: 1 + 2.7 * (u - 1) ** 3 + 1.7 * (u - 1) ** 2
    tipx, tipy = t.get('x', 0.62) * w, t['y'] * h
    frames = []
    for i in range(n):
        s = i / fps
        sc = 0.2 + 0.8 * ease_back(min(1, s / 0.2))
        g = min(1, max(0, (s - 0.5) / 0.12)); g = g * g * (3 - 2 * g)
        bw = round((dots_w + (full_w - dots_w) * g) / S) * S
        img, (ax, ay) = bubble(bw, g, s)
        fade = min(1, max(0, (n - 1 - i) / (0.15 * fps)))
        if sc != 1: img = img.resize((max(1, round(img.width * sc)), max(1, round(img.height * sc))), Image.LANCZOS); ax, ay = ax * sc, ay * sc
        if fade < 1: img = img.copy(); img.putalpha(img.getchannel('A').point(lambda v: v * fade))
        fr = Image.new('RGBA', (w, h), (0, 0, 0, 0)); fr.alpha_composite(img, (max(0, round(tipx - ax)), max(0, round(tipy - ay))))
        frames.append(fr)
    return frames


IMAGE_EXT = ('.png', '.jpg', '.jpeg', '.webp')


def fit_image(im, w, h, mode='crop'):
    """把一张图放进 w×h：crop 放大裁满；pad 原样居中加黑边；blur 原样居中，底下垫放大虚化的同一张"""
    im = im.convert('RGB')
    if mode == 'crop': return ImageOps.fit(im, (w, h), Image.LANCZOS)
    s = min(w / im.width, h / im.height); fg = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    bg = ImageOps.fit(im, (w, h)).filter(ImageFilter.GaussianBlur(40)) if mode == 'blur' else Image.new('RGB', (w, h))
    bg.paste(fg, ((w - fg.width) // 2, (h - fg.height) // 2)); return bg


def ffmpeg_fit(w, h, mode, src, dst):
    """和 fit_image 同样的放法，写成 ffmpeg 滤镜链：从标签 src 到标签 dst（不带方括号）"""
    if mode == 'crop':
        return f'[{src}]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1[{dst}]'
    if mode == 'pad':
        return f'[{src}]scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1[{dst}]'
    return (f'[{src}]split[{dst}b0][{dst}f0];[{dst}b0]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},gblur=sigma=40[{dst}b1];'
            f'[{dst}f0]scale={w}:{h}:force_original_aspect_ratio=decrease[{dst}f1];[{dst}b1][{dst}f1]overlay=(W-w)/2:(H-h)/2,setsar=1[{dst}]')


def title_of(cut):
    """花字（见 lib.mjs 的 titleOf）：{text, sub, at, seconds, pos, y}，没写返回 None"""
    v = cut.get('title')
    if v is None: return None
    return {'at': 0.3, 'seconds': 2.5, 'pos': 'left', 'y': 0.62, **({'text': v} if isinstance(v, str) else v)}


def title_image(t, w, h):
    """把花字画成 w×h 的透明图：上面是描边金字的名字，下面是红底白字的小标签；按 pos 靠左 / 居中 / 靠右，按 y 定中线高度。
    字体：环境变量 TITLE_FONT 优先，否则用字幕字体"""
    from PIL import ImageDraw
    path = os.environ.get('TITLE_FONT') or sub_font_path()
    face = lambda s: ImageFont.truetype(path, s) if path else ImageFont.truetype(L()['font'], s, index=L().get('fontIndex', 0))
    probe = ImageDraw.Draw(Image.new('RGBA', (1, 1)))
    base, room = min(w, h), round(w * 0.86)
    ns = round(base * 0.12)
    while ns > 24 and probe.textlength(t['text'], font=face(ns)) > room: ns -= 4  # 一行放不下就缩字号
    nf, stroke = face(ns), max(4, ns // 14)
    nb = probe.textbbox((0, 0), t['text'], font=nf, stroke_width=stroke)
    nw, nh = nb[2] - nb[0], nb[3] - nb[1]
    sub = (t.get('sub') or '').strip()
    sf = face(round(ns * 0.34)); pad = round(ns * 0.16)
    sb = probe.textbbox((0, 0), sub, font=sf) if sub else (0, 0, 0, 0)
    bw, bh = (sb[2] - sb[0] + pad * 2, sb[3] - sb[1] + pad * 2) if sub else (0, 0)
    gap = round(ns * 0.12) if sub else 0
    top = round(h * t['y'] - (nh + gap + bh) / 2)
    margin = round(w * 0.07)
    xs = lambda bw_: {'left': margin, 'right': w - margin - bw_, 'center': (w - bw_) // 2}[t['pos']]
    nx, bx = xs(nw), xs(bw)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    shadow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).text((nx - nb[0] + stroke, top - nb[1] + stroke * 2), t['text'], font=nf, fill=(0, 0, 0, 170), stroke_width=stroke, stroke_fill=(0, 0, 0, 170))
    im.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(stroke)))
    d = ImageDraw.Draw(im)
    d.text((nx - nb[0], top - nb[1]), t['text'], font=nf, fill=(255, 214, 72, 255), stroke_width=stroke, stroke_fill=(74, 24, 0, 255))
    if sub:
        by = top + nh + gap
        d.rounded_rectangle((bx, by, bx + bw, by + bh), radius=round(bh * 0.18), fill=(198, 30, 42, 235))
        d.text((bx + pad - sb[0], by + pad - sb[1]), sub, font=sf, fill=(255, 255, 255, 255))
    return im
