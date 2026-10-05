<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo.svg" width="420" alt="dramazing">
  </picture>
</p>

<p align="center"><b>把一篇故事，做成一部分集短剧。</b><br>
<sub>Turn a short story into an episodic AI drama — script, storyboard, frames, video, subtitles.</sub></p>

---

dramazing 是一个 AI 助手用的 skill（[Agent Skills](https://agentskills.io) 格式，Claude Code、Codex CLI 等都能读）。给它一篇中文短篇故事，它带着你一集一集做出有人物、有对白、带硬字幕的短剧成片，每集约 2 分钟。

出图和出片工具都可以换。流程只规定每一步的输入和输出，工具通过适配器接入。

这套流程是做完一部 6 集短剧之后整理出来的。每条规则都来自一次实际出片的问题，在 `references/` 里注明了出处。

## 它怎么工作

```
故事原文 ──AI 助手写──▶ 设定 / 剧本 / 分镜 ──出图工具──▶ 设定图 + 每切首帧
                                                           │
                              ┌─── 关口 1：叙事预览，确认故事看得懂 ◀┘
                              ▼
               逐条生成视频提示词 ──▶ 关口 2：试探镜头，确认画质和口型
                                               │
                                               ▼
              视频工具按首帧出片 ──▶ 剪辑、对齐台词 ──▶ 审片版 ──▶ 硬字幕成片
```

| 环节 | 谁来做 | 实测过的工具 | 可以换成 |
|---|---|---|---|
| 分集、人物设定、剧本、分镜 | AI 助手，按 `references/writing.md` | Claude Code | 任何能读 skill 的助手，或人工写 |
| 设定图、每切的首帧 | `scripts/frames.mjs` 出任务单 | Codex CLI | 手动用任何出图工具，或接你的命令行（[说明](references/adapters/image.md)） |
| 视频提示词和预检 | `scripts/video-prompts.mjs` | Grok 写法 | 通用写法，或自己写一个 target（[说明](references/adapters/video-other.md)） |
| 出片 | 你或 AI 助手，在视频工具里按正常界面操作 | Grok 网页 | 可灵、即梦、Veo、Runway 等，未实测 |
| 剪辑、拼接、字幕、审片版 | `cut.py`、`assemble.mjs`、`review.py`、`burn-subs.py` | ffmpeg + whisper.cpp | — |

只有「Codex 出图 + Grok 出片」这一组完整做过一部作品。换别的工具，第一集先多出几条试探镜头。

## 安装

把仓库克隆到你的 AI 助手读 skill 的目录。比如 Claude Code：

```bash
git clone https://github.com/azrianobr/dramazing ~/.claude/skills/dramazing
```

然后说「把这篇故事做成短剧」，或者输入 `/dramazing`。其他助手放到它读 skill 的位置，或者直接让它读 `SKILL.md`。

### 依赖

- Node.js 18+、Python 3 + Pillow、ffmpeg
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp)（`whisper-cli`），模型 `ggml-large-v3-turbo` 和 `ggml-silero-v5.1.2`，放在 `~/models/whisper`（可用 `WHISPER_MODELS` 改）
- 一个能传参考图的出图工具（实测：[Codex CLI](https://github.com/openai/codex)）
- 一个「首帧 + 文字 → 视频」、能说中文台词的视频工具（实测：Grok 网页的 Imagine）
- 目前在 macOS 上测试过。字幕字体默认 STHeiti（可用 `SUB_FONT` 改）

## 目录

```
SKILL.md              skill 入口
references/           流程、写作规则、数据格式、提示词与运镜规则、复盘模板
  adapters/           出图、Grok 出片、其他视频工具
scripts/              校验、出图、提示词、预览、收片、剪辑、拼接、审片、字幕
  targets/            视频提示词的工具写法：grok、generic
assets/               logo（浅色 / 深色）和图标
templates/            空的 project / script / storyboard
examples/渡口/         完整示例：6 集的设定、剧本和分镜
```

## 示例

`examples/渡口/` 是一个完整的 6 集示例。原作是烁皓为 [shuohao-skills](https://github.com/eternityspring/shuohao-skills) 写的样例故事《渡口》（Apache-2.0）。我们改编了剧本，写了全部分镜。来源和改动见 [`examples/渡口/NOTICE.md`](examples/渡口/NOTICE.md)。

```bash
node scripts/validate.mjs     --work examples/渡口 --ep 1
node scripts/video-prompts.mjs --work examples/渡口 --ep 1 --target grok --out /tmp/dz-test
```

## 关于出片

本 skill 不包含网页自动化脚本。出片请在视频工具的正常界面或公开 API 上操作，遵守工具的服务条款，不要用脚本绕过页面的限制、审核或计费。

## 致谢

- 运镜规则参考了 AdrianPunk 的《AI 视频运镜词典》[上篇](https://x.com/adrianpunk115/status/2104172387575222768)、[下篇](https://x.com/adrianpunk115/status/2104523576020017575)，按我们的实测结果重新整理。
- 示例故事《渡口》来自烁皓的 [shuohao-skills](https://github.com/eternityspring/shuohao-skills)。

## 许可

[Apache License 2.0](LICENSE)。示例目录的第三方版权声明见 [NOTICE](NOTICE)。
