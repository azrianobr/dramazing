// 通用写法：给任何「首帧 + 文字 → 视频」的工具用（可灵、即梦、Veo、Runway、Hailuo 等）。未逐一实测。
// 结构和 grok 一样，只是时长档位按常见的 5 / 10 秒，并分行输出，方便粘进不同的输入框。
// 某个工具实测出了自己的规律，就照 grok.mjs 另写一个 targets/<工具>.mjs。
import { body, FILM_HEAD } from './_common.mjs';

export default {
  durations: [5, 10],
  render(shot, project, ctx) {
    const head = project.video?.head || FILM_HEAD;
    const tail = project.video?.tail ?? 'No subtitles, no on-screen text, no background music.';
    return [head, ...body(shot, ctx), tail].join('\n');
  },
};
