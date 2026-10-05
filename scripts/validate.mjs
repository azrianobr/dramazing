#!/usr/bin/env node
// 分镜校验：出图前跑一遍。✗ 是必须改的错，⚠️ 是提醒（可以接受，但要知道）。
// 用法：validate.mjs --work <作品目录> --ep <集>

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { T, cutBeats, episodeScenes, epTag, flag, lang, loadWork, phrases, segmentsOf, speakSeconds } from './lib.mjs';

const argv = process.argv.slice(2);
if (!flag(argv, '--work')) { console.log(T('validate.mjs --work <作品目录> --ep <集>', 'validate.mjs --work <work dir> --ep <episode>', 'validate.mjs --work <작품 폴더> --ep <화>')); process.exit(0); }
const W = loadWork(flag(argv, '--work'));
const P = await phrases();
const J = T('、', ', ', ', ');
const ep = Number(flag(argv, '--ep', '1'));
const err = [], warn = [];
const SIZES = ['extreme-wide', 'wide', 'full', 'medium', 'medium-close', 'close', 'extreme-close'];
const CAMERAS = ['Static Shot', 'Push In', 'Pull Out', 'Pan', 'Tilt', 'Rack Focus', 'Tracking Shot', 'Handheld', 'Crane', 'POV'];

const scenes = episodeScenes(W.script, ep);
for (const sc of scenes) {
  if (!W.scene.has(sc.scene)) err.push(T(`剧本第 ${sc.index} 场的场景 ${sc.scene} 不在 project.json 里`, `script scene ${sc.index}: location ${sc.scene} is not in project.json`, `대본 ${sc.index}장: 장소 ${sc.scene}이(가) project.json에 없습니다`));
  for (const b of sc.beats) {
    const at = T(`第 ${sc.index} 场第 ${b.n} 拍`, `scene ${sc.index}, beat ${b.n}`, `${sc.index}장 ${b.n}번째 비트`);
    if (b.who && !W.char.has(b.who)) err.push(T(`${at}：说话人 ${b.who} 不在 project.json 里`, `${at}: speaker ${b.who} is not in project.json`, `${at}: 화자 ${b.who}이(가) project.json에 없습니다`));
    if (b.say && /——|—|--/.test(b.say)) (P.dashIsError ? err : warn).push(P.dashIsError
      ? T(`${at}：台词有破折号，视频模型会念成「一」，改成逗号`, `${at}: the line has a dash; Chinese video models read it as "yi", use a comma`, `${at}: 대사에 대시가 있습니다. 영상 모델이 "一"로 읽으니 쉼표로 바꾸세요`)
      : T(`${at}：台词有破折号，提示词里会换成逗号停顿`, `${at}: the line has a dash; the prompt turns it into a comma pause`, `${at}: 대사에 대시가 있습니다. 프롬프트에서 쉼표 쉼으로 바뀝니다`));
    if (b.tone && P.toneAction.test(b.tone)) warn.push(T(`${at}：tone 里像是动作（${b.tone}），动作要单独写成一拍 act，tone 只写语气`, `${at}: tone looks like an action (${b.tone}); write actions as their own act beat, keep tone for delivery`, `${at}: tone에 동작이 섞인 것 같습니다(${b.tone}). 동작은 별도 act 비트로, tone에는 말투만 쓰세요`));
  }
}

