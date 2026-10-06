---
name: dramazing
description: Turns a short story in Chinese, English or Korean into an episodic AI short drama, covering setting, script, storyboard, character and location sheets, per-cut first frames, image-to-video generation, automatic cutting, dialogue alignment and burned-in subtitles. Image and video tools are pluggable; the tested combination is Codex for images and Grok for video. Use when the user wants to turn a novel, story or script into a short drama, short film or episodic video, or is working on an episode's storyboard, frames, video generation, editing, review or retrospective. Also covers what is called a micro drama or AI animated drama (短剧, 微短剧, 漫剧, 숏드라마).
---

> 中文: [SKILL.zh.md](SKILL.zh.md) · 한국어: [SKILL.ko.md](SKILL.ko.md)

# dramazing: from story to finished short drama

Turn a story written in Chinese, English or Korean into an episodic short drama, with characters and dialogue, about 2 minutes per episode. The workflow has four stages. Each stage defines only its inputs and outputs, so the tools can be swapped:

| Stage | Output | Tested tool | To switch tools, see |
|---|---|---|---|
| Setting, script, storyboard | `project.json`, `script.json`, `storyboard.json` | Written by you (the AI assistant) | `references/<language>/writing.md` |
| Sheets, first frames | `sheets/*.png`, `frames/*/f*.png` | Codex CLI | `references/<language>/adapters/image.md` |
| Video | `video/E01-03/s1.mp4` | Grok (web) | `references/<language>/adapters/video-other.md` |
| Editing, subtitles | Final cut | ffmpeg + whisper.cpp | Usually no need to change |

## Which language

Two languages are involved here. Do not confuse them:

- **The conversation language**: answer in the language the user speaks to you, and read the matching docs: `references/zh/` for Chinese, `references/en/` for English, `references/ko/` for Korean, and the English docs for any other language. The three versions have the same content; Chinese is the original.
- **The story language**: the language of the dialogue, set in `language` in `project.json` (`zh` / `en` / `ko`). Dialogue length, speech recognition, subtitles and the fixed sentences in prompts all follow it. It can differ from the conversation language: for example, you can talk in Chinese and make an English short drama.

## Before you start

1. Ask where the source text is, how many episodes to make, what visual style (realistic / animated / period), and what aspect ratio (landscape 16:9 / vertical 9:16, `aspect` in `project.json`). If the user does not say, suggest something and wait for approval.
2. Confirm the story language. Chinese, English and Korean are supported. A complete work has been made in Chinese; English and Korean have each had only one trial shot, and their speech rates are estimated from that single shot. In the first episode, make a trial shot to calibrate first (see `workflow.md`, "Story language").
3. Ask which tool to use for images and which for video. If the user has no preference, explain that the tested combination is Codex + Grok, and that other tools need a trial shot first. Write the choice into `images.provider` and `video.target` in `project.json`.
4. Create a work directory, save the source text as `story.txt`, and copy the three JSON files from `templates/<story language>/` into it.
5. Check dependencies: `node`, `python3` (with Pillow), `ffmpeg`, `whisper-cli`, and the chosen image tool. Tell the user what is missing; do not install it for them.

## How to make each episode

Follow the 12 steps in `references/<language>/workflow.md`. The three most important rules:

1. **Two gates need the user's approval.** The narrative preview (confirm the story is easy to follow) and the trial shot (confirm image quality, lip sync and sound). Generate in batch only after both pass. If the user says still frames do not help them judge, skip the preview and review with trial shots.
2. **Review every prompt.** What `video-prompts.mjs` generates is a draft. Check each prompt against its first frame before submitting it.
3. **Generate video through the tool's normal interface or public API.** Follow the tool's terms of service, and do not get around moderation or billing.

## Reference docs

Read them as needed, not all at once. `<language>` in the paths is `zh`, `en` or `ko`:

| Doc | When to read it |
|---|---|
| `workflow.md` | Before each episode. The 12-step workflow and commands |
| `writing.md` | When writing `project.json`, the script and the storyboard |
| `data-format.md` | Field reference for the three JSON files |
| `prompt-rules.md` | When reviewing prompts and designing camera moves |
| `adapters/image.md` | When choosing how to make images or switching image tools |
| `adapters/video-grok.md` | When generating video on the Grok website and recording usage |
| `adapters/video-other.md` | When generating video with a tool other than Grok |
| `retro-template.md` | When writing the retrospective after an episode's final cut |

Examples:

- `examples/渡口/`: Chinese, 6 episodes, with the complete project setting, script and storyboard.
- `examples/last-tram/`: English, a small single-episode example.
- `examples/majimak-jeoncha/`: Korean, the same story in Korean.

## Working with the user

- Discuss review feedback by shot ID, such as `06-2`.
- Confirm before deleting or overwriting files. Save updated videos under new file names; do not overwrite a file the user may be watching.
- When you report, say clearly what you checked and what you did not. You cannot hear audio, so ask the user to confirm lip sync and voice.
- For rework, first check whether there is a spare take; generate again only if there is none.
- Record usage before and after generating each episode's video, and include it in the retrospective.
