#!/usr/bin/env node
// 按分镜给每个镜头写视频提示词（首帧 = 该切的分镜图），并做出片前预检。分两层：
//   1. 镜头描述 shots.json：动作、视线、运镜、台词、限制，和用哪个视频工具无关；
//   2. 按目标工具渲染成 prompts.json：每个工具的时长档位和写法不同，见 scripts/targets/。
// 草稿要逐条过一遍再用：动作方向对不对首帧、谁出镜、台词是不是这一切说的。
// 已有的条目不覆盖（--force 才覆盖），手改过的提示词可以放心重跑。
// 每条规则后面括号里是它来自哪次实测，规则说明见 references/prompt-rules.md。

import { existsSync, mkdirSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  cutBeats, episodeScenes, epTag, flag, loadWork, readOpt, segmentsOf, speakSeconds, speakable, writeJson,
} from './lib.mjs';

const TARGETS = readdirSync(new URL('./targets/', import.meta.url)).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4));

const argv = process.argv.slice(2);
if (!flag(argv, '--work')) {
  console.log(`video-prompts.mjs --work <作品目录> --ep <集> [--target <工具>] [--dir video] [--out <目录>] [--force]
  写 <dir>/shots.json（镜头描述，和工具无关）和 <dir>/prompts.json（键 E02-03/s1 → {img, seconds, prompt}），打印预检警告。
  --target 视频工具：${TARGETS.join(' / ')}，默认读 project.json 的 video.target，再默认 generic
  人物外貌短语、异样特征、场景环境动态都从 project.json 读（见 references/data-format.md）。
  --out 把结果写到别的目录（回归测试用，不碰正式文件）`);
  process.exit(0);
}
const W = loadWork(flag(argv, '--work'));
const epNo = Number(flag(argv, '--ep', '1'));
const dir = resolve(W.work, flag(argv, '--dir', 'video'));
const outDir = flag(argv, '--out') ? resolve(flag(argv, '--out')) : dir;
const force = argv.includes('--force');
const outFile = join(outDir, 'prompts.json');
const out = readOpt(outFile);
const shotsFile = join(outDir, 'shots.json');
const shots = readOpt(shotsFile);
const targetName = flag(argv, '--target') ?? W.project.video?.target ?? 'generic';
if (!TARGETS.includes(targetName)) { console.error(`✗ 没有这个视频工具：${targetName}（可选 ${TARGETS.join(' / ')}）`); process.exit(1); }
const target = (await import(`./targets/${targetName}.mjs`)).default;
const durations = W.project.video?.durations ?? target.durations; // 工具的时长档位，升序

const charName = new Map([...W.char.values()].map((c) => [c.id, c.name]));
const byName = new Map([...W.char.values()].map((c) => [c.name, c]));
const en = (n) => byName.get(n)?.alias?.en ?? n; // 英文句子里用外貌短语代替人名：视频模型不认识人名
const zh = (n) => byName.get(n)?.alias?.zh ?? n;
const who = (id) => en(charName.get(id) ?? id);
const names = W.names;

const CAM = { 'Static Shot': 'Locked-off static camera.', 'Tracking Shot': 'Smooth tracking camera.', 'Push In': 'Slow small push-in.', 'Pull Out': 'Slow small pull-out.', 'Pan': 'Slow pan.', 'Handheld': 'Gentle handheld camera.' };

