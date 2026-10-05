#!/usr/bin/env node
// 出图：设定图（人物 / 场景 / 道具）和分镜图（每切一张首帧）。
// 任务单 tasks.json 记每张图的提示词、参考图和要放到哪里；用什么工具出图都行，图放到 target 就算完成。
// 出图方式（--provider，或 project.json 的 images.provider）：
//   manual  导出提示词，你用任何工具出图（ChatGPT、Midjourney、即梦、ComfyUI…），再用 place 放回来（默认）
//   cmd     调你自己的命令行，模板见 images.cmd，占位符 {prompt} {out} {refs} {work}
//   codex   Codex CLI 内置出图（实测过）
// 出过的图不重出，除非 --redo。

import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { episodeScenes, flag, loadWork, readJson, segmentsOf, writeJson } from './lib.mjs';

const USAGE = `frames.mjs — 出图

  plan  --work <作品目录> --eps 3[,4|1-6] [--force]
        按 project.json 和分镜建任务单 tasks.json：先设定图，再分镜图。已有任务单不覆盖，除非 --force
  batch --work <作品目录> [--provider manual|cmd|codex] [--only <正则>] [--redo] [--jobs 3]
        出任务单里还没出的图。参考图还没出的任务跳过，等下一轮。
        manual：把这一轮要出的图导出到 _handoff/images/，每张一个 .txt（提示词 + 参考图 + 放到哪）
  place --work <作品目录> --target <相对路径> --from <图片>
        把你出好的图（jpg / png / webp 都行）转成 PNG 放到 target，并在任务单里记为完成
  fix   --work <作品目录> --target <相对路径> --prompt <文件> [--ref <图> ...] [--provider cmd|codex]
        单张重画：提示词写「只改哪里」，参考图 1 一般放原图。旧图改名为 <名>.v<N>.png
  status --work <作品目录>`;

const flags = (argv, name) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []));
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

/* ---------------- 出图方式 ---------------- */

const fullPrompt = (prompt) => `${prompt}\n\n${TAIL}`;

// Codex CLI：让它用内置出图工具画一张，存到 out
function codex(work, tag, prompt, refs, out) {
  const rules = '请用你内置的图像生成工具直接生成一张图，不要写代码、不要调 API、不要用脚本作图。只生成一次。';
  const full = `${rules}生成完把图保存到当前目录下的 ${out}（不要覆盖其他文件），然后结束。\n\n${fullPrompt(prompt)}`;
  const args = ['exec', '--json', '--skip-git-repo-check', '-s', 'workspace-write', '-C', work,
    ...refs.flatMap((r) => ['-i', resolve(work, r)]), '-'];
  return run(work, tag, 'codex', args, full, out, (so) => {
    const m = [...so.matchAll(/"usage":(\{[^}]*\})/g)].pop();
    return m ? JSON.parse(m[1]) : null;
  });
}

// 自定义命令：提示词写进文件，占位符替换后交给 shell，在作品目录里执行
function cmdProvider(work, tag, prompt, refs, out, template) {
  if (!template) die('cmd 出图要在 project.json 写 images.cmd，或加 --cmd "<命令模板>"');
  const pf = join(work, '_logs', `prompt-${tag.replace(/[:/]/g, '_')}.txt`);
  mkdirSync(join(work, '_logs'), { recursive: true });
  writeFileSync(pf, fullPrompt(prompt));
  const q = (x) => `'${String(x).replace(/'/g, "'\\''")}'`;
  const line = template.replace(/\{prompt\}/g, q(pf)).replace(/\{out\}/g, q(out)).replace(/\{work\}/g, q(work))
    .replace(/\{refs\}/g, refs.map((r) => q(resolve(work, r))).join(' '));
  return run(work, tag, 'sh', ['-c', line], '', out, () => null);
}

