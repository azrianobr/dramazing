# 用其他视频工具出片

> 未实测。dramazing 只在 Grok 网页上完整做过一部作品（见 `video-grok.md`）。下面是按「首帧 + 文字 → 视频」这一类工具的共性写的，换工具后第一集多出几条试探镜头，把实测结果补进这里。

## 工具要满足的条件

| 条件 | 为什么 |
|---|---|
| 能用一张图做首帧 | 人物、服装、场景的一致性全靠首帧 |
| 能说故事语言的台词，口型对得上 | 短剧靠对白推进；只能出无声画面的工具要另配音 |
| 能出 5 到 10 秒 | 一切一般 2 到 8 秒，留余量给剪辑 |
| 能出 16:9、1080p 左右 | 和首帧、成片一致 |

可灵、即梦、Veo、Runway、海螺这类工具大多满足前三条里的大部分，具体以当前版本为准。

## 提示词

```bash
node scripts/video-prompts.mjs --work $W --ep 1 --target generic
```

- `video/shots.json`：每切的镜头描述，和工具无关。
- `video/prompts.json`：`generic` 写法，分行输出，时长档位 5 / 10 秒。

工具的时长档位不同，就在 `project.json` 里写：

```json
"video": { "target": "generic", "durations": [5, 10] }
```

## 给某个工具写专用写法

实测出某个工具自己的规律后（比如它更听英文、要某种开头、输入框里不能换行），照 `scripts/targets/grok.mjs` 写一个 `scripts/targets/<工具名>.mjs`：

```js
import { body, FILM_HEAD } from './_common.mjs';
export default {
  durations: [5, 10],             // 这个工具的时长档位，升序
  render(shot, project, ctx) {    // shot 是 shots.json 里的一条；ctx 带故事语言的固定句子和语言名
    return [FILM_HEAD, ...body(shot, ctx), '...'].join('\n');
  },
};
```

然后 `--target <工具名>` 就能用。`body()` 已经按 `prompt-rules.md` 写好了动作、视线、运镜、台词和限制，一般只改开头、结尾和拼接方式。

## 出片和收片

1. 上传首帧 `frames/<段号>/f<N>.png`，粘贴 `prompts.json` 里这一条的 `prompt`，时长选 `seconds`。
2. 下载的文件名里带上镜头号，比如 `E01-03-s1.mp4`。
3. `bash scripts/ingest.sh $W` 收进 `video/E01-03/s1.mp4`。

剪辑脚本会把任何分辨率统一缩放、裁成 1920×1080。

## 要实测的事

换工具后，试探镜头至少测这几项，结果写回这份文档：

- 台词：念得对不对，会不会把语气提示当台词念出来。
- 口型：是不是说话的那个人在动嘴。
- 首帧：脸、服装、人物的异样特征（瞎眼、伤疤）能不能守住。
- 运镜：推近、拉远、摇各出一条，看做不做得出来、停不停得住。
- 审核：年轻女性特写会不会被拦。
- 用量：一条 5 秒、一条 10 秒各花多少。
