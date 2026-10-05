<h1 align="center">dramazing</h1>

<p align="center"><b>把一篇故事，做成一部分集短剧。</b><br>
<sub>Turn a short story into an episodic AI drama — script, storyboard, frames, video, subtitles.</sub></p>

---

dramazing 是一个 [Claude Code](https://claude.com/claude-code) skill。给它一篇中文短篇故事，它带着你一集一集做出有人物、有对白、带硬字幕的短剧成片，每集约 2 分钟。

这套流程是做完一部 6 集短剧之后整理出来的。每条规则都来自一次实际出片的问题，在 `references/` 里注明了出处。

## 它怎么工作

```
故事原文 ──Claude 写──▶ 设定 / 剧本 / 分镜 ──Codex 出图──▶ 设定图 + 每切首帧
                                                           │
                              ┌─── 关口 1：叙事预览，确认故事看得懂 ◀┘
                              ▼
               逐条生成视频提示词 ──▶ 关口 2：试探镜头，确认画质和口型
                                               │
                                               ▼
              Grok 网页按首帧出片 ──▶ 剪辑、对齐台词 ──▶ 审片版 ──▶ 硬字幕成片
```

| 环节 | 谁来做 |
|---|---|
| 分集、人物设定、剧本、分镜 | Claude，按 `references/writing.md` |
| 设定图、每切的首帧 | Codex CLI 内置出图（`scripts/frames.mjs`） |
| 视频提示词和出片前预检 | `scripts/grok-prompts.mjs` |
| 出片 | 你或 Claude 在 Grok 网页上按正常界面操作 |
| 剪辑、拼接、字幕、审片版 | `scripts/cut.py`、`assemble.mjs`、`review.py`、`burn-subs.py` |

## 安装

```bash
git clone https://github.com/azrianobr/dramazing ~/.claude/skills/dramazing
```

然后在 Claude Code 里说「把这篇故事做成短剧」，或者直接输入 `/dramazing`。

### 依赖

- Node.js 18+、Python 3 + Pillow、ffmpeg
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp)（`whisper-cli`），模型 `ggml-large-v3-turbo` 和 `ggml-silero-v5.1.2`，放在 `~/models/whisper`（可用 `WHISPER_MODELS` 改）
- [Codex CLI](https://github.com/openai/codex)，用来出图
- 一个能用 Imagine 视频生成的 Grok 账号
- 目前在 macOS 上测试过。字幕字体默认 STHeiti（可用 `SUB_FONT` 改），`frames.mjs` 用到 macOS 的 `sips`

## 目录

```
SKILL.md              skill 入口
references/           流程、写作规则、数据格式、提示词与运镜规则、Grok 出片、复盘模板
scripts/              校验、出图、提示词、预览、收片、剪辑、拼接、审片、字幕
templates/            空的 project / script / storyboard
examples/渡口/         完整示例：6 集的设定、剧本和分镜
```

## 示例

`examples/渡口/` 是一个完整的 6 集示例。原作是烁皓为 [shuohao-skills](https://github.com/eternityspring/shuohao-skills) 写的样例故事《渡口》（Apache-2.0）。我们改编了剧本，写了全部分镜。来源和改动见 [`examples/渡口/NOTICE.md`](examples/渡口/NOTICE.md)。

```bash
node scripts/validate.mjs     --work examples/渡口 --ep 1
node scripts/grok-prompts.mjs --work examples/渡口 --ep 1 --out /tmp/dz-test
```

## 关于出片

本 skill 不包含网页自动化脚本。出片请在 Grok 网页上正常操作，遵守 Grok / xAI 的服务条款，不要用脚本绕过页面的限制、审核或计费。

## 致谢

- 运镜规则参考了 AdrianPunk 的《AI 视频运镜词典》[上篇](https://x.com/adrianpunk115/status/2104172387575222768)、[下篇](https://x.com/adrianpunk115/status/2104523576020017575)，按我们的实测结果重新整理。
- 示例故事《渡口》来自烁皓的 [shuohao-skills](https://github.com/eternityspring/shuohao-skills)。

## 许可

[Apache License 2.0](LICENSE)。示例目录的第三方版权声明见 [NOTICE](NOTICE)。
