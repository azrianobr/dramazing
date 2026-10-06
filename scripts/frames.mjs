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
import { SHEET_ASPECT, episodeScenes, flag, insertOf, loadWork, parseAspect, phrases, readJson, segmentsOf, T, writeJson } from './lib.mjs';

const USAGE = () => T(`frames.mjs — 出图

  plan  --work <作品目录> --eps 3[,4|1-6] [--force]
        按 project.json 和分镜建任务单 tasks.json：先设定图，再分镜图。已有任务单不覆盖，除非 --force
  batch --work <作品目录> [--provider manual|cmd|codex] [--only <正则>] [--redo] [--jobs 3]
        出任务单里还没出的图。参考图还没出的任务跳过，等下一轮。
        manual：把这一轮要出的图导出到 _handoff/images/，每张一个 .txt（提示词 + 参考图 + 放到哪）
  place --work <作品目录> --target <相对路径> --from <图片>
        把你出好的图（jpg / png / webp 都行）转成 PNG 放到 target，并在任务单里记为完成
  fix   --work <作品目录> --target <相对路径> --prompt <文件> [--ref <图> ...] [--provider cmd|codex]
        单张重画：提示词写「只改哪里」，参考图 1 一般放原图。旧图改名为 <名>.v<N>.png
  status --work <作品目录>`,
`frames.mjs — images

  plan  --work <project dir> --eps 3[,4|1-6] [--force]
        Build tasks.json from project.json and the storyboard: sheets first, then frames. An existing tasks.json is kept unless --force
  batch --work <project dir> [--provider manual|cmd|codex] [--only <regex>] [--redo] [--jobs 3]
        Make the images not made yet. Tasks whose reference images are missing wait for the next round.
        manual: export this round to _handoff/images/, one .txt per image (prompt + references + where to put it)
  place --work <project dir> --target <relative path> --from <image>
        Convert your image (jpg / png / webp) to PNG at target and mark it done in tasks.json
  fix   --work <project dir> --target <relative path> --prompt <file> [--ref <image> ...] [--provider cmd|codex]
        Redraw one image: the prompt says only what to change; reference 1 is usually the original. The old image becomes <name>.v<N>.png
  status --work <project dir>`,
`frames.mjs — 이미지

  plan  --work <작품 폴더> --eps 3[,4|1-6] [--force]
        project.json과 콘티로 tasks.json을 만듭니다: 설정화 먼저, 그다음 콘티 그림. 이미 있으면 --force 없이는 덮어쓰지 않습니다
  batch --work <작품 폴더> [--provider manual|cmd|codex] [--only <정규식>] [--redo] [--jobs 3]
        아직 안 만든 그림을 만듭니다. 참고 이미지가 없는 작업은 다음 회차로 미룹니다.
        manual: 이번 회차를 _handoff/images/에 내보냅니다. 그림마다 .txt 하나(프롬프트 + 참고 이미지 + 넣을 위치)
  place --work <작품 폴더> --target <상대 경로> --from <이미지>
        만든 그림(jpg / png / webp)을 PNG로 바꿔 target에 넣고 tasks.json에 완료로 기록합니다
  fix   --work <작품 폴더> --target <상대 경로> --prompt <파일> [--ref <이미지> ...] [--provider cmd|codex]
        한 장 다시 그리기: 프롬프트에는 고칠 곳만 씁니다. 참고 이미지 1은 보통 원본. 원본은 <이름>.v<N>.png로 바뀝니다
  status --work <작품 폴더>`);

const flags = (argv, name) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []));
// 写给出图工具的固定句子按故事语言（lang/<语言>.mjs 的 img）；loadWork 之后才知道是哪种语言
let IMG = null, ASPECT = parseAspect();
const openWork = async (dir) => { const W = loadWork(dir); IMG = (await phrases()).img; ASPECT = W.aspect; return W; };
// 设定图（sheets/）固定 16:9，其余（分镜图）按作品画幅
const aspectFor = (target) => (String(target).startsWith('sheets/') ? parseAspect(SHEET_ASPECT) : ASPECT);

/* ---------------- plan ---------------- */

function parseEps(spec) {
  const out = new Set();
  for (const part of String(spec).split(',')) {
    const [a, b] = part.split('-').map(Number);
    for (let i = a; i <= (b || a); i++) out.add(i);
  }
  return [...out];
}

