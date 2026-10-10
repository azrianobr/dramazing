# 出一集的流程

一集从分镜到成片分 12 步。每一步只规定输入和输出（放在作品目录的哪里），用什么工具都行：

| 环节 | 输入 → 输出 | 实测过的工具 | 换别的工具 |
|---|---|---|---|
| 写剧本、分镜 | 原文 → `script.json`、`storyboard.json` | Claude Code | 任何能读 SKILL.md 的 AI 助手，或人工写 |
| 出图 | `tasks.json` → `sheets/*.png`、`frames/*/f*.png` | Codex CLI | 见 `adapters/image.md`：手动用任何出图工具，或接你自己的命令行 |
| 出片 | 首帧 + `prompts.json` → `video/E01-03/s1.mp4` | Grok 网页 | 见 `adapters/video-other.md`：可灵、即梦、Veo、Runway 等 |
| 剪辑、字幕 | 镜头 → 成片 | ffmpeg + whisper.cpp（开源） | 一般不用换 |

参考数据：《渡口》第 4 到第 6 集用 Codex + Grok，每集约 2 到 3 小时，用掉 Grok 周额度的 6% 到 12%。

下面的命令都在 skill 根目录运行，`W` 是作品目录，`EP` 是集数：

```bash
W=works/我的作品; EP=1
```

## 两道关口

整个流程里有两处必须停下来，等用户看过点头才往下走：

1. **叙事预览**（第 4 步）：用分镜图拼一版粗剪，确认故事看得懂。只看画质不够，画面没问题、故事没人看懂的情况真实发生过。有的用户看静态图说不出问题在哪（《渡口》第 1 集重制时就是这样）；这时问一句，跳过预览，改为对着试探镜头和剪好的段落审。
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
- 重画已有的图加 `--redo`；只改一处用 `fix`：`frames.mjs fix --work $W --target frames/E01-03/f2.png --prompt <文件>`。原图自动当参考图 1，提示词只写要改的那一处，其余保持不变的句子由 `fix` 补上。
- 挑机位（可选）：设定图或首帧出好后，`frames.mjs grid --work $W --from frames/E01-03/f1.png --name 楼道` 出一张 16:9 宫格图，放在 `_handoff/grid/楼道.png`。行是机位高度（默认平视、仰拍、俯拍），列是景别（默认远景、中景、特写、大特写），可用 `--rows`、`--cols` 换。挑好后改分镜的 `angle` 和 `size`，再重出那几切；想让出图照着某一格的角度画，用 `frames.mjs grid --work $W --name 楼道 --crop 2,3` 切出第 2 行第 3 列，当 `fix --ref` 或手动出图的参考。每格只有约 418×314，只用来挑角度，不当首帧；不改任务单。
- 出图方式由 `--provider` 或 `project.json` 的 `images.provider` 决定：`manual`（默认，导出说明后用任何工具出图，再用 `place` 放回）、`cmd`（接你自己的命令行）、`codex`、`openai`（OpenAI 图像接口）。见 `adapters/image.md`。

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

用户说看静态图判断不了，就不再出预览：多出一两条试探镜头，把站位、地点这类问题放到会动的片子里看。

### 5. 生成提示词

```bash
node scripts/video-prompts.mjs --work $W --ep $EP --target grok   # 或 generic，或你自己写的 targets/<工具>.mjs
```

写两份文件，同时打印预检警告：

- `video/shots.json`：镜头描述（动作、视线、运镜、台词、限制），和用哪个视频工具无关。
- `video/prompts.json`：按目标工具渲染好的提示词和时长档位。

已有的条目不覆盖，手改过的提示词可以放心重跑。换工具时加 `--force` 重新渲染。

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

在视频工具里逐条出片：上传首帧，粘贴 `prompts.json` 里这一条的 `prompt`，时长选 `seconds`。下载的文件名里带上镜头号，比如 `E01-03-s1.mp4`（前面加工具名也行）。

