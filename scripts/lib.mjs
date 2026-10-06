// dramazing 的数据层：读工作目录里的三份 JSON（project / script / storyboard），给其他脚本用。
// 格式说明见 references/<语言>/data-format.md。
// 两种语言：故事语言（project.language，台词、提示词、字幕跟着它）和界面语言（脚本打印的提示，T() 选）。

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

export const flag = (argv, name, fb = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fb;
};

export const readJson = (p) => JSON.parse(readFileSync(resolve(p), 'utf8'));
export const readOpt = (p, fb = {}) => (existsSync(p) ? readJson(p) : fb);

/** 写 JSON：先写临时文件再改名，写之前把旧文件备份到同目录的 _bak/<名>.<MMDDHHMM> */
export function writeJson(path, data, { backup = true } = {}) {
  if (backup && existsSync(path)) {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const stamp = `${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
    const dir = join(dirname(path), '_bak');
    mkdirSync(dir, { recursive: true });
    copyFileSync(path, join(dir, `${path.split('/').pop()}.${stamp}`));
  }
  writeFileSync(`${path}.tmp`, `${JSON.stringify(data, null, 1)}\n`);
  renameSync(`${path}.tmp`, path);
}

export const epTag = (n) => `E${String(n).padStart(2, '0')}`;

/* ---------------- 语言 ---------------- */

// 每种故事语言的语速、语音识别代码、字幕字体等，见 lang/langs.json
export const LANGS = JSON.parse(readFileSync(new URL('./lang/langs.json', import.meta.url), 'utf8'));
let STORY = 'zh', RATE = null, LOADED = false;
/** 故事语言：zh / en / ko，没写按 zh（向后兼容） */
export const lang = () => STORY;
/** 界面语言：环境变量 DRAMAZING_LANG > 作品的故事语言 > 系统 LANG > 英文 */
export const ui = () => {
  const env = process.env.DRAMAZING_LANG, sys = (process.env.LC_ALL || process.env.LANG || '').slice(0, 2);
  return LANGS[env] ? env : LOADED ? STORY : LANGS[sys] ? sys : 'en';
};
/** 三语提示：T(中文, English, 한국어) */
export const T = (zh, en, ko) => ({ zh, en, ko })[ui()] ?? en;
/** 本作品故事语言的固定句子和匹配规则（lang/<语言>.mjs） */
export const phrases = async () => (await import(`./lang/${STORY}.mjs`)).default;

// 台词长度：中文、韩文数字（音节），英文数单词；标点不算
export const countChars = (t) => [...String(t).replace(/[^\p{Script=Han}\p{L}\p{N}]/gu, '')].length;
export const countUnits = (t, l = STORY) => (LANGS[l].unit === 'word'
  ? String(t).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length : countChars(t));
// 台词秒数 = 字数 / 语速 + 1 秒起音。中文 3 字/秒是 Grok 实测；其他语言没校准前按 langs.json 的估计值，
// 可以在 project.json 写 speechRate 覆盖（实测方法见 references/<语言>/workflow.md「故事语言」）
export const speechRate = (l = STORY) => (l === STORY && RATE) || LANGS[l].rate;
export const speakSeconds = (t, l = STORY) => countUnits(t, l) / speechRate(l) + 1;
// 台词里的破折号：中文会被念成「一」，统一换成逗号；其他语言换成逗号停顿
export const speakable = (t, l = STORY) => (l === 'zh'
  ? String(t).replace(/——|—|--/g, '，').replace(/，([。！？])/g, '$1')
  : String(t).replace(/\s*(——|—|--)\s*/g, ', ').replace(/,\s*([.!?])/g, '$1'));

// 语音识别结果和台词比对的单位：中文、韩文按字，英文按词（小写）
export const tokens = (t, l = STORY) => (LANGS[l].unit === 'word'
  ? String(t).toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean)
  : [...String(t).replace(/[^\p{Script=Han}\p{L}\p{N}]/gu, '')]);

/**
 * 把识别片段按出现顺序单调地挂到台词上：片段的字 / 词落在哪句台词里最多就归哪句（只往后看两句，平分归后一句）。
 * VAD 切出的片段会把前面的静音也并进来，起点按字数 / 词数从片段末尾倒推（每单位秒数见 langs.json 的 alignUnitSec）。
 * lines: [{from, to, text}]，pieces: [{from, to, text}]（识别原文）。命中的台词改写 from / to，返回命中句数
 */
export function alignLines(lines, pieces, l = STORY) {
  const unit = LANGS[l].alignUnitSec;
  const ps = pieces.map((p) => ({ ...p, tk: tokens(p.text, l) })).filter((p) => p.tk.length);
  const lt = lines.map((x) => new Set(tokens(x.text, l)));
  const score = (p, k) => p.tk.filter((t) => lt[k].has(t)).length / p.tk.length;
  let li = 0;
  for (const p of ps) {
    let best = -1, bs = 0.34;
    for (let k = li; k < Math.min(li + 3, lines.length); k++) if (score(p, k) > bs || (k > li && score(p, k) === bs && bs > 0.34)) { bs = score(p, k); best = k; }
    if (best < 0) continue;
    li = best;
    p.used = true;
    const x = lines[best];
    if (!x.hit) { x.hit = true; x.from = Math.max(p.from, p.to - unit * p.tk.length - 0.2); }
    x.to = p.to;
  }
  // 两三个字的短句常被听成别的字（坐稳 → 作文），一个字都对不上：
  // 前后已对齐的两句之间，没对上的句子和没被认领的语音条数一样多时，按顺序一一配上
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].hit) continue;
    let j = i; while (j < lines.length && !lines[j].hit) j++;
    const lo = i > 0 ? lines[i - 1].to : 0, hi = j < lines.length ? lines[j].from : Infinity;
    const free = ps.filter((p) => !p.used && p.from >= lo - 0.1 && p.to <= hi + 0.1);
    if (free.length === j - i) free.forEach((p, k) => { p.used = true; Object.assign(lines[i + k], { hit: true, from: p.from, to: p.to }); });
    i = j;
  }
  return lines.filter((x) => x.hit).length;
}

export const ACTION_SECONDS = 2.5;

/* ---------------- 画幅 ---------------- */

// project.aspect 写成「宽:高」（16:9 横屏、9:16 竖屏），不写按 16:9。成片画布长边 1920，短边按比例取偶数。
// 设定图是参考图，不进成片，不管作品是什么画幅都用 16:9（多视图并排放得下）
export const SHEET_ASPECT = '16:9';
export function parseAspect(a = '16:9') {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(a).trim());
  if (!m || !(+m[1] > 0 && +m[2] > 0)) throw new Error(T(`aspect「${a}」要写成 宽:高，比如 16:9、9:16`, `aspect "${a}" must be width:height, e.g. 16:9 or 9:16`, `aspect "${a}"는 너비:높이로 쓰세요. 예: 16:9, 9:16`));
  const ratio = m[1] / m[2], even = (x) => Math.round(x / 2) * 2;
  const [w, h] = ratio >= 1 ? [1920, even(1920 / ratio)] : [even(1920 * ratio), 1920];
  return { label: `${m[1]}:${m[2]}`, ratio, w, h, orient: ratio > 1.05 ? 'landscape' : ratio < 0.95 ? 'portrait' : 'square' };
}

/**
 * 插入镜头：不出图、不出片，叙事预览和剪辑直接用一段现成的素材（录屏、截图）。
 * cut.insert 写成作品目录里的相对路径，或 { file, fit }；fit 是素材比例和画幅不一样时怎么放：
 * blur（默认，原样居中，空白处垫一层放大虚化的同一画面）/ crop（放大裁满）/ pad（原样居中，空白处黑边）
 */
export const INSERT_FITS = ['blur', 'crop', 'pad'];
/** 花字（cut.title）：短剧里人物出场的名字卡这类画面文字。写成字符串或 { text, sub, at, seconds, pos, y }，不是花字返回 null */
export const TITLE_POS = ['left', 'center', 'right'];
export const titleOf = (c) => (c?.title == null ? null
  : { at: 0.3, seconds: 2.5, pos: 'left', y: 0.62, ...(typeof c.title === 'string' ? { text: c.title } : c.title) });
export const insertOf = (c) => (c?.insert == null ? null
  : typeof c.insert === 'string' ? { file: c.insert, fit: 'blur' } : { fit: 'blur', ...c.insert });

/** 读整个作品。返回 { work, project, script, storyboard, char, scene, prop, names, aspect } */
export function loadWork(workArg) {
  const work = resolve(workArg);
  const project = readJson(join(work, 'project.json'));
  STORY = project.language ?? 'zh';
  if (!LANGS[STORY]) throw new Error(`project.json language「${STORY}」: ${Object.keys(LANGS).join(' / ')}`);
  RATE = project.speechRate ?? null;
  LOADED = true;
  const script = readOpt(join(work, 'script.json'), { episodes: [] });
  const storyboard = readOpt(join(work, 'storyboard.json'), { episodes: [] });
  const byId = (list) => new Map((list ?? []).map((x) => [x.id, x]));
  const char = byId(project.characters), scene = byId(project.scenes), prop = byId(project.props);
  return { work, project, script, storyboard, char, scene, prop, names: [...char.values()].map((c) => c.name), aspect: parseAspect(project.aspect) };
}

/**
 * 一集的剧本场景，节拍按场景内顺序从 1 编号。
 * 节拍三种：{act}（动作）、{who, say, tone}（台词）、{who, say, tone, inner: true}（心声 / 画外音）
 * 每拍补上 n、kind（'act' | 'line' | 'inner'）、seconds（动作 2.5 秒，台词按字数 / 词数）
 */
export function episodeScenes(script, ep) {
  const e = script.episodes.find((x) => x.ep === ep);
  if (!e) throw new Error(T(`剧本里没有第 ${ep} 集`, `script.json has no episode ${ep}`, `script.json에 ${ep}화가 없습니다`));
  return e.scenes.map((sc, i) => ({
    ...sc,
    index: i + 1,
    beats: sc.beats.map((b, k) => ({
      ...b,
      n: k + 1,
      kind: b.say == null ? 'act' : b.inner ? 'inner' : 'line',
      seconds: b.say == null ? ACTION_SECONDS : Math.round(speakSeconds(b.say) * 10) / 10,
    })),
  }));
}

/** 一切覆盖的节拍 */
export const cutBeats = (scene, cut) => scene.beats.filter((b) => b.n >= cut.beats[0] && b.n <= cut.beats[1]);

/** 各切在段内的起点（秒），按分镜时长累加 */
export const cutStarts = (cuts) => cuts.reduce((acc, c, i) => [...acc, i ? acc[i - 1] + cuts[i - 1].seconds : 0], []);

export const segmentsOf = (storyboard, ep) => storyboard.episodes.find((e) => e.ep === ep)?.segments ?? [];
