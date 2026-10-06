#!/usr/bin/env node
// 把一集的段视频（cut.py 剪好的 <dir>/E02-01.mp4 …）按顺序拼成整集：统一响度、固定 48kHz，
// 台词按剧本原文出 SRT（--align 用 whisper 对齐到实际说话时间），封一版软字幕，再烧一版硬字幕成片。
// 用法：assemble.mjs --work <作品目录> --ep 1 [--dir video] [--loudnorm] [--align] [--no-burn]

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGS, T, alignLines, cutStarts, episodeScenes, flag, lang, loadWork, segmentsOf, speakable } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));


function ffprobe(file) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const v = j.streams.find((s) => s.codec_type === 'video') ?? {};
  return { width: v.width, height: v.height, duration: Number(j.format.duration), audio: j.streams.some((s) => s.codec_type === 'audio') };
}

// 剧本台词里的破折号：中文会被视频模型念成「一」（Grok 实测），提示词里已换成逗号；字幕跟着念法走（speakable）

// 每切在段内的起点：有 cut.py 的 <段>.shots.json 就用实际剪接时长（台词说完才切，常比分镜长），
// 被 skip 的切起点并到下一个镜头；没有就用分镜时长
function cutStartsActual(dir, seg) {
  const plan = cutStarts(seg.cuts);
  const f = join(dir, `${seg.id}.shots.json`);
  if (!existsSync(f)) return plan;
  const shots = JSON.parse(readFileSync(f, 'utf8'));
  const at = new Map();
  let t = 0;
  for (const s of shots) { at.set(s.shot, t); t += s.dur; }
  const starts = [];
  for (let i = seg.cuts.length - 1; i >= 0; i--) starts[i] = at.get(i + 1) ?? (starts[i + 1] ?? t);
  return starts;
}

