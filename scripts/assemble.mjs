#!/usr/bin/env node
// 把一集的段视频（cut.py 剪好的 <dir>/E02-01.mp4 …）按顺序拼成整集：统一响度、固定 48kHz，
// 台词按剧本原文出 SRT（--align 用 whisper 对齐到实际说话时间），封一版软字幕，再烧一版硬字幕成片。
// 用法：assemble.mjs --work <作品目录> --ep 1 [--dir video] [--loudnorm] [--align] [--no-burn]

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cutStarts, episodeScenes, flag, loadWork, segmentsOf, speakable } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));


function ffprobe(file) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const v = j.streams.find((s) => s.codec_type === 'video') ?? {};
  return { width: v.width, height: v.height, duration: Number(j.format.duration), audio: j.streams.some((s) => s.codec_type === 'audio') };
}

// 剧本台词里的破折号 Grok 会念成「一」，提示词里已换成逗号；字幕跟着念法走（speakable）

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
const norm = (s) => s.replace(/[^\p{Script=Han}\p{L}\p{N}]/gu, '');
function speechPieces(file) {
  const tmp = join(tmpdir(), `align-${process.pid}`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', file, '-ar', '16000', '-ac', '1', `${tmp}.wav`]);
  execFileSync('whisper-cli', ['-m', join(WHISPER_DIR, 'ggml-large-v3-turbo.bin'), '-l', 'zh', '-f', `${tmp}.wav`,
    '--vad', '-vm', join(WHISPER_DIR, 'ggml-silero-v5.1.2.bin'), '-oj', '-of', tmp], { stdio: 'ignore' });
  const j = JSON.parse(readFileSync(`${tmp}.json`, 'utf8'));
  return j.transcription.map((s) => ({ from: s.offsets.from / 1000, to: s.offsets.to / 1000, text: norm(s.text) }))
    .filter((p) => p.text);
}
// 识别片段按出现顺序单调地挂到台词上：片段字符落在哪句台词里最多就归哪句（只往后看两句，平分归后一句）。
// VAD 切出的片段会把前面的静音也并进来，起点按字数从片段末尾倒推（约 0.3 秒/字）
function alignLines(lines, pieces) {
  const score = (p, l) => [...p.text].filter((ch) => norm(l.text).includes(ch)).length / p.text.length;
  let li = 0;
  for (const p of pieces) {
    let best = -1, bs = 0.34;
    for (let k = li; k < Math.min(li + 3, lines.length); k++) if (score(p, lines[k]) > bs || (k > li && score(p, lines[k]) === bs && bs > 0.34)) { bs = score(p, lines[k]); best = k; }
    if (best < 0) continue;
    li = best;
    const l = lines[best];
    if (!l.hit) { l.hit = true; l.from = Math.max(p.from, p.to - 0.3 * p.text.length - 0.2); }
    l.to = p.to;
  }
  return lines.filter((l) => l.hit).length;
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
  for (const seg of segmentsOf(W.storyboard, epNo)) {
    const f = join(dir, `${seg.id}.mp4`);
    if (!existsSync(f)) {
      console.log(`✗ 缺 ${seg.id}.mp4，先跑 video`);
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
        if (b.say && t < dur) lines.push({ from: t, to: end, text: speakable(b.say) });
        t += b.seconds;
      }
    });
    if (align && lines.length) {
      const hit = alignLines(lines, speechPieces(f));
      // 前后两句不重叠，每句至少显示 1 秒
      lines.forEach((l, i) => {
        if (i > 0 && l.from < lines[i - 1].to) lines[i - 1].to = l.from;
        l.to = Math.min(Math.max(l.to + 0.3, l.from + 1), dur);
      });
      console.log(`  ${seg.id} 对齐 ${hit}/${lines.length} 句${hit < lines.length ? '（未识别的按分镜节拍）' : ''}`);
    }
    for (const l of lines) subs.push({ from: offset + l.from, to: offset + l.to, text: l.text });
    parts.push(f);
    offset += dur;
  }
  const list = join(dir, `E${String(epNo).padStart(2, '0')}.concat.txt`);
  writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
  const base = join(dir, `E${String(epNo).padStart(2, '0')}`);
  writeFileSync(`${base}.srt`, subs.map((s, i) => `${i + 1}\n${srtTime(s.from)} --> ${srtTime(s.to)}\n${s.text}\n`).join('\n'));
  // 各段编码参数可能不完全一致，统一重编码再拼，避免 concat 花屏
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p',
    // loudnorm 会把采样率升到 192k，AAC 只能退到 96k，部分播放器会卡画面；固定 48k，并把索引放到文件头
    ...(loudnorm ? ['-af', 'loudnorm=I=-16:TP=-1.5:LRA=11'] : []), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', `${base}.mp4`]);
  // 本机 ffmpeg 没编 libass，烧不了硬字幕：封一条 mov_text 软字幕轨（QuickTime / IINA 可开关），
  // 要硬字幕时换带 libass 的 ffmpeg 再用 subtitles 滤镜
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', `${base}.mp4`, '-i', `${base}.srt`,
    '-map', '0', '-map', '1', '-c', 'copy', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=chi', '-movflags', '+faststart', `${base}.subbed.mp4`]);
  const pr = ffprobe(`${base}.mp4`);
  console.log(`✓ 第 ${epNo} 集 ${parts.length} 段 → ${base}.mp4（${pr.duration.toFixed(1)} 秒，目标 ${[].concat(W.script.episodes.find((e) => e.ep === epNo)?.targetSeconds ?? W.project.targetSeconds ?? '?').join('–')} 秒）`);
  console.log(`  字幕 ${subs.length} 条 → ${base}.srt；带软字幕版 → ${base}.subbed.mp4`);
  if (!argv.includes('--no-burn')) {
    execFileSync('python3', [join(HERE, 'burn-subs.py'), '--work', work, '--ep', String(epNo), '--dir', flag(argv, '--dir', 'video')], { stdio: 'inherit' });
  }
}

const argv = process.argv.slice(2);
if (!argv.includes('--work')) {
  console.log('assemble.mjs --work <作品目录> --ep <集> [--dir video] [--loudnorm] [--align] [--no-burn]');
  process.exit(0);
}
cmdAssemble(argv);
