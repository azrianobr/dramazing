"""Python 脚本的语言层，和 lib.mjs 同一套规则：故事语言读 project.json 的 language（没写按 zh），
各语言的语音识别代码、语速、字幕字体见 lang/langs.json；T(中文, English, 한국어) 选界面语言。"""
import json, os, re
from PIL import ImageFont

LANGS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lang', 'langs.json'), encoding='utf-8'))
_story, _rate, _loaded = 'zh', None, False


def load(work):
    """读作品的 project.json，定下故事语言；返回 project"""
    global _story, _rate, _loaded
    p = json.load(open(os.path.join(work, 'project.json'), encoding='utf-8'))
    _story, _rate, _loaded = p.get('language', 'zh'), p.get('speechRate'), True
    if _story not in LANGS: raise SystemExit(f'project.json language "{_story}": {" / ".join(LANGS)}')
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
