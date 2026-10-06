# 出图适配

出图这一步只认结果：每张图是一个 PNG，放在任务单 `tasks.json` 里这张图的 `target` 位置（`sheets/C01.png`、`frames/E01-03/f1.png`）。用什么工具出都行。

出图工具要能做到两件事：

- **能传参考图。** 分镜图要参照人物、场景、道具的设定图，脸和服装才能前后一致。不能传参考图的工具，人物每张都会变样。
- **能按作品画幅出图。** 分镜图就是视频的首帧，比例要和成片一致：`project.json` 的 `aspect`，不写是 16:9 横图，竖屏作品是 9:16。设定图不进成片，一律 16:9。

## 三种方式

用 `--provider` 选，或者写在 `project.json` 的 `images.provider` 里。

### manual：手动出图（默认）

```bash
node scripts/frames.mjs batch --work $W --only "E01-01/"
```

把这一轮要出的图导出到 `_handoff/images/`，每张一个 `.txt`，里面写着提示词、要按顺序上传的参考图、出好后放到哪。拿去任何出图工具里出：ChatGPT、Midjourney、即梦、可灵、ComfyUI 都行。出好后放回来：

```bash
node scripts/frames.mjs place --work $W --target frames/E01-01/f1.png --from ~/Downloads/xxx.webp
```

`place` 会把 jpg / webp 转成 PNG、放到位置、在任务单里记为完成。位置上已有旧图时，旧图改名为 `.v<N>.png` 留着。

### cmd：接你自己的命令行

有能在命令行出图的工具或 API，就在 `project.json` 里写一个命令模板：

```json
"images": {
  "provider": "cmd",
  "cmd": "my-image-tool --prompt-file {prompt} --ref {refs} --out {out}"
}
```

| 占位符 | 换成 |
|---|---|
| `{prompt}` | 提示词文件的路径（已经拼好画风句） |
| `{refs}` | 参考图路径，空格分隔，按顺序 |
| `{out}` | 输出路径，相对作品目录 |
| `{work}` | 作品目录 |

命令在作品目录里执行，结束后 `{out}` 存在就算成功。失败时错误输出存在 `_logs/img-*.err`。

### codex：Codex CLI 内置出图（实测过）

《渡口》6 集用的是这一种。要装好 [Codex CLI](https://github.com/openai/codex) 并登录。参考图用 `-i` 传进去，一张图约 2 到 4 分钟，`--jobs 3` 并行。每张图的用量记在 `_logs/images-usage.jsonl`。

## 换工具时注意

- **第一集先出 1 段对照。** 看脸、服装、场景和设定图是否一致，再批量。
- **人物不一致**，先检查参考图有没有传进去、顺序对不对（设定图在前）。
- **年轻女性**的设定图和首帧写明「二十出头的成年女子，神情克制」，否则有的视频工具会判成未成年人拒绝出片。见 `../prompt-rules.md`。