// 每场的节拍要被分镜按顺序完整覆盖，不重不漏
const covered = new Map(scenes.map((s) => [s.index, []]));
let total = 0;
for (const seg of segmentsOf(W.storyboard, ep)) {
  const sc = scenes[seg.scene - 1];
  if (!sc) { err.push(T(`${seg.id}：scene ${seg.scene} 在剧本第 ${ep} 集里不存在`, `${seg.id}: scene ${seg.scene} does not exist in episode ${ep} of the script`, `${seg.id}: 대본 ${ep}화에 scene ${seg.scene}이(가) 없습니다`)); continue; }
  seg.cuts.forEach((c, i) => {
    const k = `${seg.id}/s${i + 1}`;
    total += c.seconds;
    if (!Array.isArray(c.beats) || c.beats.length !== 2 || c.beats[0] > c.beats[1]) { err.push(T(`${k}：beats 要写成 [起, 止]`, `${k}: beats must be [from, to]`, `${k}: beats는 [시작, 끝]으로 쓰세요`)); return; }
    covered.get(sc.index).push([...c.beats, k]);
    if (!c.frame?.trim()) err.push(T(`${k}：没写 frame（首帧画面）`, `${k}: no frame (first-frame picture)`, `${k}: frame(첫 프레임 화면)이 없습니다`));
    if (!c.action?.trim()) err.push(T(`${k}：没写 action（镜头里发生什么）`, `${k}: no action (what happens in the shot)`, `${k}: action(숏에서 일어나는 일)이 없습니다`));
    if (!SIZES.includes(c.size)) err.push(T(`${k}：size「${c.size}」不认识，可选 ${SIZES.join(' / ')}`, `${k}: unknown size "${c.size}"; choose ${SIZES.join(' / ')}`, `${k}: 알 수 없는 size "${c.size}". 선택: ${SIZES.join(' / ')}`));
    if (c.camera && !CAMERAS.includes(c.camera)) err.push(T(`${k}：camera「${c.camera}」不认识，可选 ${CAMERAS.join(' / ')}`, `${k}: unknown camera "${c.camera}"; choose ${CAMERAS.join(' / ')}`, `${k}: 알 수 없는 camera "${c.camera}". 선택: ${CAMERAS.join(' / ')}`));
    for (const id of c.chars ?? []) if (!W.char.has(id)) err.push(T(`${k}：人物 ${id} 不在 project.json 里`, `${k}: character ${id} is not in project.json`, `${k}: 인물 ${id}이(가) project.json에 없습니다`));
    for (const id of c.props ?? []) if (!W.prop.has(id)) err.push(T(`${k}：道具 ${id} 不在 project.json 里`, `${k}: prop ${id} is not in project.json`, `${k}: 소품 ${id}이(가) project.json에 없습니다`));
    if (c.seconds < 2 || c.seconds > 10) err.push(T(`${k}：${c.seconds} 秒，单切要在 2–10 秒之间`, `${k}: ${c.seconds} s; a cut must be 2–10 s`, `${k}: ${c.seconds}초. 컷은 2–10초여야 합니다`));
    const talk = cutBeats(sc, c).filter((b) => b.say).reduce((s, b) => s + speakSeconds(b.say), 0);
    if (talk > 10) err.push(T(`${k}：台词约 ${talk.toFixed(1)} 秒，一条视频最长 10 秒装不下，拆成两切`, `${k}: dialogue runs about ${talk.toFixed(1)} s; one clip holds at most 10 s, split it into two cuts`, `${k}: 대사 약 ${talk.toFixed(1)}초. 클립 하나는 최대 10초이니 두 컷으로 나누세요`));
    else if (talk > c.seconds + 0.5) warn.push(T(`${k}：台词约 ${talk.toFixed(1)} 秒，分镜给 ${c.seconds} 秒，剪辑会按台词留长`, `${k}: dialogue runs about ${talk.toFixed(1)} s but the cut is ${c.seconds} s; the edit will keep it longer`, `${k}: 대사 약 ${talk.toFixed(1)}초, 컷은 ${c.seconds}초. 편집에서 대사 길이만큼 남깁니다`));
    if (c.camera && !['Static Shot', 'Handheld'].includes(c.camera) && !c.move?.to && !c.move?.stop) warn.push(T(`${k}：${c.camera} 没写 move.to / move.stop，AI 会一直动`, `${k}: ${c.camera} has no move.to / move.stop; the AI will keep moving`, `${k}: ${c.camera}에 move.to / move.stop이 없습니다. AI가 계속 움직입니다`));
    if (['Pull Out', 'Pan', 'Rack Focus', 'Crane'].includes(c.camera)) warn.push(T(`${k}：${c.camera} 的首帧要画成运镜「起点」的构图，画成终点模型就没东西可动`, `${k}: draw the ${c.camera} first frame at the START of the move; if it shows the end, the model has nothing to move`, `${k}: ${c.camera}의 첫 프레임은 움직임의 "시작" 구도로 그리세요. 끝 구도면 모델이 움직일 게 없습니다`));
    if (P.young.test(c.frame ?? '') && !P.adult.test(c.frame ?? '') && ['close', 'extreme-close', 'medium-close'].includes(c.size))
      warn.push(T(`${k}：近景里的年轻人物没写「成年」，可能被判成未成年人而不出片`, `${k}: a young character in a close shot is not described as an adult; the tool may flag them as a minor and refuse`, `${k}: 근접 숏의 젊은 인물에 "성인"이 없습니다. 미성년자로 판정되어 생성이 거부될 수 있습니다`));
  });
}
for (const sc of scenes) {
  const spans = covered.get(sc.index);
  let next = 1;
  for (const [a, b, k] of spans) {
    if (a !== next) err.push(T(`第 ${sc.index} 场：${k} 从第 ${a} 拍开始，前面应接第 ${next} 拍（${a > next ? '漏了' : '重了'}）`, `scene ${sc.index}: ${k} starts at beat ${a} but should start at beat ${next} (${a > next ? 'gap' : 'overlap'})`, `${sc.index}장: ${k}이(가) ${a}번째 비트에서 시작하지만 ${next}번째에서 시작해야 합니다(${a > next ? '누락' : '중복'})`));
    next = b + 1;
  }
  if (spans.length && next - 1 !== sc.beats.length) err.push(T(`第 ${sc.index} 场：分镜只覆盖到第 ${next - 1} 拍，剧本有 ${sc.beats.length} 拍`, `scene ${sc.index}: the storyboard covers up to beat ${next - 1}, the script has ${sc.beats.length}`, `${sc.index}장: 콘티는 ${next - 1}번째 비트까지, 대본은 ${sc.beats.length}비트입니다`));
}
const target = W.script.episodes.find((e) => e.ep === ep)?.targetSeconds ?? W.project.targetSeconds;
const [lo, hi] = Array.isArray(target) ? target : [target, target];
if (lo && (total < lo * 0.9 || total > hi * 1.1)) warn.push(T(`整集分镜 ${total.toFixed(1)} 秒，目标 ${lo === hi ? lo : `${lo}–${hi}`} 秒`, `episode storyboard is ${total.toFixed(1)} s, target ${lo === hi ? lo : `${lo}–${hi}`} s`, `에피소드 콘티 ${total.toFixed(1)}초, 목표 ${lo === hi ? lo : `${lo}–${hi}`}초`));
const missing = [...new Set(segmentsOf(W.storyboard, ep).flatMap((s) => s.cuts.flatMap((c) => c.chars ?? [])))]
  .filter((id) => !W.char.get(id)?.alias?.en);
