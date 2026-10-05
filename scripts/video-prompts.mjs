#!/usr/bin/env node
// 按分镜给每个镜头写视频提示词（首帧 = 该切的分镜图），并做出片前预检。分两层：
//   1. 镜头描述 shots.json：动作、视线、运镜、台词、限制，和用哪个视频工具无关；
//   2. 按目标工具渲染成 prompts.json：每个工具的时长档位和写法不同，见 scripts/targets/。
// 草稿要逐条过一遍再用：动作方向对不对首帧、谁出镜、台词是不是这一切说的。
// 已有的条目不覆盖（--force 才覆盖），手改过的提示词可以放心重跑。
// 每条规则后面括号里是它来自哪次实测，规则说明见 references/<语言>/prompt-rules.md。

import { existsSync, mkdirSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  LANGS, T, cutBeats, episodeScenes, epTag, flag, lang, loadWork, phrases, readOpt, segmentsOf, speakSeconds, speakable, writeJson,
} from './lib.mjs';

const TARGETS = readdirSync(new URL('./targets/', import.meta.url)).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).map((f) => f.slice(0, -4));

const argv = process.argv.slice(2);
if (!flag(argv, '--work')) {
  console.log(T(`video-prompts.mjs --work <作品目录> --ep <集> [--target <工具>] [--dir video] [--out <目录>] [--force]
  写 <dir>/shots.json（镜头描述，和工具无关）和 <dir>/prompts.json（键 E02-03/s1 → {img, seconds, prompt}），打印预检警告。
  --target 视频工具：${TARGETS.join(' / ')}，默认读 project.json 的 video.target，再默认 generic
  人物外貌短语、异样特征、场景环境动态都从 project.json 读（见 references/zh/data-format.md）。
  --out 把结果写到别的目录（回归测试用，不碰正式文件）`, `video-prompts.mjs --work <work dir> --ep <episode> [--target <tool>] [--dir video] [--out <dir>] [--force]
  Writes <dir>/shots.json (tool-independent shot descriptions) and <dir>/prompts.json (key E02-03/s1 -> {img, seconds, prompt}), and prints preflight warnings.
  --target  video tool: ${TARGETS.join(' / ')}; defaults to video.target in project.json, then generic
  Appearance phrases, traits and scene ambience come from project.json (see references/en/data-format.md).
  --out     write results to another directory (for regression tests; leaves the real files alone)`, `video-prompts.mjs --work <작품 폴더> --ep <화> [--target <도구>] [--dir video] [--out <폴더>] [--force]
  <dir>/shots.json(도구와 무관한 숏 설명)과 <dir>/prompts.json(키 E02-03/s1 -> {img, seconds, prompt})을 쓰고 사전 점검 경고를 출력합니다.
  --target  영상 도구: ${TARGETS.join(' / ')}. 기본값은 project.json의 video.target, 없으면 generic
  인물 외모 문구, 특징, 장소 분위기는 project.json에서 읽습니다(references/ko/data-format.md 참고).
  --out     결과를 다른 폴더에 씁니다(회귀 테스트용, 실제 파일은 건드리지 않음)`));
  process.exit(0);
}
const W = loadWork(flag(argv, '--work'));
const L = lang(), P = await phrases(), native = L !== 'en'; // native：提示词里除了本地语言，还要补一份英文
const epNo = Number(flag(argv, '--ep', '1'));
const dir = resolve(W.work, flag(argv, '--dir', 'video'));
const outDir = flag(argv, '--out') ? resolve(flag(argv, '--out')) : dir;
const force = argv.includes('--force');
const outFile = join(outDir, 'prompts.json');
const out = readOpt(outFile);
const shotsFile = join(outDir, 'shots.json');
const shots = readOpt(shotsFile);
const targetName = flag(argv, '--target') ?? W.project.video?.target ?? 'generic';
if (!TARGETS.includes(targetName)) { console.error(T(`✗ 没有这个视频工具：${targetName}（可选 ${TARGETS.join(' / ')}）`, `✗ Unknown video tool: ${targetName} (choose ${TARGETS.join(' / ')})`, `✗ 없는 영상 도구입니다: ${targetName} (선택: ${TARGETS.join(' / ')})`)); process.exit(1); }
const target = (await import(`./targets/${targetName}.mjs`)).default;
const durations = W.project.video?.durations ?? target.durations; // 工具的时长档位，升序
const ctx = { phrases: P, language: W.project.video?.language ?? LANGS[L].name };