const srtTime = (t) => {
  const ms = Math.round(t * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

// whisper.cpp + silero VAD：识别一段视频里每句话的实际起止，字幕文字仍用剧本原文
const WHISPER_DIR = process.env.WHISPER_MODELS ?? join(process.env.HOME, 'models/whisper');
function speechPieces(file) {
  const tmp = join(tmpdir(), `align-${process.pid}`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', file, '-ar', '16000', '-ac', '1', `${tmp}.wav`]);
  execFileSync('whisper-cli', ['-m', join(WHISPER_DIR, 'ggml-large-v3-turbo.bin'), '-l', LANGS[lang()].whisper, '-f', `${tmp}.wav`,
    '--vad', '-vm', join(WHISPER_DIR, 'ggml-silero-v5.1.2.bin'), '-oj', '-of', tmp], { stdio: 'ignore' });
  const j = JSON.parse(readFileSync(`${tmp}.json`, 'utf8'));
  return j.transcription.map((s) => ({ from: s.offsets.from / 1000, to: s.offsets.to / 1000, text: s.text }));
}

// 配乐与音效（分镜里这一集的 audio）：每条按集时间轴 at 秒放进去，from/dur 取素材的一段，
// gain 调音量（dB），fadeIn/fadeOut 淡入淡出；duck 给负 dB，有字幕（台词）的时段自动压低，前后各留一点缓坡
function mixAudio(work, base, entries, subs, loudnorm) {
  const inputs = [];
  const chains = [];
  entries.forEach((e, i) => {
    const f = resolve(work, e.file);
    inputs.push('-i', f);
    const from = e.from ?? 0;
    const dur = e.dur ?? Math.max(0.1, ffprobe(f).duration - from);
    const at = e.at ?? 0;
    const fi = e.fadeIn ?? 0;
    const fo = e.fadeOut ?? 0;
    let c = `[${i + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=start=${from}:duration=${dur},asetpts=PTS-STARTPTS`;
    if (fi) c += `,afade=t=in:st=0:d=${fi}`;
    if (fo) c += `,afade=t=out:st=${Math.max(0, dur - fo)}:d=${fo}`;
    if (e.gain) c += `,volume=${e.gain}dB`;
    c += `,adelay=${Math.round(at * 1000)}:all=1`;
    if (e.duck) {
      const lo = 10 ** (e.duck / 20);
      const win = subs.filter((s) => s.to > at && s.from < at + dur);
      if (win.length) {
        const r = win.map((s) => `clip(min((t-${(s.from - 0.15).toFixed(3)})/0.15\\,(${(s.to + 0.3).toFixed(3)}-t)/0.3)\\,0\\,1)`);
        const d = r.reduce((a, b) => `max(${a}\\,${b})`);
        c += `,volume='1-${(1 - lo).toFixed(4)}*${d}':eval=frame`;
      }
    }
    chains.push(`${c}[m${i}]`);
  });
  const mix = `[0:a]aformat=sample_rates=48000:channel_layouts=stereo[p];[p]${entries.map((_, i) => `[m${i}]`).join('')}amix=inputs=${entries.length + 1}:duration=first:normalize=0${loudnorm ? ',loudnorm=I=-16:TP=-1.5:LRA=11' : ''}[a]`;
  const tmp = `${base}.mixing.mp4`;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', `${base}.mp4`, ...inputs, '-filter_complex', [...chains, mix].join(';'),
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', tmp]);
  renameSync(tmp, `${base}.mp4`);
  console.log(T(`  配乐/音效 ${entries.length} 条已混入`, `  ${entries.length} music/sound entries mixed in`, `  배경음/효과음 ${entries.length}개 믹스 완료`));
}

function cmdAssemble(argv) {
  const W = loadWork(flag(argv, '--work'));
  const work = W.work;
  const epNo = Number(flag(argv, '--ep', '1'));
  const scenes = episodeScenes(W.script, epNo);
  const dir = resolve(work, flag(argv, '--dir', 'video'));
  const loudnorm = argv.includes('--loudnorm');
  const align = argv.includes('--align');
  const parts = [];
  const subs = [];
  let offset = 0;
  // 片头片尾（分镜里这一集的 intro / outro）：作品目录里现成的视频，原样接在正片首尾，字幕时间跟着顺延
  const epSb = W.storyboard.episodes?.find((e) => e.ep === epNo) ?? {};
  const bumper = (k) => {
    if (!epSb[k]) return null;
    const f = resolve(work, epSb[k]);
    if (!existsSync(f)) {
      console.log(T(`✗ 分镜里的 ${k} 素材 ${epSb[k]} 不存在`, `✗ ${k} file ${epSb[k]} from the storyboard is missing`, `✗ 콘티의 ${k} 소재 ${epSb[k]}이(가) 없습니다`));
      process.exit(1);
    }
    return f;
  };
  const intro = bumper('intro');
  const outro = bumper('outro');
  for (const a of epSb.audio ?? []) {
    if (!existsSync(resolve(work, a.file ?? ''))) {
      console.log(T(`✗ 分镜里的 audio 素材 ${a.file} 不存在`, `✗ audio file ${a.file} from the storyboard is missing`, `✗ 콘티의 audio 소재 ${a.file}이(가) 없습니다`));
      process.exit(1);
    }
  }
  if (intro) { parts.push(intro); offset += ffprobe(intro).duration; }
  for (const seg of segmentsOf(W.storyboard, epNo)) {
    const f = join(dir, `${seg.id}.mp4`);
    if (!existsSync(f)) {
      console.log(T(`✗ 缺 ${seg.id}.mp4，先跑 cut.py`, `✗ Missing ${seg.id}.mp4; run cut.py first`, `✗ ${seg.id}.mp4가 없습니다. 먼저 cut.py를 실행하세요`));
      process.exit(1);
    }
    const dur = ffprobe(f).duration;
    // 台词时间：同一切内按节拍秒数顺排，切起点来自分镜结构
    const scene = scenes[seg.scene - 1];
    const starts = cutStartsActual(dir, seg);
    const lines = [];
    seg.cuts.forEach((c, ci) => {
      let t = starts[ci];
      for (const b of scene.beats.filter((x) => x.n >= c.beats[0] && x.n <= c.beats[1])) {
        // 实际片长可能比分镜短（远程整段生成），字幕不越过本段结尾
        const end = Math.min(t + b.seconds, starts[ci + 1] ?? dur, dur);
        if (b.say && t < dur) lines.push({ from: t, to: end, text: speakable(b.say), win: [starts[ci], Math.min(starts[ci + 1] ?? dur, dur)] });
        t += b.seconds;
      }
    });
    if (align && lines.length) {
      const hit = alignLines(lines, speechPieces(f));
      // 前后两句不重叠，每句至少显示 1 秒，不越过这句所在切的结尾（字幕不压到下一切）
      lines.forEach((l, i) => {
        if (i > 0 && l.from < lines[i - 1].to) lines[i - 1].to = l.from;
        l.to = Math.min(Math.max(l.to + 0.3, l.from + 1), dur, Math.max(l.win[1], l.from + 1));
      });
      console.log(T(`  ${seg.id} 对齐 ${hit}/${lines.length} 句${hit < lines.length ? '（未识别的按分镜节拍）' : ''}`, `  ${seg.id} aligned ${hit}/${lines.length} lines${hit < lines.length ? ' (the rest follow the storyboard beats)' : ''}`, `  ${seg.id} 정렬 ${hit}/${lines.length}줄${hit < lines.length ? ' (나머지는 콘티 비트 기준)' : ''}`));
    }
    for (const l of lines) subs.push({ from: offset + l.from, to: offset + l.to, text: l.text });
    parts.push(f);
    offset += dur;
  }
  if (outro) parts.push(outro);
  const list = join(dir, `E${String(epNo).padStart(2, '0')}.concat.txt`);
  writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
  const base = join(dir, `E${String(epNo).padStart(2, '0')}`);
  // 字幕末尾的句号去掉（短剧字幕的习惯；哪些标点算句号见 langs.json 的 stripEnd），问号、感叹号、省略号保留
  const stripEnd = LANGS[lang()].stripEnd;
  const tidy = (t) => (stripEnd ? t.replace(new RegExp(`[${stripEnd}]+$`), '') : t);
  writeFileSync(`${base}.srt`, subs.map((s, i) => `${i + 1}\n${srtTime(s.from)} --> ${srtTime(s.to)}\n${tidy(s.text)}\n`).join('\n'));
  // 各段编码参数可能不完全一致，统一重编码再拼，避免 concat 花屏
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p',
    // loudnorm 会把采样率升到 192k，AAC 只能退到 96k，部分播放器会卡画面；固定 48k，并把索引放到文件头
    ...(loudnorm && !epSb.audio?.length ? ['-af', 'loudnorm=I=-16:TP=-1.5:LRA=11'] : []), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', `${base}.mp4`]);
  if (epSb.audio?.length) mixAudio(work, base, epSb.audio, subs, loudnorm);
  // 本机 ffmpeg 没编 libass，烧不了硬字幕：封一条 mov_text 软字幕轨（QuickTime / IINA 可开关），
  // 要硬字幕时换带 libass 的 ffmpeg 再用 subtitles 滤镜
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', `${base}.mp4`, '-i', `${base}.srt`,
    '-map', '0', '-map', '1', '-c', 'copy', '-c:s', 'mov_text', '-metadata:s:s:0', `language=${LANGS[lang()].iso3}`, '-movflags', '+faststart', `${base}.subbed.mp4`]);
  const pr = ffprobe(`${base}.mp4`);
  const tgt = [].concat(W.script.episodes.find((e) => e.ep === epNo)?.targetSeconds ?? W.project.targetSeconds ?? '?').join('–');
  console.log(T(`✓ 第 ${epNo} 集 ${parts.length} 段 → ${base}.mp4（${pr.duration.toFixed(1)} 秒，目标 ${tgt} 秒）`, `✓ Episode ${epNo}, ${parts.length} segments -> ${base}.mp4 (${pr.duration.toFixed(1)} s, target ${tgt} s)`, `✓ ${epNo}화 ${parts.length}개 시퀀스 -> ${base}.mp4 (${pr.duration.toFixed(1)}초, 목표 ${tgt}초)`));
  console.log(T(`  字幕 ${subs.length} 条 → ${base}.srt；带软字幕版 → ${base}.subbed.mp4`, `  ${subs.length} subtitles -> ${base}.srt; soft-subtitled copy -> ${base}.subbed.mp4`, `  자막 ${subs.length}개 -> ${base}.srt, 소프트 자막본 -> ${base}.subbed.mp4`));
  if (!argv.includes('--no-burn')) {
    execFileSync('python3', [join(HERE, 'burn-subs.py'), '--work', work, '--ep', String(epNo), '--dir', flag(argv, '--dir', 'video')], { stdio: 'inherit' });
  }
}

const argv = process.argv.slice(2);
if (!argv.includes('--work')) {
  console.log(T('assemble.mjs --work <作品目录> --ep <集> [--dir video] [--loudnorm] [--align] [--no-burn]', 'assemble.mjs --work <work dir> --ep <episode> [--dir video] [--loudnorm] [--align] [--no-burn]', 'assemble.mjs --work <작품 폴더> --ep <화> [--dir video] [--loudnorm] [--align] [--no-burn]'));
  process.exit(0);
}
cmdAssemble(argv);
