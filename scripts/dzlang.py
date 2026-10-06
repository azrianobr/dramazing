"""Python 脚本的语言层，和 lib.mjs 同一套规则：故事语言读 project.json 的 language（没写按 zh），
各语言的语音识别代码、语速、字幕字体见 lang/langs.json；T(中文, English, 한국어) 选界面语言。"""
import json, os, re
from PIL import Image, ImageFilter, ImageFont, ImageOps

LANGS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lang', 'langs.json'), encoding='utf-8'))
_story, _rate, _loaded, _aspect, _tail = 'zh', None, False, '16:9', None


def load(work):
    """读作品的 project.json，定下故事语言；返回 project"""
    global _story, _rate, _loaded, _aspect, _tail
    p = json.load(open(os.path.join(work, 'project.json'), encoding='utf-8'))
    _story, _rate, _loaded, _aspect = p.get('language', 'zh'), p.get('speechRate'), True, p.get('aspect', '16:9')
    _tail = p.get('cutTail')
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


def font(size):
    """字幕字体：环境变量 SUB_FONT 优先，否则按故事语言"""
    path = os.environ.get('SUB_FONT')
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
    path = os.environ.get('TITLE_FONT')
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
