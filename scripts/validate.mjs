#!/usr/bin/env node
// 分镜校验：出图前跑一遍。✗ 是必须改的错，⚠️ 是提醒（可以接受，但要知道）。
// 用法：validate.mjs --work <作品目录> --ep <集>

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { INSERT_FITS, TITLE_POS, T, cutBeats, episodeScenes, epTag, flag, insertOf, lang, loadWork, titleOf, phrases, segmentsOf, speakSeconds } from './lib.mjs';

const argv = process.argv.slice(2);
if (!flag(argv, '--work')) { console.log(T('validate.mjs --work <作品目录> --ep <集>', 'validate.mjs --work <work dir> --ep <episode>', 'validate.mjs --work <작품 폴더> --ep <화>')); process.exit(0); }
const W = loadWork(flag(argv, '--work'));
const P = await phrases();
const J = T('、', ', ', ', ');
const ep = Number(flag(argv, '--ep', '1'));
const err = [], warn = [];
const SIZES = ['extreme-wide', 'wide', 'full', 'medium', 'medium-close', 'close', 'extreme-close'];
const CAMERAS = ['Static Shot', 'Push In', 'Pull Out', 'Pan', 'Tilt', 'Rack Focus', 'Tracking Shot', 'Handheld', 'Crane', 'POV'];
const MEDIA = /\.(mp4|mov|m4v|webm|png|jpe?g|webp)$/i;
const { w: CW, h: CH } = W.aspect;
// 插入镜头 / 贴屏的素材：写成作品目录里的相对路径
function checkMedia(k, label, file) {
  if (typeof file !== 'string' || !file.trim()) return err.push(T(`${k}：${label} 没写 file`, `${k}: ${label} has no file`, `${k}: ${label}에 file이 없습니다`));
  if (!MEDIA.test(file)) err.push(T(`${k}：${label} 的 ${file} 不是视频或图片（mp4 / mov / webm / png / jpg / webp）`, `${k}: ${label} ${file} is not a video or image (mp4 / mov / webm / png / jpg / webp)`, `${k}: ${label}의 ${file}은(는) 영상이나 이미지가 아닙니다(mp4 / mov / webm / png / jpg / webp)`));
  else if (!existsSync(join(W.work, file))) warn.push(label === 'cover'
    ? T(`${k}：cover 的素材 ${file} 还没放进作品目录，剪辑会停`, `${k}: cover file ${file} is not in the work dir yet; the edit stops`, `${k}: cover 소재 ${file}이(가) 아직 작품 폴더에 없습니다. 편집은 멈춥니다`)
    : label === 'insert'
    ? T(`${k}：insert 的素材 ${file} 还没放进作品目录，叙事预览显示文字卡，剪辑会停`, `${k}: insert file ${file} is not in the work dir yet; the preview shows a text card and the edit stops`, `${k}: insert 소재 ${file}이(가) 아직 작품 폴더에 없습니다. 미리보기는 글자 카드, 편집은 멈춥니다`)
    : T(`${k}：screen 的素材 ${file} 还没放进作品目录，叙事预览照常用首帧，剪辑会停`, `${k}: screen file ${file} is not in the work dir yet; the preview still uses the first frame, the edit stops`, `${k}: screen 소재 ${file}이(가) 아직 작품 폴더에 없습니다. 미리보기는 그대로 첫 프레임, 편집은 멈춥니다`));
}

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
    const tt = titleOf(c);
    if (tt) {
      // 花字：剪辑时画成透明图层叠在这一切上，叙事预览也画出来
      if (typeof tt.text !== 'string' || !tt.text.trim()) err.push(T(`${k}：title 没写 text`, `${k}: title has no text`, `${k}: title에 text가 없습니다`));
      else if ([...tt.text].length > (CW < CH ? 6 : 10)) warn.push(T(`${k}：花字「${tt.text}」偏长，${CW < CH ? '竖屏' : '横屏'}一行放不下就会缩小字号`, `${k}: title "${tt.text}" is long; it shrinks to fit one line`, `${k}: 화면 글자 "${tt.text}"이(가) 깁니다. 한 줄에 맞게 글자가 작아집니다`));
      if (tt.sub !== undefined && typeof tt.sub !== 'string') err.push(T(`${k}：title.sub 要写成文字`, `${k}: title.sub must be text`, `${k}: title.sub는 글자여야 합니다`));
      if (!TITLE_POS.includes(tt.pos)) err.push(T(`${k}：title.pos「${tt.pos}」不认识，可选 ${TITLE_POS.join(' / ')}`, `${k}: unknown title.pos "${tt.pos}"; choose ${TITLE_POS.join(' / ')}`, `${k}: 알 수 없는 title.pos "${tt.pos}". 선택: ${TITLE_POS.join(' / ')}`));
      if (!(tt.y >= 0.05 && tt.y <= 0.9)) err.push(T(`${k}：title.y ${tt.y} 要在 0.05–0.9 之间（画面高度的比例，花字中线的位置）`, `${k}: title.y ${tt.y} must be 0.05–0.9 (fraction of the frame height, centre line of the title)`, `${k}: title.y ${tt.y}는 0.05–0.9 사이여야 합니다(화면 높이 비율)`));
      if (!(tt.at >= 0 && tt.seconds >= 0.8 && tt.at + tt.seconds <= c.seconds + 1e-6)) err.push(T(`${k}：花字从第 ${tt.at} 秒起停 ${tt.seconds} 秒，要至少 0.8 秒并在这一切的 ${c.seconds} 秒里结束`, `${k}: title starts at ${tt.at} s for ${tt.seconds} s; it needs at least 0.8 s and must end within the cut's ${c.seconds} s`, `${k}: 화면 글자가 ${tt.at}초부터 ${tt.seconds}초. 0.8초 이상이고 컷의 ${c.seconds}초 안에 끝나야 합니다`));
    }
    const ins = insertOf(c);
    if (ins) {
      // 插入镜头：不出图不出片，只查素材、时长和台词
      checkMedia(k, 'insert', ins.file);
      if (!INSERT_FITS.includes(ins.fit)) err.push(T(`${k}：insert.fit「${ins.fit}」不认识，可选 ${INSERT_FITS.join(' / ')}`, `${k}: unknown insert.fit "${ins.fit}"; choose ${INSERT_FITS.join(' / ')}`, `${k}: 알 수 없는 insert.fit "${ins.fit}". 선택: ${INSERT_FITS.join(' / ')}`));
      if (c.screen) err.push(T(`${k}：insert 和 screen 不能写在同一切`, `${k}: insert and screen cannot be on the same cut`, `${k}: insert와 screen은 같은 컷에 쓸 수 없습니다`));
      if (!(c.seconds >= 2 && c.seconds <= 30)) err.push(T(`${k}：插入镜头 ${c.seconds} 秒，要在 2–30 秒之间`, `${k}: insert is ${c.seconds} s; it must be 2–30 s`, `${k}: 삽입 숏 ${c.seconds}초. 2–30초여야 합니다`));
      if (cutBeats(sc, c).some((b) => b.say)) err.push(T(`${k}：插入镜头里有台词或心声；插入镜头没有声音，台词放到前后的人物镜头里`, `${k}: the insert covers a line or inner voice; inserts have no sound, put the line in a shot with the character`, `${k}: 삽입 숏에 대사나 속마음이 있습니다. 삽입 숏에는 소리가 없으니 인물 숏으로 옮기세요`));
      return;
    }
    if (c.cover !== undefined) {
      // 盖画面：人物镜头照常出片、照常说台词，剪辑时从第 at 秒起画面换成录屏，声音不动
      const cv = typeof c.cover === 'string' ? { file: c.cover } : (c.cover ?? {});
      const at = cv.at ?? 1;
      checkMedia(k, 'cover', cv.file);
      if (!INSERT_FITS.includes(cv.fit ?? 'blur')) err.push(T(`${k}：cover.fit「${cv.fit}」不认识，可选 ${INSERT_FITS.join(' / ')}`, `${k}: unknown cover.fit "${cv.fit}"; choose ${INSERT_FITS.join(' / ')}`, `${k}: 알 수 없는 cover.fit "${cv.fit}". 선택: ${INSERT_FITS.join(' / ')}`));
      if (!(at >= 0 && at <= c.seconds - 0.5)) err.push(T(`${k}：cover.at ${at} 要在 0 到 ${c.seconds - 0.5} 秒之间`, `${k}: cover.at ${at} must be between 0 and ${c.seconds - 0.5} s`, `${k}: cover.at ${at}는 0–${c.seconds - 0.5}초여야 합니다`));
      if (c.screen) err.push(T(`${k}：cover 和 screen 不能写在同一切`, `${k}: cover and screen cannot be on the same cut`, `${k}: cover와 screen은 같은 컷에 쓸 수 없습니다`));
      if (!cutBeats(sc, c).some((b) => b.say)) warn.push(T(`${k}：cover 用在没有台词的镜头上，和插入镜头没区别，直接用 insert`, `${k}: cover on a shot without lines is just an insert; use insert`, `${k}: 대사 없는 숏의 cover는 삽입 숏과 같습니다. insert를 쓰세요`));
    }
    if (c.screen !== undefined) {
      // 贴屏：剪辑时把素材按四个角贴到画面里的屏幕上（左上、右上、右下、左下，成片画布像素）
      checkMedia(k, 'screen', c.screen?.file);
      const cs = c.screen?.corners;
      if (cs === undefined) warn.push(T(`${k}：screen 还没写 corners；出片后在镜头里量好屏幕四个角（左上、右上、右下、左下，${CW}×${CH} 画布的像素）再写，剪辑才会贴屏`, `${k}: screen has no corners yet; after the shot is made, measure the screen's four corners (top-left, top-right, bottom-right, bottom-left, in ${CW}×${CH} canvas pixels) so the edit can place it`, `${k}: screen에 corners가 아직 없습니다. 숏이 나온 뒤 화면 네 모서리(왼쪽 위, 오른쪽 위, 오른쪽 아래, 왼쪽 아래, ${CW}×${CH} 캔버스 픽셀)를 재서 쓰세요`));
      else if (!Array.isArray(cs) || cs.length !== 4 || cs.some((p) => !Array.isArray(p) || p.length !== 2 || !(p[0] >= 0 && p[0] <= CW && p[1] >= 0 && p[1] <= CH)))
        err.push(T(`${k}：screen.corners 要写成四个 [x, y]（左上、右上、右下、左下），都在 ${CW}×${CH} 画布里`, `${k}: screen.corners must be four [x, y] points (top-left, top-right, bottom-right, bottom-left) inside the ${CW}×${CH} canvas`, `${k}: screen.corners는 ${CW}×${CH} 캔버스 안의 [x, y] 네 개(왼쪽 위, 오른쪽 위, 오른쪽 아래, 왼쪽 아래)여야 합니다`));
      if (c.camera && c.camera !== 'Static Shot') warn.push(T(`${k}：贴屏的四个角是固定的，${c.camera} 会让屏幕移位，贴屏镜头用 Static Shot`, `${k}: screen corners are fixed; ${c.camera} moves the screen, use a Static Shot`, `${k}: 화면 모서리는 고정입니다. ${c.camera}은(는) 화면을 움직이니 Static Shot을 쓰세요`));
    }
    if (!c.frame?.trim()) err.push(T(`${k}：没写 frame（首帧画面）`, `${k}: no frame (first-frame picture)`, `${k}: frame(첫 프레임 화면)이 없습니다`));
    if (!c.action?.trim()) err.push(T(`${k}：没写 action（镜头里发生什么）`, `${k}: no action (what happens in the shot)`, `${k}: action(숏에서 일어나는 일)이 없습니다`));
    if (!SIZES.includes(c.size)) err.push(T(`${k}：size「${c.size}」不认识，可选 ${SIZES.join(' / ')}`, `${k}: unknown size "${c.size}"; choose ${SIZES.join(' / ')}`, `${k}: 알 수 없는 size "${c.size}". 선택: ${SIZES.join(' / ')}`));
    if (c.camera && !CAMERAS.includes(c.camera)) err.push(T(`${k}：camera「${c.camera}」不认识，可选 ${CAMERAS.join(' / ')}`, `${k}: unknown camera "${c.camera}"; choose ${CAMERAS.join(' / ')}`, `${k}: 알 수 없는 camera "${c.camera}". 선택: ${CAMERAS.join(' / ')}`));
    for (const id of c.chars ?? []) if (!W.char.has(id)) err.push(T(`${k}：人物 ${id} 不在 project.json 里`, `${k}: character ${id} is not in project.json`, `${k}: 인물 ${id}이(가) project.json에 없습니다`));
    for (const id of c.props ?? []) if (!W.prop.has(id)) err.push(T(`${k}：道具 ${id} 不在 project.json 里`, `${k}: prop ${id} is not in project.json`, `${k}: 소품 ${id}이(가) project.json에 없습니다`));
    if (c.place !== undefined && typeof c.place?.name !== 'string') err.push(T(`${k}：place 要写成 { "name": "…", "ambient": "…" }`, `${k}: place must be { "name": "…", "ambient": "…" }`, `${k}: place는 { "name": "…", "ambient": "…" } 형식이어야 합니다`));
    if (c.only !== undefined && (!c.only?.[lang()] || !c.only?.en)) warn.push(T(`${k}：only 要同时写故事语言（${lang()}）和 en 两个键`, `${k}: only needs both the story-language key (${lang()}) and en`, `${k}: only에는 이야기 언어(${lang()})와 en 키가 모두 필요합니다`));
    for (const id of c.sheets ?? []) if (!{ C: W.char, S: W.scene, P: W.prop }[String(id)[0]]?.has(id)) err.push(T(`${k}：sheets 里的 ${id} 不在 project.json 里`, `${k}: ${id} in sheets is not in project.json`, `${k}: sheets의 ${id}이(가) project.json에 없습니다`));
    if (c.seconds < 2 || c.seconds > 10) err.push(T(`${k}：${c.seconds} 秒，单切要在 2–10 秒之间`, `${k}: ${c.seconds} s; a cut must be 2–10 s`, `${k}: ${c.seconds}초. 컷은 2–10초여야 합니다`));
    const talk = cutBeats(sc, c).filter((b) => b.say).reduce((s, b) => s + speakSeconds(b.say), 0);
    if (talk > 10) err.push(T(`${k}：台词约 ${talk.toFixed(1)} 秒，一条视频最长 10 秒装不下，拆成两切`, `${k}: dialogue runs about ${talk.toFixed(1)} s; one clip holds at most 10 s, split it into two cuts`, `${k}: 대사 약 ${talk.toFixed(1)}초. 클립 하나는 최대 10초이니 두 컷으로 나누세요`));
    else if (talk > c.seconds + 0.5) warn.push(T(`${k}：台词约 ${talk.toFixed(1)} 秒，分镜给 ${c.seconds} 秒，剪辑会按台词留长`, `${k}: dialogue runs about ${talk.toFixed(1)} s but the cut is ${c.seconds} s; the edit will keep it longer`, `${k}: 대사 약 ${talk.toFixed(1)}초, 컷은 ${c.seconds}초. 편집에서 대사 길이만큼 남깁니다`));
    if (c.camera && !['Static Shot', 'Handheld'].includes(c.camera) && !c.move?.to && !c.move?.stop) warn.push(T(`${k}：${c.camera} 没写 move.to / move.stop，AI 会一直动`, `${k}: ${c.camera} has no move.to / move.stop; the AI will keep moving`, `${k}: ${c.camera}에 move.to / move.stop이 없습니다. AI가 계속 움직입니다`));
    if (['Pull Out', 'Pan', 'Rack Focus', 'Crane'].includes(c.camera)) warn.push(T(`${k}：${c.camera} 的首帧要画成运镜「起点」的构图，画成终点模型就没东西可动`, `${k}: draw the ${c.camera} first frame at the START of the move; if it shows the end, the model has nothing to move`, `${k}: ${c.camera}의 첫 프레임은 움직임의 "시작" 구도로 그리세요. 끝 구도면 모델이 움직일 게 없습니다`));
    // 景别和内容对不上：定义见 data-format.md 的景别表
    const spoken = cutBeats(sc, c).some((b) => b.say && !b.inner);
    if (c.size === 'extreme-close' && spoken) warn.push(T(`${k}：大特写里有人说话，嘴在不在画面里都对不上口型，改特写或中近景`, `${k}: someone speaks in an extreme close-up; lip sync fails whether the mouth is in frame or not; use a close-up or medium close-up`, `${k}: 익스트림 클로즈업에서 대사가 있습니다. 입이 화면에 있든 없든 립싱크가 맞지 않습니다. 클로즈업이나 미디엄 클로즈업으로 바꾸세요`));
    // 景别会写进首帧提示词：大特写只拍一个局部，画面写了整张脸就是特写
    if (c.size === 'extreme-close' && P.wholeFace.test(c.frame ?? '')) warn.push(T(`${k}：标的是大特写（一个局部），画面写的却是整张脸；整张脸是特写，改 size 为 close`, `${k}: marked extreme-close (one detail) but the frame describes a whole face; a whole face is a close-up, set size to close`, `${k}: 익스트림 클로즈업(한 부분)인데 화면 설명은 얼굴 전체입니다. 얼굴 전체는 클로즈업이니 size를 close로 바꾸세요`));
    if (c.size === 'full' && spoken && c.camera !== 'Push In') warn.push(T(`${k}：全景里有人说话，脸偏小，口型和长相容易走样；改中景，或用推镜推到近处`, `${k}: someone speaks in a full shot; the face is small and lips and looks drift; use a medium shot or push in`, `${k}: 풀숏에서 대사가 있습니다. 얼굴이 작아 입 모양과 얼굴이 흔들립니다. 미디엄 숏으로 바꾸거나 푸시 인으로 다가가세요`));
    if (P.young.test(c.frame ?? '') && !P.adult.test(c.frame ?? '') && ['close', 'extreme-close', 'medium-close'].includes(c.size))
      warn.push(T(`${k}：近景里的年轻人物没写「成年」，可能被判成未成年人而不出片`, `${k}: a young character in a close shot is not described as an adult; the tool may flag them as a minor and refuse`, `${k}: 근접 숏의 젊은 인물에 "성인"이 없습니다. 미성년자로 판정되어 생성이 거부될 수 있습니다`));
  });
}
for (const sc of scenes) {
  const spans = covered.get(sc.index);
  let next = 1;
  for (const [a, b, k] of spans) {
    const cont = a === next - 1 && a >= 1 && !sc.beats.find((x) => x.n === a)?.say; // 同一拍动作可以拆成相邻几切，台词拍不行
    if (a !== next && !cont) err.push(T(`第 ${sc.index} 场：${k} 从第 ${a} 拍开始，前面应接第 ${next} 拍（${a > next ? '漏了' : '重了'}）`, `scene ${sc.index}: ${k} starts at beat ${a} but should start at beat ${next} (${a > next ? 'gap' : 'overlap'})`, `${sc.index}장: ${k}이(가) ${a}번째 비트에서 시작하지만 ${next}번째에서 시작해야 합니다(${a > next ? '누락' : '중복'})`));
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
const subFont = W.project.subFont;
for (const k of ['intro', 'outro']) {
  const f = W.storyboard.episodes?.find((e) => e.ep === ep)?.[k];
  if (f && !/\.(mp4|mov|m4v)$/i.test(f)) err.push(T(`分镜的 ${k} 要是视频文件：${f}`, `storyboard ${k} must be a video file: ${f}`, `콘티의 ${k}는 동영상 파일이어야 합니다: ${f}`));
  else if (f && !existsSync(join(W.work, f))) warn.push(T(`分镜的 ${k} 素材 ${f} 还没放进作品目录，拼整集会停`, `storyboard ${k} file ${f} is not in the work dir yet; assemble will stop`, `콘티의 ${k} 소재 ${f}이(가) 아직 작품 폴더에 없습니다. 합치기가 멈춥니다`));
}
for (const a of W.storyboard.episodes?.find((e) => e.ep === ep)?.audio ?? []) {
  if (!a.file) err.push(T('分镜的 audio 每条都要写 file', 'every storyboard audio entry needs a file', '콘티의 audio 항목마다 file이 필요합니다'));
  else if (!existsSync(join(W.work, a.file))) warn.push(T(`分镜的 audio 素材 ${a.file} 还没放进作品目录，拼整集会停`, `storyboard audio file ${a.file} is not in the work dir yet; assemble will stop`, `콘티의 audio 소재 ${a.file}이(가) 아직 작품 폴더에 없습니다. 합치기가 멈춥니다`));
  if (a.duck != null && a.duck > 0) err.push(T(`分镜的 audio ${a.file} 的 duck 要写负数（压低多少 dB）`, `storyboard audio ${a.file}: duck must be negative (dB to lower)`, `콘티의 audio ${a.file}: duck은 음수(dB)여야 합니다`));
}
if (subFont && !existsSync(join(W.work, subFont))) err.push(T(`project.json 的 subFont 指向的字体文件不存在：${subFont}`, `project.json subFont points to a missing font file: ${subFont}`, `project.json의 subFont 글꼴 파일이 없습니다: ${subFont}`));
const subSize = W.project.subSize;
if (subSize != null && !(Number.isInteger(subSize) && subSize >= 24 && subSize <= 120)) err.push(T(`project.json 的 subSize 要是 24–120 的整数（字幕字号，像素）：${subSize}`, `project.json subSize must be an integer from 24 to 120 (subtitle size in pixels): ${subSize}`, `project.json의 subSize는 24–120 사이 정수(자막 크기, 픽셀)여야 합니다: ${subSize}`));
if (!existsSync(join(W.work, 'story.txt'))) warn.push(T('作品目录里没有 story.txt（原文），复盘和改编时没法对照', 'no story.txt (the source text) in the work dir; reviews and adaptation have nothing to check against', '작품 폴더에 story.txt(원문)가 없습니다. 회고와 각색 때 대조할 수 없습니다'));

const nSeg = segmentsOf(W.storyboard, ep).length, nCut = segmentsOf(W.storyboard, ep).reduce((s, g) => s + g.cuts.length, 0);
console.log(T(`${epTag(ep)}：${nSeg} 段，${nCut} 切，${total.toFixed(1)} 秒`, `${epTag(ep)}: ${nSeg} segments, ${nCut} cuts, ${total.toFixed(1)} s`, `${epTag(ep)}: ${nSeg}개 시퀀스, ${nCut}컷, ${total.toFixed(1)}초`));
for (const e of err) console.log(`  ✗ ${e}`);
for (const w of warn) console.log(`  ⚠️ ${w}`);
if (!err.length) console.log(T(`  ✓ 没有必须改的错${warn.length ? `，${warn.length} 条提醒` : ''}`, `  ✓ No errors${warn.length ? `, ${warn.length} warnings` : ''}`, `  ✓ 반드시 고칠 오류 없음${warn.length ? `, 경고 ${warn.length}건` : ''}`));
process.exit(err.length ? 1 : 0);