async function cmdPlan(argv) {
  const W = await openWork(flag(argv, '--work'));
  const file = join(W.work, 'tasks.json');
  if (existsSync(file) && !argv.includes('--force')) die(T('tasks.json 已存在（里面有进度）。确定要重建就加 --force', 'tasks.json already exists (it holds progress). Add --force to rebuild it', 'tasks.json이 이미 있습니다(진행 상황 포함). 다시 만들려면 --force를 붙이세요'));
  const style = (W.project.style ?? '').trim();
  const withStyle = (t) => (style ? `${style}\n\n${t}` : t);
  const sheets = new Map(), frames = [], problems = [];
  const KIND = { char: [T('人物', 'character', '인물'), W.char], scene: [T('场景', 'location', '장소'), W.scene], prop: [T('道具', 'prop', '소품'), W.prop] };
  const sheet = (kind, id) => {
    const key = `sheet:${id}`;
    if (sheets.has(key)) return sheets.get(key);
    const [label, map] = KIND[kind], item = map.get(id);
    if (!item?.sheet) { problems.push(T(`${label} ${id} 没有设定图提示词（sheet），跳过`, `${label} ${id} has no sheet prompt (sheet); skipped`, `${label} ${id}에 설정화 프롬프트(sheet)가 없어 건너뜀`)); sheets.set(key, null); return null; }
    const t = { id: key, kind, ref: id, name: item.name, target: `sheets/${id}.png`, prompt: withStyle(item.sheet), refs: [], status: 'pending' };
    sheets.set(key, t);
    // 设定图也能挂别的设定图，比如渡船外观要和船舱对得上
    t.refs = extra(item.sheets);
    if (t.refs.length) t.prompt = withStyle(`${t.refs.map((r, i) => IMG.ref(i + 1, r.role)).join('\n')}\n\n${item.sheet}`);
    return t;
  };
  // 额外挂的设定图（字段 sheets），按编号头一个字母认人物、场景、道具
  const extra = (ids, light) => (ids ?? []).flatMap((id) => {
    const kind = { C: 'char', S: 'scene', P: 'prop' }[String(id)[0]];
    if (!kind) { problems.push(T(`设定图编号 ${id} 认不出种类，要以 C / S / P 开头`, `sheet id ${id}: cannot tell its kind; it must start with C / S / P`, `설정화 번호 ${id}: 종류를 알 수 없습니다. C / S / P로 시작해야 합니다`)); return []; }
    const t = sheet(kind, id);
    return t ? [{ path: t.target, role: kind === 'scene' ? IMG.scene(t.name, light) : IMG[kind](t.name) }] : [];
  });
  const eps = parseEps(flag(argv, '--eps') ?? die(T('缺 --eps', 'missing --eps', '--eps가 없습니다')));
  for (const ep of eps) {
    const scenes = episodeScenes(W.script, ep);
    for (const seg of segmentsOf(W.storyboard, ep)) {
      const sc = scenes[seg.scene - 1];
      if (!sc) { problems.push(T(`${seg.id} 的 scene ${seg.scene} 在剧本里找不到`, `${seg.id}: scene ${seg.scene} is not in the script`, `${seg.id}의 scene ${seg.scene}이 대본에 없습니다`)); continue; }
      const place = sheet('scene', sc.scene);
      // 插入镜头用现成素材，不出图；本段第一张分镜图 = 第一个不是插入镜头的切
      const first = seg.cuts.findIndex((c) => !insertOf(c));
      seg.cuts.forEach((c, ci) => {
        if (insertOf(c)) return;
        // 挂图顺序：场景 → 人物 → 道具 → 本切额外的设定图；非首切再挂本段第一张分镜图，锁住光线和站位
        const refs = [];
        if (place && !c.place) refs.push({ path: place.target, role: IMG.scene(place.name, sc.light) }); // 写了 cut.place 就不挂本场场景图，要挂别的用 sheets
        for (const t of (c.chars ?? []).map((x) => sheet('char', x)).filter(Boolean)) refs.push({ path: t.target, role: IMG.char(t.name) });
        for (const t of (c.props ?? []).map((x) => sheet('prop', x)).filter(Boolean)) refs.push({ path: t.target, role: IMG.prop(t.name) });
        for (const r of extra(c.sheets, sc.light)) if (!refs.some((x) => x.path === r.path)) refs.push(r);
        if (ci > first) refs.push({ path: `frames/${seg.id}/f${first + 1}.png`, role: IMG.first });
        const head = refs.map((r, i) => IMG.ref(i + 1, r.role)).join('\n');
        frames.push({ id: `frame:${seg.id}/f${ci + 1}`, kind: 'frame', target: `frames/${seg.id}/f${ci + 1}.png`,
          prompt: withStyle(`${head ? `${head}\n\n` : ''}${IMG.frame(c.frame)}`), refs, status: 'pending' });
      });
    }
  }
  const order = { scene: 0, char: 1, prop: 2 };
  const list = [...sheets.values()].filter(Boolean).sort((a, b) => order[a.kind] - order[b.kind] || a.ref.localeCompare(b.ref));
  // 已经存在的图记为完成，重建任务单不会让它们重画
  const tasks = [...list, ...frames].map((t) => (existsSync(join(W.work, t.target)) ? { ...t, status: 'done' } : t));
  writeJson(file, { episodes: eps, style, createdAt: new Date().toISOString(), problems, tasks });
  const open = tasks.filter((t) => t.status !== 'done');
  console.log(T(`✓ 第 ${eps.join(',')} 集：设定图 ${list.length} + 分镜图 ${frames.length}，待出 ${open.length} 张 → ${file}`,
    `✓ episode ${eps.join(',')}: ${list.length} sheets + ${frames.length} frames, ${open.length} to make → ${file}`,
    `✓ ${eps.join(',')}화: 설정화 ${list.length} + 콘티 ${frames.length}, 남은 ${open.length}장 → ${file}`));
  if (!style) console.log(T('  ⚠️ project.json 没写 style（画风前缀），整批画风会不统一', '  ⚠️ project.json has no style (style prefix): the batch will not share one look', '  ⚠️ project.json에 style(화풍 접두어)이 없어 화풍이 통일되지 않습니다'));
  for (const p of problems) console.log(`  ⚠️ ${p}`);
}

