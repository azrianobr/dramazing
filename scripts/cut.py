#!/usr/bin/env python3
"""把视频工具出的镜头（Grok 6/10 秒、其他工具 5/10 秒等）按分镜时长剪短、拼成段：有台词的镜头至少留到台词说完（whisper 测），
多出来的时间从无台词镜头里扣（每个镜头最少 2 秒）。镜头原片在 <dir>/E02-03/s1.mp4（ingest.sh 收进来的）。
手工修正写在 <dir>/fix.json：{"E01-06": {"skip": [2], "fix": {"1": 4.0}, "extra": {"5": 4.5}}}
  skip=不用的镜头号，fix=强制时长（秒），extra=分镜外追加的镜头（号: 时长，接在段尾）
用法：cut.py --work <作品目录> --ep 1 [--dir video] [E01-02 E01-03 ...]（不写段号 = 整集）"""
import argparse, json, os, re, subprocess, tempfile
ap = argparse.ArgumentParser(); ap.add_argument('--work', required=True); ap.add_argument('--ep', type=int, default=1)
ap.add_argument('--dir', default='video'); ap.add_argument('segs', nargs='*'); a = ap.parse_args()
WORK = os.path.abspath(a.work); W = os.path.join(WORK, a.dir)
WD = os.path.expanduser(os.environ.get('WHISPER_MODELS', '~/models/whisper'))
ep = next(e for e in json.load(open(f'{WORK}/storyboard.json'))['episodes'] if e['ep'] == a.ep)
plan = {s['id']: [c['seconds'] for c in s['cuts']] for s in ep['segments']}
P = json.load(open(f'{W}/prompts.json'))
FIX = json.load(open(f'{W}/fix.json')) if os.path.exists(f'{W}/fix.json') else {}

def speech_end(f):
    t = tempfile.mktemp()
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', f, '-ar', '16000', '-ac', '1', t + '.wav'], check=True)
    subprocess.run(['whisper-cli', '-m', f'{WD}/ggml-large-v3-turbo.bin', '-l', 'zh', '-f', t + '.wav', '--vad', '-vm',
                    f'{WD}/ggml-silero-v5.1.2.bin', '-oj', '-of', t], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    tr = [s for s in json.load(open(t + '.json'))['transcription'] if re.sub(r'\W', '', s['text'])]
    return (tr[-1]['offsets']['to'] / 1000 if tr else 0), ''.join(s['text'] for s in tr)

def dur(f):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]))

for seg in a.segs or list(plan):
    fx = FIX.get(seg, {}); fixd = {int(k): v for k, v in fx.get('fix', {}).items()}
    extra = {int(k): v for k, v in fx.get('extra', {}).items()}
    shots, D, talk, nums = [], [], [], []
    for i, p in enumerate(plan[seg]):
        n = i + 1
        if n in fx.get('skip', []): continue
        f = f'{W}/{seg}/s{n}.mp4'; shots.append(f); nums.append(n); L = dur(f)
        if n in fixd:
            D.append(fixd[n]); talk.append(True); continue
        has = bool(re.search(r'[“"「][^"”」]*[一-鿿]', P.get(f'{seg}/s{n}', {}).get('prompt', '')))
        d = p
        if has:
            e, txt = speech_end(f)
            d = max(p, min(L - 0.05, e + 0.35)) if e else p
            print(f'  {seg}/s{n} 台词到 {e:.1f}s「{txt.strip()}」')
        D.append(min(d, L - 0.05)); talk.append(has)
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
    print(f'✓ {seg} 镜头 {D} → {dur(out):.1f}s（分镜 {sum(plan[seg])}s）')
