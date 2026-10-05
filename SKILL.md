---
name: dramazing
description: 把一篇中文短篇故事做成分集的 AI 短剧成片：写设定、剧本和分镜，出设定图和每切首帧，按首帧出视频，再自动剪辑、对齐台词、烧硬字幕。出图和出片工具可替换（实测组合：Codex 出图 + Grok 出片）。用户想把小说、故事、剧本做成短剧 / 短片 / 分集视频，或者在做某一集的分镜、出图、出片、剪辑、审片、复盘时使用。
---

# dramazing：从故事到短剧成片

把一篇故事做成每集 2 分钟左右、有人物、有对白的分集短剧。流程分四个环节，每个环节只规定输入和输出，工具可以换：

| 环节 | 产出 | 实测过的工具 | 换工具看 |
|---|---|---|---|
| 设定、剧本、分镜 | `project.json`、`script.json`、`storyboard.json` | 由你（AI 助手）写 | `references/writing.md` |
| 设定图、首帧 | `sheets/*.png`、`frames/*/f*.png` | Codex CLI | `references/adapters/image.md` |
| 出片 | `video/E01-03/s1.mp4` | Grok 网页 | `references/adapters/video-other.md` |
| 剪辑、字幕 | 成片 | ffmpeg + whisper.cpp | 一般不用换 |

## 开始之前

1. 问清原文在哪、做几集、画风（写实 / 动画 / 年代）。用户没说就给建议，等点头。
2. 问清用什么出图、用什么出片。用户没有偏好，就说明实测过的是 Codex + Grok，其他工具要先出试探镜头。写进 `project.json` 的 `images.provider` 和 `video.target`。
3. 建作品目录，把原文存为 `story.txt`，从 `templates/` 复制三份 JSON 进去。
4. 检查依赖：`node`、`python3`（带 Pillow）、`ffmpeg`、`whisper-cli`，以及选定的出图工具。缺的告诉用户，不要替用户装。

## 每集怎么做

按 `references/workflow.md` 的 12 步走。最重要的三条：

1. **两道关口必须等用户点头。** 叙事预览（确认故事看得懂）和试探镜头（确认画质、口型、声音），通过后才批量。
2. **提示词逐条过。** `video-prompts.mjs` 生成的是草稿，对照首帧检查后再交。
3. **出片按工具的正常界面或公开 API 操作。** 遵守工具的服务条款，不绕过审核或计费。

## 参考文档

按需读，不用一次全读：

| 文档 | 什么时候读 |
|---|---|
| `references/workflow.md` | 每集开工前。12 步流程和命令 |
| `references/writing.md` | 写 `project.json`、剧本、分镜时 |
| `references/data-format.md` | 三份 JSON 的字段说明 |
| `references/prompt-rules.md` | 过提示词、设计运镜时 |
| `references/adapters/image.md` | 选出图方式、换出图工具时 |
| `references/adapters/video-grok.md` | 在 Grok 网页出片、记用量时 |
| `references/adapters/video-other.md` | 用 Grok 以外的工具出片时 |
| `references/retro-template.md` | 一集定稿后写复盘 |

完整的例子在 `examples/渡口/`：6 集的项目设定、剧本和分镜。

## 和用户协作的约定

- 审片按镜头编号沟通，比如 `06-2`。
- 删除、覆盖文件前先确认。更新视频用新文件名，不覆盖用户可能正在看的文件。
- 汇报时说清楚检查了什么、没检查什么。你听不到声音，口型和音色请用户确认。
- 返工先看有没有备用的那一条，没有再重出。
- 每集出片前后记用量，复盘时写进去。
