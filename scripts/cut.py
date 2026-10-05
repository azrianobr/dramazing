#!/usr/bin/env python3
"""把视频工具出的镜头（Grok 6/10 秒、其他工具 5/10 秒等）按分镜时长剪短、拼成段：有台词的镜头至少留到台词说完（whisper 测），
多出来的时间从无台词镜头里扣（每个镜头最少 2 秒）。镜头原片在 <dir>/E02-03/s1.mp4（ingest.sh 收进来的）。
手工修正写在 <dir>/fix.json：{"E01-06": {"skip": [2], "fix": {"1": 4.0}, "extra": {"5": 4.5}}}
  skip=不用的镜头号，fix=强制时长（秒），extra=分镜外追加的镜头（号: 时长，接在段尾）
用法：cut.py --work <作品目录> --ep 1 [--dir video] [E01-02 E01-03 ...]（不写段号 = 整集）"""
import argparse, json, os, re, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dzlang import load, L, T, units
ap = argparse.ArgumentParser(); ap.add_argument('--work', required=True); ap.add_argument('--ep', type=int, default=1)
ap.add_argument('--dir', default='video'); ap.add_argument('segs', nargs='*'); a = ap.parse_args()
WORK = os.path.abspath(a.work); W = os.path.join(WORK, a.dir); load(WORK)
WD = os.path.expanduser(os.environ.get('WHISPER_MODELS', '~/models/whisper'))
ep = next(e for e in json.load(open(f'{WORK}/storyboard.json'))['episodes'] if e['ep'] == a.ep)
plan = {s['id']: [c['seconds'] for c in s['cuts']] for s in ep['segments']}
P = json.load(open(f'{W}/prompts.json'))
FIX = json.load(open(f'{W}/fix.json')) if os.path.exists(f'{W}/fix.json') else {}
# 哪个镜头有台词：优先看 video-prompts 写的 shots.json；旧作品没有它，就在提示词里找带引号的台词
SHOTS = json.load(open(f'{W}/shots.json')) if os.path.exists(f'{W}/shots.json') else None
LETTER = {'zh': '[一-鿿]', 'ko': '[가-힣]'}.get(L()['whisper'], '[A-Za-z]')

def has_lines(key):
    if SHOTS is not None and key in SHOTS: return bool(SHOTS[key].get('lines'))
    return bool(re.search(r'[“"「][^"”」]*' + LETTER, P.get(key, {}).get('prompt', '')))

def speech_end(f):
    t = tempfile.mktemp()
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', f, '-ar', '16000', '-ac', '1', t + '.wav'], check=True)
    subprocess.run(['whisper-cli', '-m', f'{WD}/ggml-large-v3-turbo.bin', '-l', L()['whisper'], '-f', t + '.wav', '--vad', '-vm',
                    f'{WD}/ggml-silero-v5.1.2.bin', '-oj', '-of', t], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    tr = [s for s in json.load(open(t + '.json'))['transcription'] if re.sub(r'\W', '', s['text'])]
    if not tr: return 0, 0, ''
    return tr[0]['offsets']['from'] / 1000, tr[-1]['offsets']['to'] / 1000, ''.join(s['text'] for s in tr)


def rate_note(key, start, end):
    """实测语速：这个镜头台词的字（词）数 ÷ 开口到说完的秒数。用来校准 langs.json 的 rate"""
    says = [x.get('say', '') for x in (SHOTS or {}).get(key, {}).get('lines', []) if x.get('kind', 'line') == 'line']
    n = sum(units(x) for x in says)
    if not n or end - start < 0.5: return ''
    r = n / (end - start)
    return T(f'，语速 {r:.2f}', f', rate {r:.2f}', f', 말 속도 {r:.2f}')

def dur(f):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]))

