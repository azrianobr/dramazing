// Grok Imagine 网页版（实测：《渡口》6 集，2026 年 10 月）
// 首帧 + 一段文字，6 / 10 秒（页面后来加了 15 秒档，未实测，要用就在 project.json 的 video.durations 里加上）。
// 能听懂中英混写；台词用英文描述口型、引号里放原文效果最好。
import { body, FILM_HEAD } from './_common.mjs';

export default {
  durations: [6, 10],
  render(shot, project) {
    const head = project.video?.head || FILM_HEAD; // 胶片质感防塑料脸；不点名「不要出现的东西」
    const tail = 'No subtitles, no text, no music.';
    return [head, ...body(shot, project.video?.language ?? 'Mandarin Chinese'), tail].join(' '); // 不用换行：页面输入框里回车会直接提交
  },
};
