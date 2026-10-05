// dramazing 的数据层：读工作目录里的三份 JSON（project / script / storyboard），给其他脚本用。
// 格式说明见 references/data-format.md。

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

// 只数汉字、字母、数字，标点不算
export const countChars = (t) => [...String(t).replace(/[^\p{Script=Han}\p{L}\p{N}]/gu, '')].length;
// Grok 念中文约 3 字/秒，再加 1 秒起音（实测）
export const speakSeconds = (t) => countChars(t) / 3 + 1;
// 台词里的破折号会被念成「一」，统一换成逗号
export const speakable = (t) => String(t).replace(/——|—|--/g, '，').replace(/，([。！？])/g, '$1');

export const ACTION_SECONDS = 2.5;

/** 读整个作品。返回 { work, project, script, storyboard, char, scene, prop, names } */
export function loadWork(workArg) {
  const work = resolve(workArg);
  const project = readJson(join(work, 'project.json'));
  const script = readOpt(join(work, 'script.json'), { episodes: [] });
  const storyboard = readOpt(join(work, 'storyboard.json'), { episodes: [] });
  const byId = (list) => new Map((list ?? []).map((x) => [x.id, x]));
  const char = byId(project.characters), scene = byId(project.scenes), prop = byId(project.props);
  return { work, project, script, storyboard, char, scene, prop, names: [...char.values()].map((c) => c.name) };
}

/**
 * 一集的剧本场景，节拍按场景内顺序从 1 编号。
 * 节拍三种：{act}（动作）、{who, say, tone}（台词）、{who, say, tone, inner: true}（心声 / 画外音）
 * 每拍补上 n、kind（'act' | 'line' | 'inner'）、seconds（动作 2.5 秒，台词按字数）
 */
export function episodeScenes(script, ep) {
  const e = script.episodes.find((x) => x.ep === ep);
  if (!e) throw new Error(`剧本里没有第 ${ep} 集`);
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