- Grok：见 `adapters/video-grok.md`（实测过）。
- 其他工具：见 `adapters/video-other.md`（未实测，第一集先多出几条试探镜头）。

出片前、批量出完、返工后，各记一次用量（额度百分比、积分或花费），写进 `_logs/usage.tsv`。

### 9. 收片

```bash
bash scripts/ingest.sh $W            # 默认从 ~/Downloads 收；别的目录写在第二个参数
bash scripts/ingest.sh $W --file ~/Downloads/<下载的文件>.mp4 E01-03-s2   # 文件名不带镜头号时（比如页面下载按钮用对话号命名），逐个指明
```

把文件名里带 `E01-03-s1` 的视频收进 `video/E01-03/s1.mp4`。已有同名镜头时，旧的改名为 `s1.old.mp4`，并记一次返工。

收完先核对：每切都有片，镜头和分镜图对得上。批量提交时漏交过。

**逐帧查多出来的东西。** 视频模型会在动作里凭空多画道具。《加油》E01-03/s1 跺脚后多出一只鞋飞下台阶，只出现了 0.4 秒，每 0.5 秒抽一帧时漏掉了。剪辑要用到的区间，按每秒 8 帧以上出帧图，重点看手脚动作和道具交接的前后：

```bash
ffmpeg -ss 2 -to 4 -i $W/video/E01-03/s1.mp4 -vf fps=12,scale=270:-1,tile=6x4 /tmp/E01-03-s1.png
```

固定机位的镜头出了这种问题，可以用干净的一帧盖住那块区域，不用重出。

### 10. 剪辑、审片

```bash
python3 scripts/cut.py --work $W --ep $EP                                 # 剪成段
node scripts/assemble.mjs --work $W --ep $EP --loudnorm --align --no-burn # 拼整集，对齐字幕
python3 scripts/review.py --work $W --ep $EP                              # 审片版：左上角带镜头编号
```

- `cut.py` 用 whisper 测台词说完的时间，至少留到台词说完。
- 手工剪点写进 `video/fix.json`：`{"E01-06": {"fix": {"1": 4.0}, "skip": [2], "in": {"3": 1.25}, "speed": {"4": 1.6}}}`。`fix` 的镜头不会被压缩；`fix` 是加速后的成片秒数，这一切照样按 `--rate` 自动加速，要固定系数就在 `speed` 里写。`in` 是从原片第几秒开始取：动作来得比提示词写的晚（比如灯晚了 1 秒才灭），就从后面取，不用重出。
- 抽帧检查一律看完整画面，不裁到人脸。
- 用户按编号（如 `06-2`）提意见。返工先看有没有备用的第二条，没有再重出，然后回到第 9 步。
- 剪掉后段的瑕疵比重出便宜：瑕疵出现得晚、台词已经说完时，在 `fix.json` 里把这一切剪短。
- `speed` 是这一切的提速系数，画面和声音一起加速，音高不变。竖屏短片按 `writing.md` 第 5 节的节奏写：纯动作镜头 ×1.4–2.0。
- **核对音画同步。** `cut.py` 和 `assemble.mjs` 出片后会比对音轨和画面的长度，差超过 0.25 秒就停。只比总长抓不住中途的错位，自己另做后期时还要核对：
  1. 看 `ffprobe` 给的音轨和画面的 stream 时长。不要用帧数除以 24，变帧率的片子会算错。
  2. 找几处画面和声音一起变的地方，比如切镜头时台词起头、灯亮时的跺脚声。按时间取帧（`ffmpeg -ss 秒数`），不按帧序号取；再用音量包络找声音起点。两者应落在同一帧内。

  拿字幕时间去对音量包络不算核对：两者都是按计划时间排的，对得上只说明自洽（《加油》第一版就是这样漏掉了 0.3 秒的错位）。

  **拼接的坑。** 段视频里音轨的时间戳常和实际声音对不上，比如容器写 22.3 秒，解出来只有 22.229 秒。按时间戳拼接（concat 清单，或再加 `aresample` 补齐）都会让后面的声音越来越早或越来越晚。`assemble.mjs` 的做法是：每段画面补到或截到 n 帧，声音按采样数补静音或截断到同样的 n/24 秒，两条各自首尾相接。`cut.py` 在段内对每一切做同样的事：时长先取整到 1/24 秒，画面补到或截到这么多帧，声音补到或截到同样长度再拼。不这样做，提速镜头之后画面会越拖越晚：《大水》第 1 段末尾声音比画面早约 0.1 秒。不要用"按帧号重写时间戳 + 强制恒定帧率"去补画面的空隙，这样会丢帧：《加油》第四版试过，后面 276 帧没了。

