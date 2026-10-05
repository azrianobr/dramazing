#!/usr/bin/env node
// 出图：设定图（人物 / 场景 / 道具）和分镜图（每切一张首帧），用 Codex CLI 的内置出图。
// 任务单 tasks.json 记每张图的提示词、参考图和状态；出过的图不重出，除非 --redo。

import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { episodeScenes, flag, loadWork, readJson, segmentsOf, writeJson } from './lib.mjs';

const USAGE = `frames.mjs — 出图

  plan  --work <作品目录> --eps 3[,4|1-6] [--force]
        按 project.json 和分镜建任务单 tasks.json：先设定图，再分镜图。已有任务单不覆盖，除非 --force
  batch --work <作品目录> [--only <正则>] [--redo] [--jobs 3]
        出任务单里还没出的图。参考图还没出的任务跳过，等下一轮
  fix   --work <作品目录> --target <相对路径> --prompt <文件> [--ref <图> ...]
        单张重画：提示词写「只改哪里」，参考图 1 一般放原图。旧图改名为 <名>.v<N>.png
  status --work <作品目录>`;

const flags = (argv, name) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []));
const RULES = '请用你内置的图像生成工具直接生成一张图，不要写代码、不要调 API、不要用脚本作图。只生成一次。';
const TAIL = '画面比例 16:9 横幅，只要一张完整的画面：不加任何文字、水印和边框。';

/* ---------------- plan ---------------- */

function parseEps(spec) {
  const out = new Set();
  for (const part of String(spec).split(',')) {
    const [a, b] = part.split('-').map(Number);
    for (let i = a; i <= (b || a); i++) out.add(i);
  }
  return [...out];
}

function cmdPlan(argv) {
  const W = loadWork(flag(argv, '--work'));
  const file = join(W.work, 'tasks.json');
  if (existsSync(file) && !argv.includes('--force')) die('tasks.json 已存在（里面有进度）。确定要重建就加 --force');
  const style = (W.project.style ?? '').trim();
  const withStyle = (t) => (style ? `${style}\n\n${t}` : t);
  const sheets = new Map(), frames = [], problems = [];
  const KIND = { char: ['人物', W.char], scene: ['场景', W.scene], prop: ['道具', W.prop] };
  const sheet = (kind, id) => {
    const key = `sheet:${id}`;
    if (sheets.has(key)) return sheets.get(key);
    const [label, map] = KIND[kind], item = map.get(id);
    if (!item?.sheet) { problems.push(`${label} ${id} 没有设定图提示词（sheet），跳过`); sheets.set(key, null); return null; }
    const t = { id: key, kind, ref: id, name: item.name, target: `sheets/${id}.png`, prompt: withStyle(item.sheet), refs: [], status: 'pending' };
    sheets.set(key, t);
    return t;
  };
  const eps = parseEps(flag(argv, '--eps') ?? die('缺 --eps'));
  for (const ep of eps) {
    const scenes = episodeScenes(W.script, ep);
    for (const seg of segmentsOf(W.storyboard, ep)) {
      const sc = scenes[seg.scene - 1];
      if (!sc) { problems.push(`${seg.id} 的 scene ${seg.scene} 在剧本里找不到`); continue; }
      const place = sheet('scene', sc.scene);
      seg.cuts.forEach((c, ci) => {
        // 挂图顺序：场景 → 人物 → 道具；非首切再挂本段第一张分镜图，锁住光线和站位
        const refs = [];
        if (place) refs.push({ path: place.target, role: `场景「${place.name}」设定图：环境、材质、光线照此${sc.light ? `（此刻光照：${sc.light}）` : ''}` });
        for (const t of (c.chars ?? []).map((x) => sheet('char', x)).filter(Boolean)) refs.push({ path: t.target, role: `${t.name}的人物设定图：脸、发型、衣服照此` });
        for (const t of (c.props ?? []).map((x) => sheet('prop', x)).filter(Boolean)) refs.push({ path: t.target, role: `道具「${t.name}」设定图：外形、材质照此` });
        if (ci > 0) refs.push({ path: `frames/${seg.id}/f1.png`, role: '本段第一张分镜图：光线、雾气浓度、人物站位照此连续' });
        const head = refs.map((r, i) => `参考图${i + 1} = ${r.role}`).join('\n');
        frames.push({ id: `frame:${seg.id}/f${ci + 1}`, kind: 'frame', target: `frames/${seg.id}/f${ci + 1}.png`,
          prompt: withStyle(`${head ? `${head}\n\n` : ''}画面：${c.frame}`), refs, status: 'pending' });
      });
    }
  }
  const order = { scene: 0, char: 1, prop: 2 };
  const list = [...sheets.values()].filter(Boolean).sort((a, b) => order[a.kind] - order[b.kind] || a.ref.localeCompare(b.ref));
  // 已经存在的图记为完成，重建任务单不会让它们重画
  const tasks = [...list, ...frames].map((t) => (existsSync(join(W.work, t.target)) ? { ...t, status: 'done' } : t));
  writeJson(file, { episodes: eps, style, createdAt: new Date().toISOString(), problems, tasks });
  const open = tasks.filter((t) => t.status !== 'done');
  console.log(`✓ 第 ${eps.join(',')} 集：设定图 ${list.length} + 分镜图 ${frames.length}，待出 ${open.length} 张 → ${file}`);
  if (!style) console.log('  ⚠️ project.json 没写 style（画风前缀），整批画风会不统一');
  for (const p of problems) console.log(`  ⚠️ ${p}`);
}

