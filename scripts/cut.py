#!/usr/bin/env python3
"""把视频工具出的镜头（Grok 6/10 秒、其他工具 5/10 秒等）按分镜时长剪短、拼成段：有台词的镜头至少留到台词说完（whisper 测），
多出来的时间从无台词镜头里扣（每个镜头最少 2 秒）。镜头原片在 <dir>/E02-03/s1.mp4（ingest.sh 收进来的）。
手工修正写在 <dir>/fix.json：{"E01-06": {"skip": [2], "fix": {"1": 4.0}, "in": {"3": 1.25}, "extra": {"5": 4.5}}}
  skip=不用的镜头号，fix=强制时长（秒），in=从原片第几秒开始取（默认 0，动作来得晚时用），extra=分镜外追加的镜头（号: 时长，接在段尾）
project.json 写了 cutTail（秒）时，有台词的镜头按「台词说完 + cutTail」切，不再至少留到分镜时长（台词后人物干站着会显得拖）。
画布按 project.json 的 aspect（不写是 16:9，长边 1920）。插入镜头（cut.insert）直接取作品目录里的素材，按分镜时长、insert.fit 放进画布；
贴屏（cut.screen 写了 file 和 corners）把素材按四个角贴到镜头里的屏幕上。素材没有声音时垫静音
用法：cut.py --work <作品目录> --ep 1 [--dir video] [E01-02 E01-03 ...]（不写段号 = 整集）"""
import argparse, json, math, os, re, subprocess, sys, tempfile
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dzlang import load, L, T, units, canvas, cut_tail, insert_of, title_of, title_image, ffmpeg_fit, IMAGE_EXT
ap = argparse.ArgumentParser(); ap.add_argument('--work', required=True); ap.add_argument('--ep', type=int, default=1)
ap.add_argument('--dir', default='video'); ap.add_argument('segs', nargs='*'); a = ap.parse_args()
WORK = os.path.abspath(a.work); W = os.path.join(WORK, a.dir); load(WORK); CW, CH = canvas()
WD = os.path.expanduser(os.environ.get('WHISPER_MODELS', '~/models/whisper'))
ep = next(e for e in json.load(open(f'{WORK}/storyboard.json'))['episodes'] if e['ep'] == a.ep)
plan = {s['id']: [c['seconds'] for c in s['cuts']] for s in ep['segments']}
CUTS = {s['id']: s['cuts'] for s in ep['segments']}
P = json.load(open(f'{W}/prompts.json'))
FIX = json.load(open(f'{W}/fix.json')) if os.path.exists(f'{W}/fix.json') else {}
# 哪个镜头有台词：优先看 video-prompts 写的 shots.json；旧作品没有它，就在提示词里找带引号的台词
SHOTS = json.load(open(f'{W}/shots.json')) if os.path.exists(f'{W}/shots.json') else None
LETTER = {'zh': '[一-鿿]', 'ko': '[가-힣]'}.get(L()['whisper'], '[A-Za-z]')

def has_lines(key):
    if SHOTS is not None and key in SHOTS: return bool(SHOTS[key].get('lines'))
    return bool(re.search(r'[“"「][^"”」]*' + LETTER, P.get(key, {}).get('prompt', '')))

def speech_end(f, skip=0):
    """台词起止（秒，从入点 skip 算起）；入点之前说完的不算"""
    t = tempfile.mktemp()
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', f, '-ar', '16000', '-ac', '1', t + '.wav'], check=True)
    subprocess.run(['whisper-cli', '-m', f'{WD}/ggml-large-v3-turbo.bin', '-l', L()['whisper'], '-f', t + '.wav', '--vad', '-vm',
                    f'{WD}/ggml-silero-v5.1.2.bin', '-oj', '-of', t], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    tr = [s for s in json.load(open(t + '.json'))['transcription'] if re.sub(r'\W', '', s['text']) and s['offsets']['to'] / 1000 > skip]
    if not tr: return 0, 0, ''
    return max(0, tr[0]['offsets']['from'] / 1000 - skip), tr[-1]['offsets']['to'] / 1000 - skip, ''.join(s['text'] for s in tr)


def rate_note(key, start, end):
    """实测语速：这个镜头台词的字（词）数 ÷ 开口到说完的秒数。用来校准 langs.json 的 rate"""
    says = [x.get('say', '') for x in (SHOTS or {}).get(key, {}).get('lines', []) if x.get('kind', 'line') == 'line']
    n = sum(units(x) for x in says)
    if not n or end - start < 0.5: return ''
    r = n / (end - start)
    return T(f'，语速 {r:.2f}', f', rate {r:.2f}', f', 말 속도 {r:.2f}')

def dur(f):
    if f.lower().endswith(IMAGE_EXT): return math.inf  # 图片素材多长都行
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]))