/* ---------------- 出图方式 ---------------- */

// 任务号认出图放哪：sheet:C01 → sheets/，frame:… → frames/，fix:<target> → target
const targetOf = (tag) => (tag.startsWith('sheet:') ? `sheets/${tag.slice(6)}.png` : tag.startsWith('fix:') ? tag.slice(4) : `frames/${tag.slice(6)}.png`);

const fullPrompt = (prompt, target) => { const a = aspectFor(target); return `${prompt}\n\n${IMG.tail(a.label, a.orient)}`; };

// Codex CLI：让它用内置出图工具画一张，存到 out
function codex(work, tag, prompt, refs, out) {
  const full = `${IMG.codex(out)}\n\n${fullPrompt(prompt, targetOf(tag))}`;
  const args = ['exec', '--json', '--skip-git-repo-check', '-s', 'workspace-write', '-C', work,
    ...refs.flatMap((r) => ['-i', resolve(work, r)]), '-'];
  return run(work, tag, 'codex', args, full, out, (so) => {
    const m = [...so.matchAll(/"usage":(\{[^}]*\})/g)].pop();
    return m ? JSON.parse(m[1]) : null;
  });
}

// 自定义命令：提示词写进文件，占位符替换后交给 shell，在作品目录里执行
function cmdProvider(work, tag, prompt, refs, out, template) {
  if (!template) die(T('cmd 出图要在 project.json 写 images.cmd，或加 --cmd "<命令模板>"', 'the cmd provider needs images.cmd in project.json, or --cmd "<template>"', 'cmd 방식은 project.json에 images.cmd를 쓰거나 --cmd "<명령 템플릿>"을 붙여야 합니다'));
  const pf = join(work, '_logs', `prompt-${tag.replace(/[:/]/g, '_')}.txt`);
  mkdirSync(join(work, '_logs'), { recursive: true });
  writeFileSync(pf, fullPrompt(prompt, targetOf(tag)));
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
  if (!['manual', 'cmd', 'codex'].includes(name)) die(T(`没有这种出图方式：${name}（manual / cmd / codex）`, `unknown image provider: ${name} (manual / cmd / codex)`, `없는 이미지 방식: ${name} (manual / cmd / codex)`));
  const template = flag(argv, '--cmd') ?? W.project.images?.cmd;
  return { name, make: name === 'codex' ? codex : (w, tag, p, refs, out) => cmdProvider(w, tag, p, refs, out, template) };
}

