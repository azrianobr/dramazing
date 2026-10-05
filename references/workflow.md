# 出一集的流程

一集从分镜到成片分 12 步。以《渡口》第 4 到第 6 集为例，每集约 2 到 3 小时，用掉 Grok 周额度的 6% 到 12%。

下面的命令都在 skill 根目录运行，`W` 是作品目录，`EP` 是集数：

```bash
W=works/我的作品; EP=1
```

## 两道关口

整个流程里有两处必须停下来，等用户看过点头才往下走：

1. **叙事预览**（第 4 步）：用分镜图拼一版粗剪，确认故事看得懂。只看画质不够，画面没问题、故事没人看懂的情况真实发生过。
2. **试探镜头**（第 7 步）：先出一条有人脸、有台词的镜头，确认画质、口型和声音。每集都做。

## 步骤

### 1. 写分镜

按 `writing.md` 写这一集的 `script.json` 和 `storyboard.json`（把 `ep: N` 追加进去，前几集保留）。写完校验：

```bash
node scripts/validate.mjs --work $W --ep $EP
```

### 2. 出图

```bash
node scripts/frames.mjs plan  --work $W --eps $EP --force      # 建任务单（已有的图记为完成，不会重画）
node scripts/frames.mjs batch --work $W --only "E0$EP-01/"     # 先只出第 1 段
```

先看第 1 段：服装、站位、场景和上一集接不接得上。没问题再出全部：

```bash
node scripts/frames.mjs batch --work $W
```

- 提示「N 张参考图还没出」时，再跑一遍。
- 重画已有的图加 `--redo`；只改一处用 `fix`：`frames.mjs fix --work $W --target frames/E01-03/f2.png --prompt <文件> --ref frames/E01-03/f2.png`。
- 出图需要 [Codex CLI](https://github.com/openai/codex)，用的是它内置的出图功能。

### 3. 看图

每张都看完整画面，不只看人脸。常见问题：

- 多出一个不该有的人（前景一个看不清的肩膀也算）。
- 人物显得稚气。
- 背景不符合年代和地域。
- 道具状态和 `blocking` 不一致。

### 4. 叙事预览（关口 1）

```bash
python3 scripts/preview.py --work $W --ep $EP
```

输出 `video/E0N.preview.mp4`：每切的分镜图按秒数停留，底部叠上台词，左上角是镜头编号。给用户看，确认故事看得懂。

### 5. 生成提示词

```bash
node scripts/grok-prompts.mjs --work $W --ep $EP
```

写到 `video/prompts.json`，同时打印预检警告。已有的条目不覆盖，手改过的提示词可以放心重跑。

### 6. 逐条过提示词

对照首帧逐条看：

- 动作方向和首帧对不对得上。
- 谁出镜、谁说话。
- 心声镜头里，说话人是不是正脸、嘴闭着。
- 运镜有没有写终点。

规则见 `prompt-rules.md`。

### 7. 试探镜头（关口 2）

挑一条有人脸、有台词的镜头先出，最好同时测这一集的新东西：新人物、新道具或新运镜。给用户看，过了再批量。

### 8. 出片

在 Grok 网页上出片，见 `grok-web.md`。设置：1080p，6 秒或 10 秒（按 `prompts.json` 里的 `seconds`），只传首帧。下载的文件命名为 `grok-E01-03-s1.mp4`。

出片前、批量出完、返工后，各去用量页读一次百分比，记进 `_logs/usage.tsv`。

### 9. 收片

```bash
bash scripts/grok-ingest.sh $W
```

把 `~/Downloads` 里的 `grok-*.mp4` 收进 `video/E01-03/s1.mp4`。已有同名镜头时，旧的改名为 `s1.old.mp4`，并记一次返工。

收完先核对：每切都有片，镜头和分镜图对得上。批量提交时漏交过。

### 10. 剪辑、审片

```bash
python3 scripts/cut.py --work $W --ep $EP                                 # 剪成段
node scripts/assemble.mjs --work $W --ep $EP --loudnorm --align --no-burn # 拼整集，对齐字幕
python3 scripts/review.py --work $W --ep $EP                              # 审片版：左上角带镜头编号
```

- `cut.py` 用 whisper 测台词说完的时间，至少留到台词说完。
- 手工剪点写进 `video/fix.json`：`{"E01-06": {"fix": {"1": 4.0}, "skip": [2]}}`。`fix` 的镜头不会被压缩。
- 抽帧检查一律看完整画面，不裁到人脸。
- 用户按编号（如 `06-2`）提意见。返工先看有没有备用的第二条，没有再重出，然后回到第 9 步。
- 剪掉后段的瑕疵比重出便宜：瑕疵出现得晚、台词已经说完时，在 `fix.json` 里把这一切剪短。

### 11. 定稿

```bash
node scripts/assemble.mjs --work $W --ep $EP --loudnorm --align
```

烧硬字幕，输出 `video/E0N.final.mp4` 和 `video/E0N.srt`。抽几帧检查字幕位置和文字。

### 12. 清理、复盘

用户确认后，删镜头原片和中间文件，只留成片、字幕和出片记录。然后按 `retro-template.md` 写复盘：只记和上一集不同的地方，以及原因。规则有变就改这几份 reference 文档。

## 依赖

| 工具 | 用在哪 |
|---|---|
| Node.js 18+ | 所有 `.mjs` 脚本 |
| Python 3 + Pillow | 剪辑、审片、字幕、预览 |
| ffmpeg / ffprobe | 所有视频处理 |
| [whisper.cpp](https://github.com/ggerganov/whisper.cpp)（`whisper-cli`）+ `ggml-large-v3-turbo` 和 `ggml-silero-v5.1.2` 模型 | 测台词时长、对齐字幕。模型目录默认 `~/models/whisper`，可用环境变量 `WHISPER_MODELS` 改 |
| Codex CLI | 出设定图和分镜图 |
| Grok 网页账号 | 出片 |
| 中文字体 | 字幕和预览，默认 macOS 的 STHeiti，可用环境变量 `SUB_FONT` 改 |

`frames.mjs` 用 macOS 自带的 `sips` 转图片格式，在其他系统上要换成 ImageMagick。