def has_audio(f):
    if f.lower().endswith(IMAGE_EXT): return False
    return bool(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', f]).strip())

def src_of(seg, n):
    """镜头 n 的素材：插入镜头取 cut.insert.file，其余取视频工具出的 <dir>/<段>/s<n>.mp4"""
    cuts = CUTS[seg]; ins = insert_of(cuts[n - 1]) if n <= len(cuts) else None
    return os.path.join(WORK, ins['file']) if ins else f'{W}/{seg}/s{n}.mp4'

def screen_of(seg, n):
    """贴屏设置：{file, corners}；没写 screen 返回 None"""
    cuts = CUTS[seg]
    return cuts[n - 1].get('screen') if n <= len(cuts) else None

def media_in(f, seconds):
    """ffmpeg 输入参数：图片循环成 seconds 秒的视频"""
    return ['-loop', '1', '-framerate', '24', '-t', f'{seconds:.3f}', '-i', f] if f.lower().endswith(IMAGE_EXT) else ['-i', f]

def screen_mask(corners, p):
    """贴屏的遮罩：屏幕四边形内白、外黑"""
    im = Image.new('L', (CW, CH), 0); ImageDraw.Draw(im).polygon([tuple(x) for x in corners], fill=255); im.save(p)

for seg in a.segs or list(plan):
    fx = FIX.get(seg, {}); fixd = {int(k): v for k, v in fx.get('fix', {}).items()}
    extra = {int(k): v for k, v in fx.get('extra', {}).items()}
    inp = {int(k): v for k, v in fx.get('in', {}).items()}
    shots, D, talk, nums, IN = [], [], [], [], []
    # 只出了试探镜头、或者还没出齐时：有的镜头照样测台词（给语速校准用），这一段先不拼
    missing = [i + 1 for i in range(len(plan[seg])) if i + 1 not in fx.get('skip', []) and not os.path.exists(src_of(seg, i + 1))]
    # 贴屏要素材和四个角都齐，否则成片里会留一块灰屏
    noscreen = [i + 1 for i in range(len(plan[seg])) if i + 1 not in fx.get('skip', []) and screen_of(seg, i + 1) is not None
                and not (screen_of(seg, i + 1).get('corners') and os.path.exists(os.path.join(WORK, screen_of(seg, i + 1).get('file', ''))))]
    for i, p in enumerate(plan[seg]):
        if missing:
            n = i + 1
            if n not in missing and not insert_of(CUTS[seg][i]) and has_lines(f'{seg}/s{n}'):
                st, e, txt = speech_end(f'{W}/{seg}/s{n}.mp4', inp.get(n, 0))
                print(T(f'  {seg}/s{n} 台词 {st:.1f}–{e:.1f}s「{txt.strip()}」', f'  {seg}/s{n} speech {st:.1f}–{e:.1f}s "{txt.strip()}"', f'  {seg}/s{n} 대사 {st:.1f}–{e:.1f}초 「{txt.strip()}」') + rate_note(f'{seg}/s{n}', st, e))
            continue
        n = i + 1
        if n in fx.get('skip', []): continue
        f = src_of(seg, n); shots.append(f); nums.append(n); IN.append(inp.get(n, 0)); length = dur(f) - IN[-1]
        if n in fixd:
            D.append(fixd[n]); talk.append(True); continue
        if insert_of(CUTS[seg][i]):  # 插入镜头按分镜时长，不参与扣时间
            D.append(min(p, length)); talk.append(True); continue
        has = has_lines(f'{seg}/s{n}')
        d = p
        if has:
            st, e, txt = speech_end(f, IN[-1])
            if e and cut_tail() is not None: d = max(2.0, min(length - 0.05, e + cut_tail()))  # 台词说完留 cutTail 秒就切，不等分镜时长
            else: d = max(p, min(length - 0.05, e + 0.35)) if e else p
            print(T(f'  {seg}/s{n} 台词到 {e:.1f}s「{txt.strip()}」', f'  {seg}/s{n} speech ends at {e:.1f}s "{txt.strip()}"', f'  {seg}/s{n} 대사 끝 {e:.1f}초 「{txt.strip()}」') + rate_note(f'{seg}/s{n}', st, e))
        D.append(min(d, length - 0.05)); talk.append(has)
    if missing:
        print(T(f'  {seg} 缺镜头 {missing}：这一段先不拼', f'  {seg} missing shots {missing}: segment not assembled yet', f'  {seg} 빠진 숏 {missing}: 이 구간은 아직 잇지 않습니다'))
        continue
    if noscreen:
        print(T(f'  {seg} 镜头 {noscreen} 的贴屏缺素材或四个角（screen.file / screen.corners）：这一段先不拼', f'  {seg} shots {noscreen} lack the screen file or corners (screen.file / screen.corners): segment not assembled yet', f'  {seg} 숏 {noscreen}의 화면 합성 소재나 모서리(screen.file / screen.corners)가 없습니다: 이 구간은 아직 잇지 않습니다'))
        continue
    for n, v in extra.items():
        shots.append(f'{W}/{seg}/s{n}.mp4'); nums.append(n); IN.append(inp.get(n, 0)); D.append(v); talk.append(True)
    over = sum(D) - sum(plan[seg]) - sum(extra.values())
    for i in sorted(range(len(D)), key=lambda i: -D[i]):
        if over <= 0: break
        if talk[i]: continue
        c = min(over, max(0, D[i] - 2.0)); D[i] -= c; over -= c
    D = [round(x, 2) for x in D]
    fc, ins, tmp = '', [], tempfile.mkdtemp()
    for i, f in enumerate(shots):
        x = len([v for v in ins if v == '-i']); ins += media_in(f, IN[i] + D[i]); fo = max(0, D[i] - 0.08)
        a0, a1 = IN[i], round(IN[i] + D[i], 3)
        cut = CUTS[seg][nums[i] - 1] if nums[i] <= len(CUTS[seg]) else {}
        ins_c = insert_of(cut)
        fc += f'[{x}:v]trim={a0}:{a1},setpts=PTS-STARTPTS,fps=24[t{i}];' + ffmpeg_fit(CW, CH, ins_c['fit'] if ins_c else 'crop', f't{i}', f'p{i}') + ';'
        sc = cut.get('screen')
        if sc and not ins_c:
            # 贴屏：素材拉成画布大小，透视变换到四个角（ffmpeg 的顺序是左上、右上、左下、右下），四边形外用遮罩挖掉
            (x0, y0), (x1, y1), (x2, y2), (x3, y3) = sc['corners']
            sf = os.path.join(WORK, sc['file']); m = f'{tmp}/mask{i}.png'; screen_mask(sc['corners'], m)
            y = len([v for v in ins if v == '-i']); ins += media_in(sf, D[i]) + ['-loop', '1', '-framerate', '24', '-t', f'{D[i]:.3f}', '-i', m]
            fc += (f'[{y}:v]trim=0:{D[i]},setpts=PTS-STARTPTS,fps=24,tpad=stop_mode=clone:stop_duration={D[i]},trim=0:{D[i]},'
                   f'scale={CW}:{CH},setsar=1,format=rgba,perspective={x0}:{y0}:{x1}:{y1}:{x3}:{y3}:{x2}:{y2}:sense=destination[s{i}];'
                   f'[{y + 1}:v]format=gray[m{i}];[s{i}][m{i}]alphamerge[sm{i}];[p{i}][sm{i}]overlay=0:0:shortest=1[q{i}];')
        else:
            fc += f'[p{i}]null[q{i}];'
        tt = title_of(cut)
        if tt and tt['at'] < D[i] - 0.3:
            # 花字：画成透明 PNG，淡入淡出叠在这一切上；剪辑把这一切剪短了就跟着提前收
            t0, t1 = tt['at'], min(tt['at'] + tt['seconds'], D[i])
            tp = f'{tmp}/title{i}.png'; title_image(tt, CW, CH).save(tp)
            y = len([v for v in ins if v == '-i']); ins += ['-loop', '1', '-framerate', '24', '-t', f'{D[i]:.3f}', '-i', tp]
            fc += (f'[{y}:v]format=rgba,fade=t=in:st={t0}:d=0.15:alpha=1,fade=t=out:st={max(t0, t1 - 0.2):.3f}:d=0.2:alpha=1[tt{i}];'
                   f"[q{i}][tt{i}]overlay=0:0:shortest=1:enable='between(t,{t0},{t1:.3f})'[r{i}];")
        else:
            fc += f'[q{i}]null[r{i}];'
        fc += f'[r{i}]format=yuv420p[v{i}];'
        if has_audio(f):
            fc += f'[{x}:a]atrim={a0}:{a1},asetpts=PTS-STARTPTS,aresample=48000,afade=t=out:st={fo}:d=0.08[a{i}];'
        else:  # 录屏、截图没有声音：垫一段同样长的静音，concat 才拼得上
            fc += f'anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:{D[i]},asetpts=PTS-STARTPTS[a{i}];'
    k = len(shots)
    fc += ''.join(f'[v{i}][a{i}]' for i in range(k)) + f'concat=n={k}:v=1:a=1[v][a];[a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[ao]'
    out = f'{W}/{seg}.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', fc, '-map', '[v]', '-map', '[ao]', '-c:v', 'libx264',
                    '-crf', '16', '-preset', os.environ.get('X264_PRESET', 'slow'), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', out], check=True)
    json.dump([{'shot': n, 'dur': d, **({'in': i} if i else {}), **({'src': os.path.relpath(f, WORK)} if n <= len(CUTS[seg]) and insert_of(CUTS[seg][n - 1]) else {})}
               for n, d, i, f in zip(nums, D, IN, shots)], open(f'{W}/{seg}.shots.json', 'w'))
    print(T(f'✓ {seg} 镜头 {D} → {dur(out):.1f}s（分镜 {sum(plan[seg])}s）', f'✓ {seg} shots {D} → {dur(out):.1f}s (storyboard {sum(plan[seg])}s)', f'✓ {seg} 숏 {D} → {dur(out):.1f}초 (콘티 {sum(plan[seg])}초)'))