// PNG 头里读宽高；比例偏离应有画幅（设定图 16:9，分镜图按作品 aspect）超过 3% 只提醒，不拦
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
  const a = aspectFor(target);
  return s && Math.abs(s.w / s.h - a.ratio) / a.ratio > 0.03 ? T(`比例 ${s.w}×${s.h} 不是 ${a.label}`, `${s.w}×${s.h} is not ${a.label}`, `비율 ${s.w}×${s.h}가 ${a.label}가 아닙니다`) : '';
}

async function pool(items, jobs, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

const fmt = (u) => (u ? T(`输入 ${(u.input_tokens / 1e4).toFixed(1)} 万 / 输出 ${u.output_tokens}`, `input ${u.input_tokens} / output ${u.output_tokens}`, `입력 ${u.input_tokens} / 출력 ${u.output_tokens}`)
  : T('无用量', 'no usage', '사용량 없음'));

async function cmdBatch(argv) {
  const work = resolve(flag(argv, '--work'));
  const W = await openWork(work);
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
  if (!todo.length) return console.log(T('· 没有要出的图（出过的不重出；要重出加 --redo）', '· nothing to make (finished images are skipped; add --redo to remake)', '· 만들 그림이 없습니다(이미 만든 것은 건너뜀; 다시 만들려면 --redo)'));
  if (pv.name === 'manual') {
    const runnable = todo.filter(ready);
    if (todo.length > runnable.length) console.log(T(`· ${todo.length - runnable.length} 张要等参考图（设定图）放好：先出这一轮，place 回来后再跑一次`, `· ${todo.length - runnable.length} images wait for their references (sheets): make this round, place them, then run again`, `· ${todo.length - runnable.length}장은 참고 이미지(설정화)를 기다립니다: 이번 회차를 만들고 place한 뒤 다시 실행하세요`));
    return exportManual(work, runnable);
  }
  // 自动出图分波次：先出参考图齐的（一般是设定图），出完再出依赖它们的分镜图
  for (let wave = 1; todo.length; wave++) {
    const runnable = todo.filter(ready);
    if (!runnable.length) { console.log(T(`· ${todo.length} 张的参考图没出成，停下（见上面的 ✗）`, `· ${todo.length} images are missing their references; stopping (see ✗ above)`, `· ${todo.length}장의 참고 이미지가 없어 멈춥니다(위의 ✗ 참고)`)); break; }
    console.log(T(`· 第 ${wave} 波出 ${runnable.length} 张（${pv.name}）`, `· wave ${wave}: ${runnable.length} images (${pv.name})`, `· ${wave}차: ${runnable.length}장 (${pv.name})`));
    await pool(runnable, Number(flag(argv, '--jobs', '3')), async (t) => {
      const tmp = `_logs/out-${t.id.replace(/[:/]/g, '_')}.png`;
      rmSync(join(work, tmp), { force: true });
      const r = await pv.make(work, t.id, t.prompt, t.refs.map((x) => x.path), tmp);
      if (!r.made) return console.log(T(`✗ ${t.id} 没出图（exit ${r.code}，见 _logs/）`, `✗ ${t.id} no image (exit ${r.code}, see _logs/)`, `✗ ${t.id} 그림 없음 (exit ${r.code}, _logs/ 참고)`));
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
    const refs = t.refs.map((r, i) => T(`  参考图${i + 1}：${r.path}（${r.role}）`, `  reference ${i + 1}: ${r.path} (${r.role})`, `  참고 이미지 ${i + 1}: ${r.path} (${r.role})`)).join('\n') || T('  无', '  none', '  없음');
    const place = `node scripts/frames.mjs place --work <${T('作品目录', 'project dir', '작품 폴더')}> --target ${t.target} --from <${T('下载的图', 'downloaded image', '받은 이미지')}>`;
    writeFileSync(join(dir, `${t.id.replace(/[:/]/g, '_')}.txt`), T(
      `出好后放到：${t.target}\n（或运行 ${place}）\n\n参考图（按顺序上传）：\n${refs}\n\n提示词：\n${fullPrompt(t.prompt, t.target)}\n`,
      `Put the finished image at: ${t.target}\n(or run ${place})\n\nReference images (upload in this order):\n${refs}\n\nPrompt:\n${fullPrompt(t.prompt, t.target)}\n`,
      `완성된 그림을 넣을 곳: ${t.target}\n(또는 ${place} 실행)\n\n참고 이미지(이 순서로 올리기):\n${refs}\n\n프롬프트:\n${fullPrompt(t.prompt, t.target)}\n`));
  }
  console.log(T(`· 已导出 ${tasks.length} 份出图说明 → ${dir}\n  用任何出图工具按说明出图，再用 place 放回；放好的图下一轮自动跳过`,
    `· exported ${tasks.length} image briefs → ${dir}\n  make them in any image tool, then place them back; placed images are skipped next round`,
    `· 그림 설명 ${tasks.length}개를 내보냄 → ${dir}\n  아무 이미지 도구로 만든 뒤 place로 넣으세요. 넣은 그림은 다음 회차에서 건너뜁니다`));
}

async function cmdPlace(argv) {
  const work = resolve(flag(argv, '--work'));
  await openWork(work);
  const target = flag(argv, '--target') ?? die(T('缺 --target', 'missing --target', '--target이 없습니다'));
  const from = resolve(flag(argv, '--from') ?? die(T('缺 --from', 'missing --from', '--from이 없습니다')));
  if (!existsSync(from)) die(T(`找不到 ${from}`, `not found: ${from}`, `찾을 수 없음: ${from}`));
  const note = place(work, from, target);
  markDone(work, target);
  console.log(`✓ ${target}${note ? `  ⚠️ ${note}` : ''}`);
}

async function cmdFix(argv) {
  const work = resolve(flag(argv, '--work'));
  const pv = provider(argv, await openWork(work));
  if (pv.name === 'manual') die(T('手动出图：按原图和修改说明在你的工具里重画，再用 place 放回', 'manual provider: redraw it in your tool from the original and your fix notes, then place it back', '수동 방식: 원본과 수정 설명대로 도구에서 다시 그린 뒤 place로 넣으세요'));
  const target = flag(argv, '--target') ?? die(T('缺 --target', 'missing --target', '--target이 없습니다'));
  const prompt = readFileSync(flag(argv, '--prompt') ?? die(T('缺 --prompt', 'missing --prompt', '--prompt가 없습니다')), 'utf8');
  const tmp = `_logs/fix-${target.replace(/[/]/g, '_')}`;
  rmSync(join(work, tmp), { force: true });
  const r = await pv.make(work, `fix:${target}`, prompt, flags(argv, '--ref'), tmp);
  if (!r.made) return console.log(T(`✗ ${target} 没出图（exit ${r.code}，见 _logs/）`, `✗ ${target} no image (exit ${r.code}, see _logs/)`, `✗ ${target} 그림 없음 (exit ${r.code}, _logs/ 참고)`));
  const note = place(work, tmp, target);
  console.log(`✓ ${target}  ${fmt(r.usage)}${note ? `  ⚠️ ${note}` : ''}`);
}

async function cmdStatus(argv) {
  const work = resolve(flag(argv, '--work'));
  await openWork(work);
  const plan = readJson(join(work, 'tasks.json'));
  const c = {};
  for (const t of plan.tasks) c[t.status] = (c[t.status] ?? 0) + 1;
  console.log(T(`第 ${plan.episodes.join(',')} 集：共 ${plan.tasks.length} 张`, `episode ${plan.episodes.join(',')}: ${plan.tasks.length} images`, `${plan.episodes.join(',')}화: 모두 ${plan.tasks.length}장`), c);
}

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'plan') await cmdPlan(rest);
else if (cmd === 'batch') await cmdBatch(rest);
else if (cmd === 'fix') await cmdFix(rest);
else if (cmd === 'place') await cmdPlace(rest);
else if (cmd === 'status') await cmdStatus(rest);
else console.log(USAGE());
