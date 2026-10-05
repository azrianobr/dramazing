#!/usr/bin/env node
// 分镜校验：出图前跑一遍。✗ 是必须改的错，⚠️ 是提醒（可以接受，但要知道）。
// 用法：validate.mjs --work <作品目录> --ep <集>

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cutBeats, episodeScenes, epTag, flag, loadWork, segmentsOf, speakSeconds } from './lib.mjs';

const argv = process.argv.slice(2);
if (!flag(argv, '--work')) { console.log('validate.mjs --work <作品目录> --ep <集>'); process.exit(0); }
const W = loadWork(flag(argv, '--work'));
const ep = Number(flag(argv, '--ep', '1'));
const err = [], warn = [];
const SIZES = ['extreme-wide', 'wide', 'full', 'medium', 'medium-close', 'close', 'extreme-close'];
const CAMERAS = ['Static Shot', 'Push In', 'Pull Out', 'Pan', 'Tilt', 'Rack Focus', 'Tracking Shot', 'Handheld', 'Crane', 'POV'];

const scenes = episodeScenes(W.script, ep);
for (const sc of scenes) {
  if (!W.scene.has(sc.scene)) err.push(`剧本第 ${sc.index} 场的场景 ${sc.scene} 不在 project.json 里`);
  for (const b of sc.beats) {
    if (b.who && !W.char.has(b.who)) err.push(`第 ${sc.index} 场第 ${b.n} 拍：说话人 ${b.who} 不在 project.json 里`);
    if (b.say && /——|—|--/.test(b.say)) err.push(`第 ${sc.index} 场第 ${b.n} 拍：台词有破折号，视频模型会念成「一」，改成逗号`);
    if (b.tone && /[，。]?(抹|擦|拍|摸|握|拿|放下|站起|坐下|转身|走)/.test(b.tone)) warn.push(`第 ${sc.index} 场第 ${b.n} 拍：tone 里像是动作（${b.tone}），动作要单独写成一拍 act，tone 只写语气`);
  }
}

// 每场的节拍要被分镜按顺序完整覆盖，不重不漏
const covered = new Map(scenes.map((s) => [s.index, []]));
let total = 0;
for (const seg of segmentsOf(W.storyboard, ep)) {
  const sc = scenes[seg.scene - 1];
  if (!sc) { err.push(`${seg.id}：scene ${seg.scene} 在剧本第 ${ep} 集里不存在`); continue; }
  seg.cuts.forEach((c, i) => {
    const k = `${seg.id}/s${i + 1}`;
    total += c.seconds;
    if (!Array.isArray(c.beats) || c.beats.length !== 2 || c.beats[0] > c.beats[1]) { err.push(`${k}：beats 要写成 [起, 止]`); return; }
    covered.get(sc.index).push([...c.beats, k]);
    if (!c.frame?.trim()) err.push(`${k}：没写 frame（首帧画面）`);
    if (!c.action?.trim()) err.push(`${k}：没写 action（镜头里发生什么）`);
    if (!SIZES.includes(c.size)) err.push(`${k}：size「${c.size}」不认识，可选 ${SIZES.join(' / ')}`);
    if (c.camera && !CAMERAS.includes(c.camera)) err.push(`${k}：camera「${c.camera}」不认识，可选 ${CAMERAS.join(' / ')}`);
    for (const id of c.chars ?? []) if (!W.char.has(id)) err.push(`${k}：人物 ${id} 不在 project.json 里`);
    for (const id of c.props ?? []) if (!W.prop.has(id)) err.push(`${k}：道具 ${id} 不在 project.json 里`);
    if (c.seconds < 2 || c.seconds > 10) err.push(`${k}：${c.seconds} 秒，单切要在 2–10 秒之间`);
    const talk = cutBeats(sc, c).filter((b) => b.say).reduce((s, b) => s + speakSeconds(b.say), 0);
    if (talk > 10) err.push(`${k}：台词约 ${talk.toFixed(1)} 秒，一条视频最长 10 秒装不下，拆成两切`);
    else if (talk > c.seconds + 0.5) warn.push(`${k}：台词约 ${talk.toFixed(1)} 秒，分镜给 ${c.seconds} 秒，剪辑会按台词留长`);
    if (c.camera && !['Static Shot', 'Handheld'].includes(c.camera) && !c.move?.to && !c.move?.stop) warn.push(`${k}：${c.camera} 没写 move.to / move.stop，AI 会一直动`);
    if (['Pull Out', 'Pan', 'Rack Focus', 'Crane'].includes(c.camera)) warn.push(`${k}：${c.camera} 的首帧要画成运镜「起点」的构图，画成终点模型就没东西可动`);
    if (/年轻|少女|姑娘|女孩|学生/.test(c.frame ?? '') && !/成年/.test(c.frame ?? '') && ['close', 'extreme-close', 'medium-close'].includes(c.size))
      warn.push(`${k}：近景里的年轻人物没写「成年」，可能被判成未成年人而不出片`);
  });
}
for (const sc of scenes) {
  const spans = covered.get(sc.index);
  let next = 1;
  for (const [a, b, k] of spans) {
    if (a !== next) err.push(`第 ${sc.index} 场：${k} 从第 ${a} 拍开始，前面应接第 ${next} 拍（${a > next ? '漏了' : '重了'}）`);
    next = b + 1;
  }
  if (spans.length && next - 1 !== sc.beats.length) err.push(`第 ${sc.index} 场：分镜只覆盖到第 ${next - 1} 拍，剧本有 ${sc.beats.length} 拍`);
}
const target = W.script.episodes.find((e) => e.ep === ep)?.targetSeconds ?? W.project.targetSeconds;
const [lo, hi] = Array.isArray(target) ? target : [target, target];
if (lo && (total < lo * 0.9 || total > hi * 1.1)) warn.push(`整集分镜 ${total.toFixed(1)} 秒，目标 ${lo === hi ? lo : `${lo}–${hi}`} 秒`);
const missing = [...new Set(segmentsOf(W.storyboard, ep).flatMap((s) => s.cuts.flatMap((c) => c.chars ?? [])))]
  .filter((id) => !W.char.get(id)?.alias?.en);
if (missing.length) warn.push(`人物 ${missing.join('、')} 没写 alias.en：视频模型不认识人名，提示词里需要外貌短语`);
if (!existsSync(join(W.work, 'story.txt'))) warn.push('作品目录里没有 story.txt（原文），复盘和改编时没法对照');

console.log(`${epTag(ep)}：${segmentsOf(W.storyboard, ep).length} 段，${segmentsOf(W.storyboard, ep).reduce((s, g) => s + g.cuts.length, 0)} 切，${total.toFixed(1)} 秒`);
for (const e of err) console.log(`  ✗ ${e}`);
for (const w of warn) console.log(`  ⚠️ ${w}`);
if (!err.length) console.log(`  ✓ 没有必须改的错${warn.length ? `，${warn.length} 条提醒` : ''}`);
process.exit(err.length ? 1 : 0);
