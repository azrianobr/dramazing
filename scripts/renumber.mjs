#!/usr/bin/env node
// 中途插入镜头：把一段里第 N 切及以后的镜头号整体后移，空出位置给新镜头。
// 改名首帧 frames/<段>/f<号>*.png、原片 <dir>/<段>/s<号>*.mp4，改写 fix.json、prompts.json、shots.json 里这一段的镜头号。
// 不改 storyboard.json（新镜头由人写进分镜）和 _logs/（记录是历史，保持当时的编号）。
// 来由：《真的》中途插了 4 个镜头，手工改号漏了 prompts.json / shots.json，剪辑按旧编号认台词，片长不对。

import { existsSync, readdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { T, flag, loadWork, readOpt, segmentsOf, writeJson } from './lib.mjs';

const argv = process.argv.slice(2);
if (!flag(argv, '--work') || !flag(argv, '--seg') || !flag(argv, '--insert')) {
  console.log(T(`renumber.mjs --work <作品目录> --seg <段号> --insert <N> [--count 1] [--dir video] [--dry]
  第 N 切及以后的镜头号加 count，空出 N … N+count-1 给新镜头。--dry 只列出要改的，不动文件。
  要去掉一个镜头，在 fix.json 的 skip 里写它的号，不用改号。`, `renumber.mjs --work <work dir> --seg <segment> --insert <N> [--count 1] [--dir video] [--dry]
  Adds count to the number of cut N and every later cut, freeing N … N+count-1 for new cuts. --dry lists the changes without touching files.
  To drop a cut, put its number in skip in fix.json; no renumbering needed.`, `renumber.mjs --work <작품 폴더> --seg <구간> --insert <N> [--count 1] [--dir video] [--dry]
  N번 컷과 그 뒤 컷 번호에 count를 더해 N … N+count-1을 새 컷 자리로 비웁니다. --dry는 바꿀 것만 보여 주고 파일은 건드리지 않습니다.
  컷 하나를 빼려면 번호를 바꾸지 말고 fix.json의 skip에 그 번호를 씁니다.`));
  process.exit(0);
}
const W = loadWork(flag(argv, '--work'));
const seg = flag(argv, '--seg');
const at = Number(flag(argv, '--insert'));
const k = Number(flag(argv, '--count', '1'));
const dir = resolve(W.work, flag(argv, '--dir', 'video'));
const dry = argv.includes('--dry');
if (!(Number.isInteger(at) && at >= 1 && Number.isInteger(k) && k >= 1)) {
  console.error(T('--insert 和 --count 要是正整数', '--insert and --count must be positive integers', '--insert와 --count는 양의 정수여야 합니다'));
  process.exit(1);
}
const shift = (n) => (n >= at ? n + k : n);
const log = (s) => console.log((dry ? '[dry] ' : '') + s);

// 1. 文件：f3.png、f3.v1.png → f5.png、f5.v1.png；s3.mp4、s3.old.mp4 → s5.mp4、s5.old.mp4
const moves = [];
for (const [folder, letter] of [[join(W.work, 'frames', seg), 'f'], [join(dir, seg), 's']]) {
  if (!existsSync(folder)) continue;
  for (const name of readdirSync(folder)) {
    const m = name.match(new RegExp(`^${letter}(\\d+)(\\..+)$`));
    if (m && Number(m[1]) >= at) moves.push([join(folder, name), join(folder, `${letter}${shift(Number(m[1]))}${m[2]}`)]);
  }
}
// 先挪到临时名再挪到新名，号码前后重叠时不会互相覆盖
const tmp = moves.map(([from], i) => `${from}.renumber-${process.pid}-${i}`);
for (const [i, [from, to]] of moves.entries()) {
  log(`${from.slice(W.work.length + 1)} → ${to.slice(W.work.length + 1)}`);
  if (!dry) renameSync(from, tmp[i]);
}
if (!dry) moves.forEach(([, to], i) => renameSync(tmp[i], to));

// 2. fix.json：skip 列表、fix / in / speed / extra 的键（subs 按台词认，不动）
const fixFile = join(dir, 'fix.json');
const fix = readOpt(fixFile);
if (fix[seg]) {
  const f = fix[seg];
  const next = {};
  for (const [key, v] of Object.entries(f)) {
    if (key === 'skip') next.skip = v.map(shift);
    else if (key === 'subs') next.subs = v; // 手改字幕按台词原文认，和镜头号无关
    else if (v && typeof v === 'object' && !Array.isArray(v)) next[key] = Object.fromEntries(Object.entries(v).map(([n, x]) => [String(shift(Number(n))), x]));
    else next[key] = v;
  }
  log(`fix.json ${seg}: ${JSON.stringify(f)} → ${JSON.stringify(next)}`);
  fix[seg] = next;
  if (!dry) writeJson(fixFile, fix);
}

// 3. prompts.json / shots.json：键 E01-01/s3 → E01-01/s5，prompts 的 img 跟着改
for (const file of ['prompts.json', 'shots.json']) {
  const path = join(dir, file);
  if (!existsSync(path)) continue;
  const data = readOpt(path);
  let changed = 0;
  const out = {};
  for (const [key, v] of Object.entries(data)) {
    const m = key.match(/^(.+)\/s(\d+)$/);
    if (!m || m[1] !== seg || Number(m[2]) < at) { out[key] = v; continue; }
    const n = shift(Number(m[2]));
    const nv = v && typeof v === 'object' && typeof v.img === 'string'
      ? { ...v, img: v.img.replace(new RegExp(`(^|/)${seg}/f${m[2]}\\.png$`), `$1${seg}/f${n}.png`) } : v;
    out[`${seg}/s${n}`] = nv; changed++;
  }
  log(T(`${file}：${changed} 条改号`, `${file}: ${changed} entries renumbered`, `${file}: ${changed}개 번호 변경`));
  if (!dry && changed) writeJson(path, out);
}

// 4. 对一下分镜：新镜头写进 storyboard.json 后，切数应等于改号后最大的号
const cuts = segmentsOf(W.storyboard, Number(seg.match(/^E(\d+)/)?.[1]))?.find((s) => s.id === seg)?.cuts?.length;
const top = Math.max(0, ...moves.map(([, to]) => Number(to.match(/[fs](\d+)\.[^/]*$/)[1])));
if (cuts != null && top > cuts) console.log(T(`⚠️ storyboard.json 里 ${seg} 只有 ${cuts} 切，改号后最大到 ${top}：把新镜头写进分镜`, `⚠️ storyboard.json has ${cuts} cuts in ${seg}, but numbers now reach ${top}: add the new cuts to the storyboard`, `⚠️ storyboard.json의 ${seg}에는 ${cuts}컷뿐인데 번호가 ${top}까지 갑니다: 새 컷을 콘티에 넣으세요`));
console.log(T(`接下来：
  1. 把新镜头写进 storyboard.json（第 ${at}${k > 1 ? `–${at + k - 1}` : ''} 切）。
  2. node scripts/frames.mjs plan --work <作品目录> --eps <集> --force   # 重建任务单，已有的图记为完成
  3. node scripts/video-prompts.mjs --work <作品目录> --ep <集>          # 补上新镜头的提示词；已有条目不覆盖
     分镜里旧镜头的台词或时长也改了，就把 prompts.json / shots.json 先备份，再加 --force 重出一份。
  _logs/ 里的记录保持旧编号。`, `Next:
  1. Add the new cuts to storyboard.json (cut ${at}${k > 1 ? `–${at + k - 1}` : ''}).
  2. node scripts/frames.mjs plan --work <work dir> --eps <ep> --force   # rebuild the task list; existing images count as done
  3. node scripts/video-prompts.mjs --work <work dir> --ep <ep>          # fill in prompts for the new cuts; existing entries are kept
     If the lines or lengths of old cuts changed too, back up prompts.json / shots.json and run again with --force.
  Records in _logs/ keep the old numbers.`, `다음 단계:
  1. 새 컷을 storyboard.json에 넣습니다(${at}${k > 1 ? `–${at + k - 1}` : ''}번 컷).
  2. node scripts/frames.mjs plan --work <작품 폴더> --eps <화> --force   # 작업 목록을 다시 만듭니다. 있는 그림은 완료로 표시
  3. node scripts/video-prompts.mjs --work <작품 폴더> --ep <화>          # 새 컷의 프롬프트를 채웁니다. 있는 항목은 덮어쓰지 않음
     옛 컷의 대사나 길이도 바뀌었다면 prompts.json / shots.json을 백업한 뒤 --force로 다시 만듭니다.
  _logs/의 기록은 옛 번호를 유지합니다.`));