// 运镜：一镜只做一个主运镜，写全「名称 + 方向 + 速度 + 对象 + 起止画面 + 停点」，只写名称 AI 会一直动或乱动。
// 分镜切上可选 move: { from, to, stop, dir, speed, target, distance, level, who, height, then }
const MOVES = {
  'Push In': (m) => ({ en: 'Slow steady dolly push-in: the camera physically moves forward, no zoom.',
    zh: `摄影机${m.speed ?? '缓慢平稳地'}向前推近${m.from || m.to ? `，从${m.from ?? '首帧构图'}收到${m.to ?? '更近一档'}` : ''}；焦距不变，背景有自然视差${m.stop ? `，在${m.stop}时停住` : '，推近幅度很小，到位后停住'}。`,
    limits: ['焦距不变，不变焦', '只做这一个运镜，不环绕、不摇'] }),
  'Pull Out': (m) => ({ en: 'Slow steady dolly pull-out: the camera physically moves backward, no zoom.',
    zh: `摄影机${m.speed ?? '缓慢平稳地'}向后拉远${m.from || m.to ? `，从${m.from ?? '首帧构图'}拉到${m.to ?? '更远一档'}` : ''}${m.target ? `，${m.target}始终留在画面中央` : ''}${m.stop ? `，在${m.stop}时停住` : '，到位后停住'}。`,
    limits: ['焦距不变，不变焦', '只做这一个运镜，不环绕、不摇'] }),
  'Pan': (m) => ({ en: `Slow pan to the ${m.dir === '左' ? 'left' : 'right'}; the camera stays in place and only rotates.`,
    zh: `机位不动，镜头${m.speed ?? '缓慢'}水平向${m.dir ?? '右'}摇${m.from ? `，从${m.from}开始` : ''}${m.to ? `，摇到${m.to}停住` : '，到位后停住'}。`,
    limits: ['摄影机位置不动，只水平转动'] }),
  'Tilt': (m) => ({ en: `Slow tilt ${m.dir === '下' ? 'down' : 'up'}; the camera stays in place and only rotates.`,
    zh: `机位不动，镜头${m.speed ?? '缓慢'}向${m.dir ?? '上'}俯仰${m.from ? `，从${m.from}开始` : ''}${m.to ? `，停在${m.to}上` : '，到位后停住'}。`,
    limits: ['摄影机位置不动，只上下转动'] }),
  'Rack Focus': (m) => ({ en: 'Rack focus: the camera and framing stay completely still; only the focus shifts.',
    zh: `浅景深，焦点先在${m.from ?? '前景'}上，随后${m.speed ?? '缓慢'}移到${m.to ?? '背景'}：${m.from ?? '前景'}逐渐虚化，${m.to ?? '背景'}变清晰${m.stop ? `，在${m.stop}时完成` : ''}。`,
    limits: ['摄影机和构图不动，只有焦点变化'] }),
  // 跟拍分后方 / 前方引导 / 侧面并行
  'Tracking Shot': (m) => {
    const t = m.target ?? '人物', d = m.distance ? `约${m.distance}处` : '', front = /前/.test(m.dir ?? '');
    return { en: front ? 'Smooth stabilized leading shot: the camera moves backward ahead of the subject, who walks toward it, at constant distance.'
        : /后/.test(m.dir ?? '') ? 'Smooth stabilized follow shot from behind at constant distance.' : 'Smooth stabilized tracking shot at constant distance.',
      zh: `${front ? `摄影机在${t}前方${d}平稳后退，让${t}迎面走来，后退速度与步速一致` : `摄影机从${m.dir ?? '侧面'}${d}平稳跟随${t}，速度与人物步速一致`}，距离和人物在画面里的大小保持不变；稳定器质感，有自然惯性，不漂浮${m.stop ? `，在${m.stop}时一同停下` : ''}。`,
      limits: [front ? '摄影机始终在人物前方后退，人物不撞上镜头' : '跟随距离不变，不超过人物'] };
  },
  // 手持是质感，仍要写强度、方向和距离
  'Handheld': (m) => {
    const lv = m.level ?? '克制';
    const feel = { 克制: '只有轻微的呼吸漂移和脚步起伏', 纪录片: '纪录片式，构图随现场动作临时微调', 激烈: '明显的追赶震动' }[lv] ?? lv;
    return { en: lv === '激烈' ? 'Intense handheld camera with noticeable shake; the subject stays recognizable.' : 'Restrained handheld camera: subtle breathing drift and footstep bob only.',
      zh: `${lv}手持，${feel}，人物始终清楚可辨${m.dir ? `；摄影机从${m.dir}${m.distance ? `约${m.distance}处` : ''}跟着${m.target ?? '人物'}` : '；机位基本不动'}${m.stop ? `，在${m.stop}时停住` : ''}。`,
      limits: lv === '激烈' ? ['不突然变焦'] : ['不做剧烈随机抖动，不突然变焦'] };
  },
  // 摇臂：沿弧线升降，同时改变高度和前后距离。未实测，首次使用先出试探镜头
  'Crane': (m) => {
    const down = m.dir === '下';
    return { en: `Slow crane shot ${down ? 'descending' : 'rising'} along a gentle arc; steady and weighty, not a drone.`,
      zh: `摇臂镜头，摄影机${m.speed ?? '缓慢平稳地'}沿平缓弧线向${down ? '前下方下降' : '后上方升起'}${m.from || m.to ? `，从${m.from ?? '首帧构图'}${down ? '落到' : '升到'}${m.to ?? (down ? '人物近处' : '高位全景')}` : ''}${m.target ? `，${m.target}始终留在画面${down ? '中央' : '下方中央'}` : ''}${m.stop ? `，在${m.stop}时停住` : '，到位后停住'}。`,
      limits: ['运动稳重连续，不像无人机高速飞行', '焦距不变，不环绕'] };
  },
  // 主观镜头：观众借用角色的眼睛，只能看到这人的手和袖口。未实测，首次使用先出试探镜头
  'POV': (m) => ({ en: `First-person POV through the eyes of ${m.who ? en(m.who) : 'the character'} at eye height; only their hands and sleeves may enter the bottom of the frame.`,
    zh: `第一人称主观镜头，视线高度约${m.height ?? '一米六'}，观众借用${m.who ? zh(m.who) : '人物'}的眼睛${m.from ? `，先看${m.from}` : ''}${m.to ? `，再${m.dir === '下' ? '低头' : '转头'}看向${m.to}` : ''}${m.stop ? `，在${m.stop}时停住` : ''}；动作克制，只有轻微呼吸起伏。`,
    limits: [`看不到${m.who ? zh(m.who) : '视线主人'}的脸和完整身体，只有手和袖口可以出现在画面下方`] }),
};
const SIZE = { 'extreme-wide': '大远景', wide: '远景', full: '全景', medium: '中景', 'medium-close': '中近景', close: '特写', 'extreme-close': '大特写' };
const NO_EYE = /^(无|不露脸|)$/;