function run(work, tag, bin, args, stdin, out, usageOf) {
  const logs = join(work, '_logs');
  mkdirSync(logs, { recursive: true });
  return new Promise((ok) => {
    const p = spawn(bin, args, { cwd: work, stdio: ['pipe', 'pipe', 'pipe'] });
    let so = '', se = '';
    p.stdout.on('data', (d) => (so += d));
    p.stderr.on('data', (d) => (se += d));
    p.on('error', (e) => (se += String(e)));
    p.stdin.end(stdin);
    p.on('close', (code) => {
      const usage = usageOf(so);
      appendFileSync(join(logs, 'images-usage.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), tag, bin, code, usage })}\n`);
      if (code) writeFileSync(join(logs, `img-${tag.replace(/[:/]/g, '_')}.err`), (se || so).slice(-4000));
      ok({ code, usage, made: existsSync(join(work, out)) });
    });
  });
}

function provider(argv, W) {
  const name = flag(argv, '--provider') ?? W.project.images?.provider ?? 'manual';
  if (!['manual', 'cmd', 'codex'].includes(name)) die(`没有这种出图方式：${name}（manual / cmd / codex）`);
  const template = flag(argv, '--cmd') ?? W.project.images?.cmd;
  return { name, make: name === 'codex' ? codex : (w, tag, p, refs, out) => cmdProvider(w, tag, p, refs, out, template) };
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
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', resolve(work, src), dest], { stdio: 'ignore' }); // 任何格式转成 PNG
  if (resolve(work, src).startsWith(join(work, '_logs'))) rmSync(resolve(work, src), { force: true }); // 只删自己的临时文件
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
  const W = loadWork(work);
  const pv = provider(argv, W);
  const only = flag(argv, '--only') ? new RegExp(flag(argv, '--only')) : null;
  const redo = argv.includes('--redo');
  const file = join(work, 'tasks.json');
  const plan = readJson(file);
  // --only 选中的图，加上它们要参照、还没出的设定图（设定图不跟 --redo 重出）
  const picked = new Set(plan.tasks.filter((t) => !only || only.test(t.id)));
  const needed = new Set([...picked].flatMap((t) => t.refs.map((r) => r.path)));
  const has = (t) => t.status === 'done' || existsSync(join(work, t.target));
  let todo = plan.tasks.filter((t) => (picked.has(t) ? redo || !has(t) : t.kind !== 'frame' && needed.has(t.target) && !has(t)));
  const ready = (t) => t.refs.every((r) => existsSync(join(work, r.path)));
  if (!todo.length) return console.log('· 没有要出的图（出过的不重出；要重出加 --redo）');
  if (pv.name === 'manual') {
    const runnable = todo.filter(ready);
    if (todo.length > runnable.length) console.log(`· ${todo.length - runnable.length} 张要等参考图（设定图）放好：先出这一轮，place 回来后再跑一次`);
    return exportManual(work, runnable);
  }
  // 自动出图分波次：先出参考图齐的（一般是设定图），出完再出依赖它们的分镜图
  for (let wave = 1; todo.length; wave++) {
    const runnable = todo.filter(ready);
    if (!runnable.length) { console.log(`· ${todo.length} 张的参考图没出成，停下（见上面的 ✗）`); break; }
    console.log(`· 第 ${wave} 波出 ${runnable.length} 张（${pv.name}）`);
    await pool(runnable, Number(flag(argv, '--jobs', '3')), async (t) => {
      const tmp = `_logs/out-${t.id.replace(/[:/]/g, '_')}.png`;
      rmSync(join(work, tmp), { force: true });
      const r = await pv.make(work, t.id, t.prompt, t.refs.map((x) => x.path), tmp);
      if (!r.made) return console.log(`✗ ${t.id} 没出图（exit ${r.code}，见 _logs/）`);
      const note = place(work, tmp, t.target);
      markDone(work, t.id);
      console.log(`✓ ${t.id} → ${t.target}  ${fmt(r.usage)}${note ? `  ⚠️ ${note}` : ''}`);
    });
    todo = todo.filter((t) => !runnable.includes(t));
  }
}

function markDone(work, id) {
  const file = join(work, 'tasks.json');
  if (!existsSync(file)) return;
  const cur = readJson(file); // 并发写：每次重读再写回自己这一条
  writeJson(file, { ...cur, tasks: cur.tasks.map((x) => (x.id === id || x.target === id ? { ...x, status: 'done' } : x)) }, { backup: false });
}

// 手动出图：每张图一个说明文件，写明提示词、按顺序上传哪些参考图、出好放到哪
function exportManual(work, tasks) {
  const dir = join(work, '_handoff', 'images');
  mkdirSync(dir, { recursive: true });
  for (const t of tasks) {
    const refs = t.refs.map((r, i) => `  参考图${i + 1}：${r.path}（${r.role}）`).join('\n') || '  无';
    writeFileSync(join(dir, `${t.id.replace(/[:/]/g, '_')}.txt`),
      `出好后放到：${t.target}\n（或运行 node scripts/frames.mjs place --work <作品目录> --target ${t.target} --from <下载的图>）\n\n参考图（按顺序上传）：\n${refs}\n\n提示词：\n${fullPrompt(t.prompt)}\n`);
  }
  console.log(`· 已导出 ${tasks.length} 份出图说明 → ${dir}\n  用任何出图工具按说明出图，再用 place 放回；放好的图下一轮自动跳过`);
}

function cmdPlace(argv) {
  const work = resolve(flag(argv, '--work'));
  const target = flag(argv, '--target') ?? die('缺 --target');
  const from = resolve(flag(argv, '--from') ?? die('缺 --from'));
  if (!existsSync(from)) die(`找不到 ${from}`);
  const note = place(work, from, target);
  markDone(work, target);
  console.log(`✓ ${target}${note ? `  ⚠️ ${note}` : ''}`);
}

async function cmdFix(argv) {
  const work = resolve(flag(argv, '--work'));
  const pv = provider(argv, loadWork(work));
  if (pv.name === 'manual') die('手动出图：按原图和修改说明在你的工具里重画，再用 place 放回');
  const target = flag(argv, '--target') ?? die('缺 --target');
  const prompt = readFileSync(flag(argv, '--prompt') ?? die('缺 --prompt'), 'utf8');
  const tmp = `_logs/fix-${target.replace(/[/]/g, '_')}`;
  rmSync(join(work, tmp), { force: true });
  const r = await pv.make(work, `fix:${target}`, prompt, flags(argv, '--ref'), tmp);
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
else if (cmd === 'place') cmdPlace(rest);
else if (cmd === 'status') cmdStatus(rest);
else console.log(USAGE);