/* ---------------- codex ---------------- */

function codex(work, tag, prompt, refs, out) {
  const logs = join(work, '_logs');
  mkdirSync(logs, { recursive: true });
  const full = `${RULES}生成完把图保存到当前目录下的 ${out}（不要覆盖其他文件），然后结束。\n\n${prompt}\n\n${TAIL}`;
  const args = ['exec', '--json', '--skip-git-repo-check', '-s', 'workspace-write', '-C', work,
    ...refs.flatMap((r) => ['-i', resolve(work, r)]), '-'];
  return new Promise((ok) => {
    const p = spawn('codex', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let so = '', se = '';
    p.stdout.on('data', (d) => (so += d));
    p.stderr.on('data', (d) => (se += d));
    p.stdin.end(full);
    p.on('close', (code) => {
      const m = [...so.matchAll(/"usage":(\{[^}]*\})/g)].pop();
      const usage = m ? JSON.parse(m[1]) : null;
      appendFileSync(join(logs, 'codex-usage.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), tag, code, usage })}\n`);
      if (code) writeFileSync(join(logs, `codex-${tag.replace(/[:/]/g, '_')}.err`), se.slice(-4000));
      ok({ code, usage, made: existsSync(join(work, out)) });
    });
  });
}

// PNG 头里读宽高；比例偏离 16:9 超过 3% 只提醒，不拦
function pngSize(file) {
  const b = readFileSync(file);
  return b.subarray(1, 4).toString() === 'PNG' ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null;
}

/** 把出好的图转成 PNG 放到 target；target 已有旧图时改名为 .v<N>.png */
function place(work, src, target) {
  const dest = join(work, target);
  mkdirSync(join(dest, '..'), { recursive: true });
  if (existsSync(dest)) {
    let n = 1;
    while (existsSync(dest.replace(/\.png$/, `.v${n}.png`))) n++;
    renameSync(dest, dest.replace(/\.png$/, `.v${n}.png`));
  }
  execFileSync('sips', ['-s', 'format', 'png', join(work, src), '--out', dest], { stdio: 'ignore' }); // macOS 自带
  rmSync(join(work, src), { force: true });
  const s = pngSize(dest);
  return s && Math.abs(s.w / s.h - 16 / 9) / (16 / 9) > 0.03 ? `比例 ${s.w}×${s.h} 不是 16:9` : '';
}

async function pool(items, jobs, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

const fmt = (u) => (u ? `输入 ${(u.input_tokens / 1e4).toFixed(1)} 万 / 输出 ${u.output_tokens}` : '无用量');

async function cmdBatch(argv) {
  const work = resolve(flag(argv, '--work'));
  const only = flag(argv, '--only') ? new RegExp(flag(argv, '--only')) : null;
  const redo = argv.includes('--redo');
  const file = join(work, 'tasks.json');
  const plan = readJson(file);
  const todo = plan.tasks.filter((t) => (!only || only.test(t.id)) && (redo || (t.status !== 'done' && !existsSync(join(work, t.target)))));
  const runnable = todo.filter((t) => t.refs.every((r) => existsSync(join(work, r.path))));
  if (todo.length > runnable.length) console.log(`· ${todo.length - runnable.length} 张的参考图还没出，跳过`);
  console.log(`· 本轮出 ${runnable.length} 张`);
  await pool(runnable, Number(flag(argv, '--jobs', '3')), async (t) => {
    const tmp = `_logs/out-${t.id.replace(/[:/]/g, '_')}.png`;
    rmSync(join(work, tmp), { force: true });
    const r = await codex(work, t.id, t.prompt, t.refs.map((x) => x.path), tmp);
    if (!r.made) return console.log(`✗ ${t.id} 没出图（exit ${r.code}，见 _logs/）`);
    const note = place(work, tmp, t.target);
    const cur = readJson(file); // 并发写：每次重读再写回自己这一条
    writeJson(file, { ...cur, tasks: cur.tasks.map((x) => (x.id === t.id ? { ...x, status: 'done' } : x)) }, { backup: false });
    console.log(`✓ ${t.id} → ${t.target}  ${fmt(r.usage)}${note ? `  ⚠️ ${note}` : ''}`);
  });
}

async function cmdFix(argv) {
  const work = resolve(flag(argv, '--work'));
  const target = flag(argv, '--target') ?? die('缺 --target');
  const prompt = readFileSync(flag(argv, '--prompt') ?? die('缺 --prompt'), 'utf8');
  const tmp = `_logs/fix-${target.replace(/[/]/g, '_')}`;
  rmSync(join(work, tmp), { force: true });
  const r = await codex(work, `fix:${target}`, prompt, flags(argv, '--ref'), tmp);
  if (!r.made) return console.log(`✗ ${target} 没出图（exit ${r.code}，见 _logs/）`);
  const note = place(work, tmp, target);
  console.log(`✓ ${target}  ${fmt(r.usage)}${note ? `  ⚠️ ${note}` : ''}`);
}

function cmdStatus(argv) {
  const plan = readJson(join(resolve(flag(argv, '--work')), 'tasks.json'));
  const c = {};
  for (const t of plan.tasks) c[t.status] = (c[t.status] ?? 0) + 1;
  console.log(`第 ${plan.episodes.join(',')} 集：共 ${plan.tasks.length} 张`, c);
}

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'plan') cmdPlan(rest);
else if (cmd === 'batch') await cmdBatch(rest);
else if (cmd === 'fix') await cmdFix(rest);
else if (cmd === 'status') cmdStatus(rest);
else console.log(USAGE);
