> Translated from [references/zh/adapters/image.md](../../zh/adapters/image.md), which is the source of truth.

# Image adapters

The image step cares only about the result: each image is a PNG at the image's `target` location in the task list `tasks.json` (`sheets/C01.png`, `frames/E01-03/f1.png`). Any tool will do.

The image tool must be able to do two things:

- **Accept reference images.** Storyboard frames must follow the character, scene and prop sheets, so faces and costumes stay consistent. With a tool that cannot take reference images, characters look different in every image.
- **Make images in the work's aspect ratio.** A storyboard frame is the video's first frame, so its aspect ratio must match the final cut: `aspect` in `project.json`, 16:9 landscape when left out, 9:16 for vertical works. Sheets never reach the final cut and stay 16:9.

## Four providers

Choose one with `--provider`, or set it in `images.provider` in `project.json`.

### manual: make images by hand (default)

```bash
node scripts/frames.mjs batch --work $W --only "E01-01/"
```

This exports the images for this round to `_handoff/images/`, one `.txt` per image, containing the prompt, the reference images to upload in order, and where to put the result. Make them in any image tool: ChatGPT, Midjourney, Jimeng, Kling and ComfyUI all work. Then put each one back:

```bash
node scripts/frames.mjs place --work $W --target frames/E01-01/f1.png --from ~/Downloads/xxx.webp
```

`place` converts jpg / webp to PNG, puts it in place and marks the task done in the task list. If an old image is already there, it is renamed `.v<N>.png` and kept.

### cmd: your own command line

If you have an image tool or API that runs from the command line, write a command template in `project.json`:

```json
"images": {
  "provider": "cmd",
  "cmd": "my-image-tool --prompt-file {prompt} --ref {refs} --out {out}"
}
```

| Placeholder | Replaced with |
|---|---|
| `{prompt}` | Path of the prompt file (the style sentence is already added) |
| `{refs}` | Reference image paths, space-separated, in order |
| `{out}` | Output path, relative to the work directory |
| `{work}` | The work directory |

The command runs in the work directory. It counts as a success if `{out}` exists when it finishes. On failure, the error output is saved in `_logs/img-*.err`.

### codex: Codex CLI built-in image generation (tested)

The 6 episodes of *Dukou (渡口)* used this provider. Install [Codex CLI](https://github.com/openai/codex) and log in. Reference images are passed with `-i`. An image takes about 2 to 4 minutes; `--jobs 3` runs them in parallel. Usage for each image is logged in `_logs/images-usage.jsonl`.

### openai: OpenAI Images API (official, or a compatible service; tested through a compatible service, the official address is untested)

Calls the image API directly, without Codex: `/images/edits` when there are reference images (uploaded in order), `/images/generations` when there are none. About 20 to 40 seconds per image; `--jobs 3` runs them in parallel.

```json
"images": {
  "provider": "openai",
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-image-2.5-sunburst"
}
```

- Without `baseUrl`, the official OpenAI address is used. For a compatible service, put its address here.
- The key is read only from the environment variable `DZ_IMAGES_KEY` and is never written to a file. It is not `OPENAI_API_KEY`, because Codex CLI reads that variable too and may switch to API billing when it is set.
- No size parameter is sent; the aspect comes from the "aspect ratio" line at the end of the prompt. An image more than 3% off the target ratio gets a warning.
- Each image's time, actual size, and the model, quality and size the service reports are logged in `_logs/images-usage.jsonl`.
- On macOS, if `baseUrl` is a local-network address, turn the terminal app on under System Settings → Privacy & Security → Local Network, or the call fails with `EHOSTUNREACH`.

## Changing one image: fix

```bash
node scripts/frames.mjs fix --work $W --target frames/E01-03/f2.png --prompt <file>
```

The original goes in as reference image 1. The prompt file names only the one thing to change; `fix` wraps it in a fixed form: change only this, keep the person's identity, framing, lighting and costume as in the original. Change one thing per run; for two changes, run it twice. To redraw from scratch without the original, add `--raw`. Works with `codex`, `cmd` and `openai`.

## When you switch tools

- **Make 1 segment first in the first episode, and compare.** Check that faces, costumes and sets match the sheets, then generate the batch.
- **If characters are inconsistent**, first check that the reference images were passed in, and in the right order (sheets first).
- **For a young woman**, write "an adult woman in her early twenties, with a restrained expression" in the sheet and the first frame. Otherwise some video tools judge her a minor and refuse to generate. See `../prompt-rules.md`.