### 11. 定稿

```bash
node scripts/assemble.mjs --work $W --ep $EP --loudnorm --align
```

烧硬字幕，输出 `video/E0N.final.mp4` 和 `video/E0N.srt`。抽几帧检查字幕位置和文字。

### 12. 清理、复盘

用户确认后，删镜头原片和中间文件，只留成片、字幕和出片记录。然后按 `retro-template.md` 写复盘：只记和上一集不同的地方，以及原因。规则有变就改这几份 reference 文档。

## 故事语言

故事可以是中文、英文或韩文，在 `project.json` 写 `"language": "zh" | "en" | "ko"`。脚本按它决定：

- 台词时长怎么算：中文、韩文按字（音节）数，英文按词数，除以语速再加 1 秒起音。
- 语音识别用哪种语言（`cut.py` 测台词说完的时间，`assemble.mjs --align` 对齐字幕）。
- 字幕的字体和换行：中文按字换行，英文、韩文按词换行。
- 提示词里的固定句子（限制、出镜人数、视线等），以及台词的语言名。

脚本打印的提示也有三种语言：默认跟着作品的故事语言，也可以用环境变量 `DRAMAZING_LANG=zh|en|ko` 指定。

**语速要用试探镜头校准。** 中文 3 字/秒来自《渡口》6 集。英文、韩文的值来自各一条试探镜头，样本很少（见 `langs.json` 的 `calibrated`）。新作品第一条试探镜头出来后：

1. 跑 `cut.py --work $W --ep 1 <试探镜头所在段号>`。这一段只有试探镜头也能跑：它只测台词、不拼段，打印台词起止秒数和「语速」（字数或词数 ÷ 开口到说完的秒数）。
2. 这个语速和 `langs.json` 的 `rate` 差得多，就在 `project.json` 写 `speechRate`。语速里含句间停顿，正好是排时长要用的值。

语速偏大，分镜给台词的时间就不够，剪辑会自动留长，整集会超出目标时长；偏小则反过来。

## 依赖

| 工具 | 用在哪 |
|---|---|
| Node.js 18+ | 所有 `.mjs` 脚本 |
| Python 3 + Pillow | 剪辑、审片、字幕、预览 |
| ffmpeg / ffprobe | 所有视频处理 |
| [whisper.cpp](https://github.com/ggerganov/whisper.cpp)（`whisper-cli`）+ `ggml-large-v3-turbo` 和 `ggml-silero-v5.1.2` 模型 | 测台词时长、对齐字幕。模型目录默认 `~/models/whisper`，可用环境变量 `WHISPER_MODELS` 改 |
| 一个出图工具 | 出设定图和分镜图，要能传参考图。实测：Codex CLI |
| 一个「首帧 + 文字 → 视频」的工具 | 出片，要能说故事语言的台词。实测：Grok 网页 |
| 字体 | 字幕和预览。默认用 macOS 自带的：中文 STHeiti，英文 Helvetica Neue，韩文 Apple SD Gothic Neo（见 `scripts/lang/langs.json`）。可在 `project.json` 写 `subFont` 或用环境变量 `SUB_FONT` 改；系统字体不能商用，成片商用要换 |
