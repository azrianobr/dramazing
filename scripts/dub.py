#!/usr/bin/env python3
"""配音：Grok 出画面和口型，声音换成 MiMo TTS（克隆老演员的嗓音），再按口型对齐。
  say  调 MiMo 出一句：--model tts|design|clone；tts 给预设音色名，clone 给样音 wav，design 只给嗓音描述
  segs 量一条视频或音频里说话的段落（秒），用来找 Grok 每句开口、收口的时间
  fit  从一条配音里截 [起, 止]，伸缩到口型的时长，存成 48kHz 立体声，挂到分镜集级 audio 的 at 上
密钥读环境变量 MIMO_API_KEY；没有就用 --keys 指一个 KEY=VALUE 的文件。
用法：
  dub.py say  --model clone --voice ref-C01.wav --style "好奇，语速自然" --text "台词" -o L1.wav
  dub.py segs video/E01-01/s3.mp4 [--db -32]
  dub.py fit  L1.wav --from 0.10 --to 2.78 --dur 2.72 -o audio/dub/L1.wav"""
import argparse, base64, json, os, subprocess, sys, urllib.error, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dzlang import T

API = 'https://api.xiaomimimo.com/v1/chat/completions'
MODELS = {'tts': 'mimo-v2.5-tts', 'design': 'mimo-v2.5-tts-voicedesign', 'clone': 'mimo-v2.5-tts-voiceclone'}


def key(keys):
    k = os.environ.get('MIMO_API_KEY')
    if not k and keys:
        for line in open(os.path.expanduser(keys), encoding='utf-8'):
            if line.startswith('MIMO_API_KEY='): k = line.split('=', 1)[1].strip()
    if not k: sys.exit(T('✗ 没有 MIMO_API_KEY：设环境变量，或用 --keys 指密钥文件', '✗ no MIMO_API_KEY: set the env var or pass --keys', '✗ MIMO_API_KEY가 없습니다: 환경 변수를 설정하거나 --keys로 키 파일을 지정하세요'))
    return k


def say(a):
    audio = {'format': 'wav'}
    if a.model == 'tts': audio['voice'] = a.voice or 'mimo_default'
    if a.model == 'clone':  # 样音 5–10 秒最稳：同一个人单独说话、没有音乐和别人的声音
        audio['voice'] = 'data:audio/wav;base64,' + base64.b64encode(open(a.voice, 'rb').read()).decode()
    # user 消息写语气（design 写嗓音本身），assistant 消息写要念的台词
    body = {'model': MODELS[a.model], 'messages': [{'role': 'user', 'content': a.style}, {'role': 'assistant', 'content': a.text}], 'audio': audio}
    req = urllib.request.Request(API, json.dumps(body).encode(), {'api-key': key(a.keys), 'Content-Type': 'application/json'})
    for n in range(4):  # 并发会被限流（429），一条一条出、失败等几秒重试
        try:
            r = json.load(urllib.request.urlopen(req, timeout=180)); break
        except urllib.error.HTTPError as e:
            if e.code != 429 or n == 3: sys.exit(f'HTTP {e.code}: {e.read()[:300]!r}')
            subprocess.run(['sleep', str(5 * (n + 1))])
    open(a.out, 'wb').write(base64.b64decode(r['choices'][0]['message']['audio']['data']))
    print(T(f'✓ {a.out}', f'✓ {a.out}', f'✓ {a.out}'))


def pcm(path):
    import numpy as np
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ar', '16000', '-ac', '1', '-f', 's16le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.int16).astype(float)


def segs(a):
    """20 毫秒一格量响度，高于 --db 的连成一段；段间不到 0.25 秒的并起来，短于 0.1 秒的丢掉"""
    import numpy as np
    x = pcm(a.file)
    db = [20 * np.log10(np.sqrt(np.mean(x[k:k + 320] ** 2)) / 32768 + 1e-9) for k in range(0, len(x) - 320, 320)]
    out, s = [], None
    for i, v in enumerate(db + [-99]):
        if v > a.db and s is None: s = i
        if v <= a.db and s is not None:
            if out and s * 0.02 - out[-1][1] < 0.25: out[-1][1] = i * 0.02
            else: out.append([s * 0.02, i * 0.02])
            s = None
    out = [(round(p, 2), round(q, 2)) for p, q in out if q - p > 0.1]
    print(json.dumps(out))


def fit(a):
    tempo = (a.to - a.frm) / a.dur
    if not 0.75 <= tempo <= 1.35:  # 超出这个范围听着就假了，换一条配音或改剪点
        print(T(f'  ! 伸缩 {tempo:.2f} 倍，超出 0.75–1.35，听一下', f'  ! tempo {tempo:.2f}x is outside 0.75–1.35; listen to it', f'  ! 템포 {tempo:.2f}배, 0.75–1.35 밖입니다. 들어 보세요'))
    af = f'atrim={a.frm}:{a.to},asetpts=PTS-STARTPTS,atempo={tempo:.4f},afade=t=in:d=0.02,areverse,afade=t=in:d=0.04,areverse'
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.file, '-af', af, '-ar', '48000', '-ac', '2', a.out], check=True)
    print(T(f'✓ {a.out}（{tempo:.2f} 倍）', f'✓ {a.out} ({tempo:.2f}x)', f'✓ {a.out} ({tempo:.2f}배)'))


ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
sub = ap.add_subparsers(dest='cmd', required=True)
p = sub.add_parser('say'); p.add_argument('--model', choices=MODELS, default='clone'); p.add_argument('--voice'); p.add_argument('--style', default='')
p.add_argument('--text', required=True); p.add_argument('-o', dest='out', required=True); p.add_argument('--keys')
p = sub.add_parser('segs'); p.add_argument('file'); p.add_argument('--db', type=float, default=-32)
p = sub.add_parser('fit'); p.add_argument('file'); p.add_argument('--from', dest='frm', type=float, required=True); p.add_argument('--to', type=float, required=True)
p.add_argument('--dur', type=float, required=True); p.add_argument('-o', dest='out', required=True)
a = ap.parse_args()
{'say': say, 'segs': segs, 'fit': fit}[a.cmd](a)