const scenes = episodeScenes(W.script, epNo);
const warn = [];
let made = 0;
for (const seg of segmentsOf(W.storyboard, epNo)) {
  const sc = scenes[seg.scene - 1];
  seg.cuts.forEach((c, ci) => {
    const key = `${seg.id}/s${ci + 1}`;
    const lines = cutBeats(sc, c).filter((b) => b.kind !== 'act');
    const talk = lines.reduce((s, l) => s + speakSeconds(l.say), 0);
    const chars = c.chars ?? [];
    const cast = chars.map(who);
    // 预检
    const spoken = lines.filter((l) => l.kind === 'line');
    if (['wide', 'extreme-wide'].includes(c.size) && spoken.length) warn.push(`${key} 远景里有人说话：脸太小会被重画，首帧建议改中景 / 中近景`);
    else if (['wide', 'extreme-wide'].includes(c.size) && cast.length) warn.push(`${key} 远景有人物（${cast.join('、')}）：留意换脸，必要时首帧改近`);
    if (talk > c.seconds + 0.5) warn.push(`${key} 台词约 ${talk.toFixed(1)}s，分镜只给 ${c.seconds}s：剪接会按台词留长`);
    if (/慢动作|slow motion/i.test(c.action)) warn.push(`${key} 镜头描述里有慢动作，确认是否本意`);
    if (!existsSync(join(W.work, 'frames', seg.id, `f${ci + 1}.png`))) warn.push(`${key} 缺首帧 frames/${seg.id}/f${ci + 1}.png`);
    if (out[key] && !force) return;
    // 台词：语气说明放在台词后面并注明不念，放前面括号里会被当台词念出来；
    // 只写 lips in sync 时，压低声音这类语气会被做成嘴不动的画外音，要写明每个字都张嘴
    // 心声：说话人不能动嘴，否则画面里的人会对口型
    const said = lines.map((l) => ({ kind: l.kind, who: l.who ? who(l.who) : null, say: speakable(l.say), tone: l.tone ?? null }));
    // 选工具能出的最短档位，装得下分镜时长和台词（台词后留 0.5 秒）
    const need = Math.max(c.seconds, talk + 0.5);
    const seconds = durations.find((d) => d >= need) ?? durations[durations.length - 1];
    if (need > durations[durations.length - 1]) warn.push(`${key} 需要约 ${need.toFixed(1)}s，${targetName} 最长 ${durations[durations.length - 1]}s：拆成两切`);
    const swap = (t) => (t ?? '').replace(new RegExp(names.join('|'), 'g'), zh);
    const place = W.scene.get(sc.scene);
    const sceneLabel = place?.name ?? '';
    const amb = place?.ambient?.[sc.light] ?? place?.ambient?.['*']; // 同一场景光线会变：先按光照找
    const action = swap(c.action).replace(/[。.]?$/, '。');
    const pace = /跑|奔|冲|追/.test(c.action) ? ' Real-time speed, NOT slow motion.' : '';
    const rig = [c.aim && `摄影机对准${swap(c.aim)}`, c.angle, c.lens].filter(Boolean).join('，');
    // 画外的人只写方向，不写是谁：写了是谁，推近时模型会把人画进来
    const offEyeText = (e) => {
      const [first, ...rest] = e.split(/[，,]/);
      const side = (first.match(/画面[左右]侧/) ?? [''])[0];
      const keep = rest.filter((r) => !names.some((n) => [n, zh(n).slice(-2)].some((w) => r.includes(w)))).map(swap);
      return [`${side}画外`, ...keep].join('，');
    };
    // 视线对象不在本镜人物里：写成画外，否则和「画面里只有某人」冲突
    const inCut = new Set(chars.map((id) => charName.get(id)));
    const offEye = names.some((n) => !inCut.has(n) && [n, zh(n).slice(-2)].some((w) => (c.eyeline ?? '').includes(w))); // 分镜常写称呼而非人名
    const eye = !c.eyeline || NO_EYE.test(c.eyeline.trim()) ? ''
      : offEye ? `视线：${offEyeText(c.eyeline)}。` : `视线：${swap(c.eyeline)}。`;
    // 关键限制：只限制「动作」，不点名「不要出现的东西」
    const limits = [];
    const state = {}; let cur = null; // 从首帧描述里按分句认每个人的姿态（坐着 / 背对镜头）
    for (const clause of (c.frame ?? '').split(/[，,。；;]/)) {
      const n = names.find((x) => clause.includes(x)); if (n) cur = n;
      if (!cur) continue;
      state[cur] ??= {};
      if (/坐/.test(clause)) state[cur].sit = true;
      if (/背对|背影|背朝/.test(clause) && !/没有|不见|无人/.test(clause)) state[cur].back = true; // 否定句不算
    }
    const speakers = new Set(spoken.map((l) => charName.get(l.who)));
    // 手 / 道具的特写：写「只有某人」会让模型把整个人画出来，甚至画出两个
    const txt = `${c.action ?? ''}${c.frame ?? ''}`;
    const handOnly = ['close', 'extreme-close'].includes(c.size) && /手|拇指|指尖|手指/.test(txt) && !/脸|眼|嘴|眉|头发|面部|侧脸/.test(txt) && !speakers.size;
    if (handOnly) limits.push('画面里只有手、袖口和道具，手的主人在画外，始终看不到任何人的脸、头发和身体');
    const povOwner = c.camera === 'POV' ? c.move?.who : null; // 主观镜头的主人只露手，不写他的姿态和口型
    if (c.camera === 'POV' && !povOwner) warn.push(`${key} POV 没写是谁的眼睛（move.who）`);
    if (povOwner && speakers.has(povOwner)) warn.push(`${key} POV 的主人${povOwner}在说台词：观众看不到他的嘴，按心声处理或换镜头`);
    for (const id of handOnly ? [] : chars.filter((x) => charName.get(x) !== povOwner)) {
      const n = charName.get(id), st = state[n] ?? {}, w = zh(n);
      if (st.sit && !/起身|站起|起来/.test(c.action)) limits.push(`${w}始终坐着，不起身`);
      if (st.back && !/转身|回头/.test(c.action)) limits.push(`${w}全程背对镜头，不转身、不回头`);
      if (!speakers.has(n)) limits.push(`${w}不说话，嘴不动`);
      else if (!st.back) limits.push(`${w}从第一个字起就张嘴说话，嘴唇一直跟着台词动，不是画外音`);
    }
    let mv = c.camera && c.camera !== 'Static Shot' && MOVES[c.camera] ? MOVES[c.camera](c.move ?? {}) : null;
    // 两阶段组合运镜：move.then = {camera, trigger, ...}。只给 10 秒镜头用，第二个动作必须有触发点。未实测
    const th = c.move?.then;
    if (mv && th && MOVES[th.camera]) {
      const mv2 = MOVES[th.camera](th), solo = (l) => !l.startsWith('只做这一个运镜') && !/^摄影机.*不动/.test(l);
      mv = { en: `${mv.en} Then, ${mv2.en}`,
        zh: `第一阶段，${mv.zh.replace(/。$/, '')}；当${th.trigger ?? '第一阶段到位'}时，第二阶段：${mv2.zh}两个阶段依次发生，不同时叠加。`,
        limits: [...new Set([...mv.limits, ...mv2.limits].filter(solo)), '第二阶段开始后摄影机不再移动'] };
      if (!th.trigger) warn.push(`${key} 两阶段运镜没写触发点（move.then.trigger）：AI 会把两个动作混在一起`);
      if (seconds < 10) warn.push(`${key} 两阶段运镜用在 ${seconds}s 的镜头上：太短，拆成两镜`);
    }
    if (c.camera === 'Static Shot') limits.push('摄影机不移动');
    if (mv) {
      limits.push(...mv.limits);
      if (c.camera === 'Handheld' && !c.move?.level) warn.push(`${key} 手持没写强度（move.level：克制 / 纪录片 / 激烈），默认按克制写`);
      if (c.camera === 'Tracking Shot' && !c.move?.dir) warn.push(`${key} 跟拍没写方向（move.dir：后方 / 前方 / 左侧 / 右侧）`);
      // 实测通过后删掉这条预检
      if (['Crane', 'POV'].includes(c.camera) || th) warn.push(`${key} ${th ? '两阶段运镜' : c.camera} 还没实测过：先拿这一镜出试探镜头`);
      if (!c.move?.to && !c.move?.stop && c.camera !== 'Handheld') warn.push(`${key} ${c.camera} 没写终点（move.to / move.stop）：AI 会一直动，补上从哪到哪、在什么时候停`);
      if (spoken.length > 1) warn.push(`${key} 有多句台词又带运镜：表演和台词已经够满，先考虑固定镜头`);
    }
    // 人物的异样特征（瞎眼、伤疤）模型会自动「修好」，入画就中英文各写一遍；背对镜头不写，免得招来回头
    const tr = chars.filter((id) => !state[charName.get(id)]?.back && charName.get(id) !== povOwner)
      .map((id) => W.char.get(id)?.trait).filter((t) => t?.zh);
    for (const t of tr) if (!(c.limits ?? []).some((x) => x.includes(t.zh))) limits.push(t.zh);
    limits.push('人物数量不变，服装、发型、场景结构保持首帧一致');
    limits.push('单一连续镜头，全程无剪切，不瞬移，不换机位，空间方向保持一致'); // 只写「一镜到底」仍可能跳切
    limits.push(...(c.limits ?? []));
    for (const l of lines.filter((x) => x.kind === 'inner')) {
      const owner = charName.get(l.who);
      if (owner && inCut.has(owner) && (state[owner]?.back || chars.length > 1))
        warn.push(`${key} ${owner}的心声，但画面里${state[owner]?.back ? '本人背对镜头' : '还有别人'}：看着像在对人说话，建议首帧改成只拍${owner}的脸、嘴闭着`);
    }
    const others = cast.filter((x) => x !== en(povOwner));
    const people = handOnly ? 'Only the hands, sleeves and props in the frame; no face, no head, no person appears at any time.'
      : povOwner ? `First-person view of ${en(povOwner)}: only their own hands and sleeves may appear at the bottom edge${others.length ? `; besides them, only ${others.join(' and ')} in the frame` : ''}; nobody else.`
      : cast.length ? `Only ${cast.join(' and ')} in the frame; nobody else.` : 'No people in the frame.';
    const quiet = lines.length ? '' : ' Nobody speaks.';
    const shot = {
      key, img: `frames/${seg.id}/f${ci + 1}.png`, seconds, need: Math.round(need * 10) / 10,
      size: SIZE[c.size] ?? c.size, scene: sceneLabel, rig, action, eye, pace,
      move: mv ? { zh: mv.zh, en: mv.en } : null, camera: mv ? null : (CAM[c.camera] ?? null),
      ambient: amb ?? null, traits: tr.map((t) => t.en), lines: said, limits, people: people + quiet,
    };
    shots[key] = shot;
    out[key] = { img: shot.img, seconds, prompt: target.render(shot, W.project) };
    made++;
  });
}
mkdirSync(outDir, { recursive: true });
writeJson(shotsFile, shots);
writeJson(outFile, out);
console.log(`✓ ${epTag(epNo)} 按 ${targetName} 新写 ${made} 条 → ${outFile}（共 ${Object.keys(out).length} 条；镜头描述 shots.json）`);
if (![...W.char.values()].some((c) => c.alias?.en)) console.log('· 人物没写 alias：提示词里用的是中文人名，视频模型不认识人名，建议补上外貌短语');
console.log(warn.length ? `预检 ${warn.length} 条：\n  ${warn.join('\n  ')}` : '预检通过');