if (missing.length) warn.push(T(`人物 ${missing.join(J)} 没写 alias.en：视频模型不认识人名，提示词里需要外貌短语`, `characters ${missing.join(J)} have no alias.en: video models do not know names, the prompt needs an appearance phrase`, `인물 ${missing.join(J)}에 alias.en이 없습니다: 영상 모델은 이름을 모르니 외모 문구가 필요합니다`));
// trait 要有故事语言和英文两项，缺故事语言那项时视频提示词会把它整条跳过
const noTrait = W.project.characters.filter((c) => c.trait && (!c.trait[lang()] || !c.trait.en)).map((c) => c.id);
if (noTrait.length) warn.push(T(`人物 ${noTrait.join(J)} 的 trait 缺 ${lang()} 或 en：缺的那项不会写进视频提示词`, `characters ${noTrait.join(J)}: trait lacks ${lang()} or en; the missing one never reaches the video prompt`, `인물 ${noTrait.join(J)}: trait에 ${lang()} 또는 en이 없습니다. 빠진 쪽은 영상 프롬프트에 들어가지 않습니다`));
if (!existsSync(join(W.work, 'story.txt'))) warn.push(T('作品目录里没有 story.txt（原文），复盘和改编时没法对照', 'no story.txt (the source text) in the work dir; reviews and adaptation have nothing to check against', '작품 폴더에 story.txt(원문)가 없습니다. 회고와 각색 때 대조할 수 없습니다'));

const nSeg = segmentsOf(W.storyboard, ep).length, nCut = segmentsOf(W.storyboard, ep).reduce((s, g) => s + g.cuts.length, 0);
console.log(T(`${epTag(ep)}：${nSeg} 段，${nCut} 切，${total.toFixed(1)} 秒`, `${epTag(ep)}: ${nSeg} segments, ${nCut} cuts, ${total.toFixed(1)} s`, `${epTag(ep)}: ${nSeg}개 시퀀스, ${nCut}컷, ${total.toFixed(1)}초`));
for (const e of err) console.log(`  ✗ ${e}`);
for (const w of warn) console.log(`  ⚠️ ${w}`);
if (!err.length) console.log(T(`  ✓ 没有必须改的错${warn.length ? `，${warn.length} 条提醒` : ''}`, `  ✓ No errors${warn.length ? `, ${warn.length} warnings` : ''}`, `  ✓ 반드시 고칠 오류 없음${warn.length ? `, 경고 ${warn.length}건` : ''}`));
process.exit(err.length ? 1 : 0);