const charName = new Map([...W.char.values()].map((c) => [c.id, c.name]));
const byName = new Map([...W.char.values()].map((c) => [c.name, c]));
const en = (n) => byName.get(n)?.alias?.en ?? n; // 英文句子里用外貌短语代替人名：视频模型不认识人名
const loc = (n) => byName.get(n)?.alias?.[L] ?? n; // 本地语言句子里的外貌短语
const who = (id) => en(charName.get(id) ?? id);
const names = W.names;
// 分镜常写称呼（「年轻女子」）而不是人名：人名、外貌短语、外貌短语的中心词都算提到了这个人
const mentions = (n) => [n, P.shortName(loc(n))];

const CAM = { 'Static Shot': 'Locked-off static camera.', 'Tracking Shot': 'Smooth tracking camera.', 'Push In': 'Slow small push-in.', 'Pull Out': 'Slow small pull-out.', 'Pan': 'Slow pan.', 'Handheld': 'Gentle handheld camera.' };

// 运镜：一镜只做一个主运镜，写全「名称 + 方向 + 速度 + 对象 + 起止画面 + 停点」，只写名称 AI 会一直动或乱动。
// 分镜切上可选 move: { from, to, stop, dir, speed, target, distance, level, who, height, then }
// 本地语言的写法在 lang/<语言>.mjs 的 moves 里；这里是补在后面的英文概括（故事是英文时不补）
const level = (m) => P.levels[m.level] ?? m.level ?? P.levels.calm; // level 可写本地词，也可写 calm / doc / intense
const MOVES_EN = {
  'Push In': () => 'Slow steady dolly push-in: the camera physically moves forward, no zoom.',
  'Pull Out': () => 'Slow steady dolly pull-out: the camera physically moves backward, no zoom.',
  'Pan': (m) => `Slow pan to the ${P.isLeft(m.dir) ? 'left' : 'right'}; the camera stays in place and only rotates.`,
  'Tilt': (m) => `Slow tilt ${P.isDown(m.dir) ? 'down' : 'up'}; the camera stays in place and only rotates.`,
  'Rack Focus': () => 'Rack focus: the camera and framing stay completely still; only the focus shifts.',
  // 跟拍分后方 / 前方引导 / 侧面并行
  'Tracking Shot': (m) => (P.isFront(m.dir) ? 'Smooth stabilized leading shot: the camera moves backward ahead of the subject, who walks toward it, at constant distance.'
    : P.isBehind(m.dir) ? 'Smooth stabilized follow shot from behind at constant distance.' : 'Smooth stabilized tracking shot at constant distance.'),
  // 手持是质感，仍要写强度、方向和距离
  'Handheld': (m) => (level(m) === P.levels.intense ? 'Intense handheld camera with noticeable shake; the subject stays recognizable.' : 'Restrained handheld camera: subtle breathing drift and footstep bob only.'),
  // 摇臂：沿弧线升降，同时改变高度和前后距离。未实测，首次使用先出试探镜头
  'Crane': (m) => `Slow crane shot ${P.isDown(m.dir) ? 'descending' : 'rising'} along a gentle arc; steady and weighty, not a drone.`,
  // 主观镜头：观众借用角色的眼睛，只能看到这人的手和袖口。未实测，首次使用先出试探镜头
  'POV': (m) => `First-person POV through the eyes of ${m.who ? en(m.who) : 'the character'} at eye height; only their hands and sleeves may enter the bottom of the frame.`,
};
const move = (cam, m) => {
  if (!P.moves[cam]) return null;
  const lv = level(m);
  const r = P.moves[cam](m, { front: P.isFront(m.dir), down: P.isDown(m.dir), level: lv, intense: lv === P.levels.intense,
    feel: P.handFeel[lv] ?? lv, owner: m.who ? loc(m.who) : undefined });
  return { text: r.text, en: native ? MOVES_EN[cam](m) : null, limits: r.limits };
};