for seg in a.segs or list(plan):
    fx = FIX.get(seg, {}); fixd = {int(k): v for k, v in fx.get('fix', {}).items()}
    extra = {int(k): v for k, v in fx.get('extra', {}).items()}
    shots, D, talk, nums = [], [], [], []
    # 只出了试探镜头、或者还没出齐时：有的镜头照样测台词（给语速校准用），这一段先不拼
    missing = [i + 1 for i in range(len(plan[seg])) if i + 1 not in fx.get('skip', []) and not os.path.exists(f'{W}/{seg}/s{i + 1}.mp4')]
    for i, p in enumerate(plan[seg]):
        if missing:
            n = i + 1
            if n not in missing and has_lines(f'{seg}/s{n}'):
                st, e, txt = speech_end(f'{W}/{seg}/s{n}.mp4')
                print(T(f'  {seg}/s{n} 台词 {st:.1f}–{e:.1f}s「{txt.strip()}」', f'  {seg}/s{n} speech {st:.1f}–{e:.1f}s "{txt.strip()}"', f'  {seg}/s{n} 대사 {st:.1f}–{e:.1f}초 「{txt.strip()}」') + rate_note(f'{seg}/s{n}', st, e))
            continue
        n = i + 1
        if n in fx.get('skip', []): continue
        f = f'{W}/{seg}/s{n}.mp4'; shots.append(f); nums.append(n); length = dur(f)
        if n in fixd:
            D.append(fixd[n]); talk.append(True); continue
        has = has_lines(f'{seg}/s{n}')
        d = p
        if has:
            st, e, txt = speech_end(f)
            d = max(p, min(length - 0.05, e + 0.35)) if e else p
            print(T(f'  {seg}/s{n} 台词到 {e:.1f}s「{txt.strip()}」', f'  {seg}/s{n} speech ends at {e:.1f}s "{txt.strip()}"', f'  {seg}/s{n} 대사 끝 {e:.1f}초 「{txt.strip()}」') + rate_note(f'{seg}/s{n}', st, e))
        D.append(min(d, length - 0.05)); talk.append(has)
    if missing:
        print(T(f'  {seg} 缺镜头 {missing}：这一段先不拼', f'  {seg} missing shots {missing}: segment not assembled yet', f'  {seg} 빠진 숏 {missing}: 이 구간은 아직 잇지 않습니다'))
        continue
    for n, v in extra.items():
        shots.append(f'{W}/{seg}/s{n}.mp4'); nums.append(n); D.append(v); talk.append(True)
    over = sum(D) - sum(plan[seg]) - sum(extra.values())
    for i in sorted(range(len(D)), key=lambda i: -D[i]):
        if over <= 0: break
        if talk[i]: continue
        c = min(over, max(0, D[i] - 2.0)); D[i] -= c; over -= c
    D = [round(x, 2) for x in D]
    fc, ins = '', []
    for i, f in enumerate(shots):
        ins += ['-i', f]; fo = max(0, D[i] - 0.08)
        fc += (f'[{i}:v]trim=0:{D[i]},setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=24,format=yuv420p[v{i}];'
               f'[{i}:a]atrim=0:{D[i]},asetpts=PTS-STARTPTS,aresample=48000,afade=t=out:st={fo}:d=0.08[a{i}];')
    k = len(shots)
    fc += ''.join(f'[v{i}][a{i}]' for i in range(k)) + f'concat=n={k}:v=1:a=1[v][a];[a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[ao]'
    out = f'{W}/{seg}.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', fc, '-map', '[v]', '-map', '[ao]', '-c:v', 'libx264',
                    '-crf', '16', '-preset', os.environ.get('X264_PRESET', 'slow'), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', out], check=True)
    json.dump([{'shot': n, 'dur': d} for n, d in zip(nums, D)], open(f'{W}/{seg}.shots.json', 'w'))
    print(T(f'✓ {seg} 镜头 {D} → {dur(out):.1f}s（分镜 {sum(plan[seg])}s）', f'✓ {seg} shots {D} → {dur(out):.1f}s (storyboard {sum(plan[seg])}s)', f'✓ {seg} 숏 {D} → {dur(out):.1f}초 (콘티 {sum(plan[seg])}초)'))
