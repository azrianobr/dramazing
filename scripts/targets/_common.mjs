// 各视频工具共用的渲染片段

/** 台词写法：语气说明放在台词后面并注明不念（放前面括号里会被当台词念出来）；
 *  要写明每个字都张嘴，否则压低声音这类语气会被做成嘴不动的画外音；心声写明谁都不动嘴 */
export function speech(lines, language = 'Mandarin Chinese') {
  return lines.map((l) => (l.kind === 'line'
    ? `${l.who} says, in ${language} with clearly moving lips in sync with every syllable (his or her mouth opens and closes visibly on each word): "${l.say}"${l.tone ? ` (performance note, never spoken aloud: ${l.tone})` : ''}`
    : `An off-screen inner-voice narration${l.who ? ` by ${l.who}` : ''}${l.tone ? ` (${l.tone})` : ''}, in ${language}: "${l.say}" It is a voiceover only: nobody on screen moves their lips or speaks.`)).join(' Then ');
}

/** 镜头描述的主体：中文写画面和限制，英文写运镜和台词 */
export function body(s, language) {
  return [
    `镜头 ${s.key}｜${s.seconds} 秒｜${s.size}${s.scene ? `｜${s.scene}` : ''}`,
    s.rig && `机位：${s.rig}。`,
    `动作：${s.action}${s.eye}${s.pace}`,
    s.move && `运镜：${s.move.zh}`,
    s.ambient && `环境：${s.ambient}`,
    [s.move ? s.move.en : (s.camera ?? ''), ...s.traits, speech(s.lines, language)].filter(Boolean).join(' '),
    `关键限制：${s.limits.join('；')}。`,
    s.people,
  ].filter(Boolean);
}

export const FILM_HEAD =
  'Real film footage shot on 35mm, natural soft contrast, gentle film grain, muted colors, no HDR, no oversharpening, no beauty filter. ' +
  'Keep the exact composition, faces and costumes from the image; faces stay unchanged throughout.';
