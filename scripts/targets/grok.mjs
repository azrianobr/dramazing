// Grok Imagine 网页版（实测：《渡口》6 集，2026 年 10 月）
// 首帧 + 一段文字，6 / 10 秒（页面后来加了 15 秒档，未实测，要用就在 project.json 的 video.durations 里加上）。
// 能听懂中英混写；台词用英文描述口型、引号里放原文效果最好。
import { body, FILM_HEAD } from './_common.mjs';

export default {
  durations: [6, 10],
  render(shot, project, ctx) {
    const head = project.video?.head || FILM_HEAD; // 胶片质感防塑料脸；不点名「不要出现的东西」
    // 弱写法「No subtitles, no text」实测会被无视：台词多的镜头 Grok 自己烧中文字幕、在衣服上加字（智汇分账通 E03，2026-10）
    const tail = project.video?.tail || 'No subtitles, no captions, no text or lettering anywhere in the frame, nothing printed on clothing, no music.';
    // 有台词的镜头把这句挪到最前面：放在句尾时 Grok 仍会烧字幕，挪到开头两次都干净（《各论各的》《真的》，2026-10）
    const parts = shot.lines?.length ? [tail, head, ...body(shot, ctx)] : [head, ...body(shot, ctx), tail];
    return parts.join(' '); // 不用换行：页面输入框里回车会直接提交
  },
};