const scenes = episodeScenes(W.script, epNo);
const warn = [];
let made = 0;
const join2 = (a) => a.join(T('、', ', ', ', '));
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
    if (['wide', 'extreme-wide'].includes(c.size) && spoken.length) warn.push(T(`${key} 远景里有人说话：脸太小会被重画，首帧建议改中景 / 中近景`, `${key} someone speaks in a wide shot: the face is too small and gets redrawn; make the first frame a medium / medium close-up`, `${key} 롱숏에서 대사가 있습니다: 얼굴이 작아 다시 그려집니다. 첫 프레임을 미디엄 / 미디엄 클로즈업으로 바꾸세요`));
    else if (['wide', 'extreme-wide'].includes(c.size) && cast.length) warn.push(T(`${key} 远景有人物（${join2(cast)}）：留意换脸，必要时首帧改近`, `${key} people in a wide shot (${join2(cast)}): watch for face swaps; move the first frame closer if needed`, `${key} 롱숏에 인물이 있습니다(${join2(cast)}): 얼굴이 바뀌는지 확인하고, 필요하면 첫 프레임을 가깝게`));
    if (talk > c.seconds + 0.5) warn.push(T(`${key} 台词约 ${talk.toFixed(1)}s，分镜只给 ${c.seconds}s：剪接会按台词留长`, `${key} dialogue runs about ${talk.toFixed(1)}s but the storyboard gives ${c.seconds}s: the edit will keep it longer`, `${key} 대사 약 ${talk.toFixed(1)}초, 콘티는 ${c.seconds}초: 편집에서 대사 길이만큼 남깁니다`));
    if (P.slowmo.test(c.action ?? '')) warn.push(T(`${key} 镜头描述里有慢动作，确认是否本意`, `${key} the action mentions slow motion: make sure that is intended`, `${key} 동작 설명에 슬로모션이 있습니다: 의도한 것인지 확인하세요`));
    if (!existsSync(join(W.work, 'frames', seg.id, `f${ci + 1}.png`))) warn.push(T(`${key} 缺首帧 frames/${seg.id}/f${ci + 1}.png`, `${key} missing first frame frames/${seg.id}/f${ci + 1}.png`, `${key} 첫 프레임 없음 frames/${seg.id}/f${ci + 1}.png`));
    if (out[key] && !force) return;
    // 台词：语气说明放在台词后面并注明不念，放前面括号里会被当台词念出来；
    // 只写 lips in sync 时，压低声音这类语气会被做成嘴不动的画外音，要写明每个字都张嘴
    // 心声：说话人不能动嘴，否则画面里的人会对口型
    const said = lines.map((l) => ({ kind: l.kind, who: l.who ? who(l.who) : null, say: speakable(l.say), tone: l.tone ?? null }));
    // 选工具能出的最短档位，装得下分镜时长和台词（台词后留 0.5 秒）
    const need = Math.max(c.seconds, talk + 0.5);
    const seconds = durations.find((d) => d >= need) ?? durations[durations.length - 1];
    const maxD = durations[durations.length - 1];
    if (need > maxD) warn.push(T(`${key} 需要约 ${need.toFixed(1)}s，${targetName} 最长 ${maxD}s：拆成两切`, `${key} needs about ${need.toFixed(1)}s but ${targetName} tops out at ${maxD}s: split it into two cuts`, `${key} 약 ${need.toFixed(1)}초 필요, ${targetName} 최대 ${maxD}초: 두 컷으로 나누세요`));
    const swap = (t) => (t ?? '').replace(new RegExp(names.join('|'), 'g'), loc);
    const place = W.scene.get(sc.scene);
    const sceneLabel = place?.name ?? '';
    const amb = place?.ambient?.[sc.light] ?? place?.ambient?.['*']; // 同一场景光线会变：先按光照找
    const action = P.sentence(swap(c.action));
    const pace = P.run.test(c.action ?? '') ? ' Real-time speed, NOT slow motion.' : '';
    const rig = [c.aim && P.aim(swap(c.aim)), c.angle, c.lens].filter(Boolean).join(P.join);
    // 画外的人只写方向，不写是谁：写了是谁，推近时模型会把人画进来
    const offEyeText = (e) => {
      const [first, ...rest] = e.split(P.comma);
      const side = (first.match(P.side) ?? [''])[0];
      const keep = rest.filter((r) => !names.some((n) => mentions(n).some((w) => r.includes(w)))).map(swap);
      return [P.offscreen(side), ...keep].join(P.join);
    };
    // 视线对象不在本镜人物里：写成画外，否则和「画面里只有某人」冲突
    const inCut = new Set(chars.map((id) => charName.get(id)));
    const offEye = names.some((n) => !inCut.has(n) && mentions(n).some((w) => (c.eyeline ?? '').includes(w)));
    const eye = !c.eyeline || P.noEye.test(c.eyeline.trim()) ? ''
      : offEye ? P.eye(offEyeText(c.eyeline)) : P.eye(swap(c.eyeline));
    // 关键限制：只限制「动作」，不点名「不要出现的东西」
    const limits = [];
    const state = {}; let cur = null; // 从首帧描述里按分句认每个人的姿态（坐着 / 背对镜头）
    for (const clause of (c.frame ?? '').split(P.clause)) {
      const n = names.find((x) => clause.includes(x)); if (n) cur = n;
      if (!cur) continue;
      state[cur] ??= {};
      if (P.sit.test(clause)) state[cur].sit = true;
      if (P.back.test(clause) && !P.negate.test(clause)) state[cur].back = true; // 否定句不算
    }
    const speakers = new Set(spoken.map((l) => charName.get(l.who)));
    // 手 / 道具的特写：写「只有某人」会让模型把整个人画出来，甚至画出两个
    const txt = `${c.action ?? ''}${native ? '' : ' '}${c.frame ?? ''}`;
    const handOnly = ['close', 'extreme-close'].includes(c.size) && P.hand.test(txt) && !P.face.test(txt) && !speakers.size;
    if (handOnly) limits.push(P.limit.hands);
    const povOwner = c.camera === 'POV' ? c.move?.who : null; // 主观镜头的主人只露手，不写他的姿态和口型
    if (c.camera === 'POV' && !povOwner) warn.push(T(`${key} POV 没写是谁的眼睛（move.who）`, `${key} POV does not say whose eyes (move.who)`, `${key} POV가 누구의 시선인지 없습니다(move.who)`));
    if (povOwner && speakers.has(povOwner)) warn.push(T(`${key} POV 的主人${povOwner}在说台词：观众看不到他的嘴，按心声处理或换镜头`, `${key} the POV owner ${povOwner} has a spoken line: the audience cannot see their mouth; make it an inner voice or change the shot`, `${key} POV의 주인 ${povOwner}에게 대사가 있습니다: 입이 보이지 않으니 속마음으로 처리하거나 숏을 바꾸세요`));
    for (const id of handOnly ? [] : chars.filter((x) => charName.get(x) !== povOwner)) {
      const n = charName.get(id), st = state[n] ?? {}, w = loc(n);
      if (st.sit && !P.rise.test(c.action ?? '')) limits.push(P.limit.sits(w));
      if (st.back && !P.turn.test(c.action ?? '')) limits.push(P.limit.back(w));
      if (!speakers.has(n)) limits.push(P.limit.mute(w));
      else if (!st.back) limits.push(P.limit.talk(w));
    }
    let mv = c.camera && c.camera !== 'Static Shot' ? move(c.camera, c.move ?? {}) : null;
    // 两阶段组合运镜：move.then = {camera, trigger, ...}。只给 10 秒镜头用，第二个动作必须有触发点。未实测
    const th = c.move?.then;
    const mv2 = mv && th ? move(th.camera, th) : null;
    if (mv2) {
      mv = { text: P.twoPhase(mv.text, th.trigger, mv2.text), en: native ? `${mv.en} Then, ${mv2.en}` : null,
        limits: [...new Set([...mv.limits, ...mv2.limits].filter(P.solo)), P.limit.phase2] };
      if (!th.trigger) warn.push(T(`${key} 两阶段运镜没写触发点（move.then.trigger）：AI 会把两个动作混在一起`, `${key} two-phase move has no trigger (move.then.trigger): the AI will blend both moves`, `${key} 2단계 카메라 움직임에 전환 시점이 없습니다(move.then.trigger): 두 동작이 섞입니다`));
      if (seconds < 10) warn.push(T(`${key} 两阶段运镜用在 ${seconds}s 的镜头上：太短，拆成两镜`, `${key} two-phase move on a ${seconds}s shot: too short, split it into two shots`, `${key} ${seconds}초 숏에 2단계 카메라 움직임: 너무 짧으니 두 숏으로 나누세요`));
    }
    if (c.camera === 'Static Shot') limits.push(P.limit.still);
    if (mv) {
      limits.push(...mv.limits);
      if (c.camera === 'Handheld' && !c.move?.level) warn.push(T(`${key} 手持没写强度（move.level：${Object.values(P.levels).join(' / ')}），默认按${P.levels.calm}写`, `${key} handheld has no intensity (move.level: ${Object.values(P.levels).join(' / ')}); defaulting to ${P.levels.calm}`, `${key} 핸드헬드 강도가 없습니다(move.level: ${Object.values(P.levels).join(' / ')}). 기본값 ${P.levels.calm}`));
      if (c.camera === 'Tracking Shot' && !c.move?.dir) warn.push(T(`${key} 跟拍没写方向（move.dir：${P.dirHint}）`, `${key} tracking shot has no direction (move.dir: ${P.dirHint})`, `${key} 트래킹 숏에 방향이 없습니다(move.dir: ${P.dirHint})`));
      // 实测通过后删掉这条预检
      const what = th ? T('两阶段运镜', 'two-phase move', '2단계 카메라 움직임') : c.camera;
      if (['Crane', 'POV'].includes(c.camera) || th) warn.push(T(`${key} ${what} 还没实测过：先拿这一镜出试探镜头`, `${key} ${what} has not been tested yet: make a trial shot of this one first`, `${key} ${what}은(는) 아직 실측 전입니다: 이 숏으로 먼저 시험 컷을 만드세요`));
      if (!c.move?.to && !c.move?.stop && c.camera !== 'Handheld') warn.push(T(`${key} ${c.camera} 没写终点（move.to / move.stop）：AI 会一直动，补上从哪到哪、在什么时候停`, `${key} ${c.camera} has no end point (move.to / move.stop): the AI keeps moving; say from where to where and when it stops`, `${key} ${c.camera}에 끝점이 없습니다(move.to / move.stop): 계속 움직이니 어디서 어디까지, 언제 멈추는지 쓰세요`));
      if (spoken.length > 1) warn.push(T(`${key} 有多句台词又带运镜：表演和台词已经够满，先考虑固定镜头`, `${key} several lines plus a camera move: the shot is already full; consider a static camera first`, `${key} 대사 여러 줄에 카메라 움직임까지: 이미 꽉 찼으니 고정 숏을 먼저 고려하세요`));
    }
    // 人物的异样特征（瞎眼、伤疤）模型会自动「修好」，入画就用本地语言和英文各写一遍；背对镜头不写，免得招来回头
    const tr = chars.filter((id) => !state[charName.get(id)]?.back && charName.get(id) !== povOwner)
      .map((id) => W.char.get(id)?.trait).filter((t) => t?.[L]);
    for (const t of tr) if (!(c.limits ?? []).some((x) => x.includes(t[L]))) limits.push(t[L]);
    limits.push(P.limit.sameCast);
    limits.push(P.limit.oneTake); // 只写「一镜到底」仍可能跳切
    limits.push(...(c.limits ?? []).map(swap)); // 手写限制里的人名也换成外貌短语
    for (const l of lines.filter((x) => x.kind === 'inner')) {
      const owner = charName.get(l.who);
      if (owner && inCut.has(owner) && (state[owner]?.back || chars.length > 1))
        warn.push(state[owner]?.back
          ? T(`${key} ${owner}的心声，但画面里本人背对镜头：看着像在对人说话，建议首帧改成只拍${owner}的脸、嘴闭着`, `${key} inner voice of ${owner}, but they have their back to the camera: it reads as talking to someone; make the first frame ${owner}'s face only, mouth closed`, `${key} ${owner}의 속마음인데 본인이 카메라를 등지고 있습니다: 누군가에게 말하는 것처럼 보이니, 첫 프레임을 ${owner}의 얼굴만, 입을 다문 모습으로`)
          : T(`${key} ${owner}的心声，但画面里还有别人：看着像在对人说话，建议首帧改成只拍${owner}的脸、嘴闭着`, `${key} inner voice of ${owner}, but others are in the frame: it reads as talking to someone; make the first frame ${owner}'s face only, mouth closed`, `${key} ${owner}의 속마음인데 다른 인물도 화면에 있습니다: 누군가에게 말하는 것처럼 보이니, 첫 프레임을 ${owner}의 얼굴만, 입을 다문 모습으로`));
    }
    const others = cast.filter((x) => x !== en(povOwner));
    const people = handOnly ? 'Only the hands, sleeves and props in the frame; no face, no head, no person appears at any time.'
      : povOwner ? `First-person view of ${en(povOwner)}: only their own hands and sleeves may appear at the bottom edge${others.length ? `; besides them, only ${others.join(' and ')} in the frame` : ''}; nobody else.`
      : cast.length ? `Only ${cast.join(' and ')} in the frame; nobody else.` : 'No people in the frame.';
    const quiet = lines.length ? '' : ' Nobody speaks.';
    const shot = {
      key, img: `frames/${seg.id}/f${ci + 1}.png`, seconds, need: Math.round(need * 10) / 10,
      size: P.sizes[c.size] ?? c.size, scene: sceneLabel, rig, action, eye, pace,
      move: mv ? { text: mv.text, en: mv.en } : null, camera: mv ? null : (CAM[c.camera] ?? null),
      ambient: amb ?? null, traits: native ? tr.map((t) => t.en) : [], lines: said, limits, people: people + quiet,
    };
    shots[key] = shot;
    const text = target.render(shot, W.project, ctx);
    out[key] = { img: shot.img, seconds, prompt: P.fix ? P.fix(text, [...W.char.values()].map((x) => x.alias?.[L])) : text }; // 한국어: 조사 맞추기
    made++;
  });
}
mkdirSync(outDir, { recursive: true });
writeJson(shotsFile, shots);
writeJson(outFile, out);
const total = Object.keys(out).length;
console.log(T(`✓ ${epTag(epNo)} 按 ${targetName} 新写 ${made} 条 → ${outFile}（共 ${total} 条；镜头描述 shots.json）`, `✓ ${epTag(epNo)} wrote ${made} new ${targetName} prompts -> ${outFile} (${total} in all; shot descriptions in shots.json)`, `✓ ${epTag(epNo)} ${targetName} 프롬프트 ${made}개 새로 작성 -> ${outFile} (전체 ${total}개, 숏 설명은 shots.json)`));
if (native && ![...W.char.values()].some((c) => c.alias?.en)) console.log(T('· 人物没写 alias：提示词里用的是中文人名，视频模型不认识人名，建议补上外貌短语', '· No character has alias.en: the prompts use bare names, which video models do not know; add appearance phrases', '· 인물에 alias.en이 없습니다: 프롬프트에 이름만 들어가는데 영상 모델은 이름을 모릅니다. 외모 문구를 추가하세요'));
console.log(warn.length ? T(`预检 ${warn.length} 条：\n  ${warn.join('\n  ')}`, `Preflight, ${warn.length} warnings:\n  ${warn.join('\n  ')}`, `사전 점검 ${warn.length}건:\n  ${warn.join('\n  ')}`) : T('预检通过', 'Preflight passed', '사전 점검 통과'));
