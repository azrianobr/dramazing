> Translated from [references/zh/workflow.md](../zh/workflow.md), which is the source of truth.

# Making an episode

An episode goes from storyboard to final cut in 12 steps. Each step defines only its inputs and outputs (where they go in the work directory). Any tool will do:

| Stage | Input → output | Tested tool | Other tools |
|---|---|---|---|
| Script and storyboard | Source text → `script.json`, `storyboard.json` | Claude Code | Any AI assistant that can read SKILL.md, or write them by hand |
| Images | `tasks.json` → `sheets/*.png`, `frames/*/f*.png` | Codex CLI | See `adapters/image.md`: any image tool by hand, or your own command line |
| Video | First frame + `prompts.json` → `video/E01-03/s1.mp4` | Grok (web) | See `adapters/video-other.md`: Kling, Jimeng, Veo, Runway, etc. |
| Editing and subtitles | Shots → final cut | ffmpeg + whisper.cpp (open source) | Usually no need to change |

For reference: episodes 4 to 6 of *Dukou (渡口)* used Codex + Grok. Each episode took about 2 to 3 hours and used 6% to 12% of the weekly Grok quota.

Run all commands below from the skill root. `W` is the work directory and `EP` is the episode number:

```bash
W=works/my-drama; EP=1
```

## Two gates

The workflow has two points where you must stop and wait for the user to watch and approve before you go on:

1. **Narrative preview** (step 4): a rough cut built from the storyboard frames, to confirm the story is easy to follow. Checking image quality is not enough: it has really happened that every picture looked fine and nobody understood the story. Some users cannot say what is wrong from still frames (this happened in the remake of 渡口 episode 1); then ask, skip the preview, and review with trial shots and cut segments instead.
2. **Trial shot** (step 7): generate one shot with a face and dialogue first, to confirm image quality, lip sync and sound. Do this for every episode.

## Steps

### 1. Write the storyboard

Follow `writing.md` to write this episode's `script.json` and `storyboard.json` (append `ep: N`; keep the earlier episodes). Then validate:

```bash
node scripts/validate.mjs --work $W --ep $EP
```

### 2. Generate images

```bash
node scripts/frames.mjs plan  --work $W --eps $EP --force      # build the task list (existing images are marked done, not redrawn)
node scripts/frames.mjs batch --work $W --only "E0$EP-01/"     # segment 1 only, first
```

Check segment 1 first: do costumes, positions and the set continue from the previous episode? If they do, generate the rest:

```bash
node scripts/frames.mjs batch --work $W
```

- When it says some images wait for their references (sheets), run it again.
- To redraw existing images, add `--redo`. To change one detail, use `fix`: `frames.mjs fix --work $W --target frames/E01-03/f2.png --prompt <file>`. The original goes in as reference image 1; the prompt names only the change, and `fix` adds the sentences that keep everything else.
- `--provider` or `images.provider` in `project.json` sets how images are made: `manual` (default: export instructions, make the images in any tool, then put them back with `place`), `cmd` (your own command line), `codex` or `openai` (the OpenAI Images API). See `adapters/image.md`.

### 3. Check the images

Look at the full frame of every image, not just the faces. Common problems:

- An extra person who should not be there (a blurry shoulder in the foreground counts).
- A character looks childlike.
- The background does not fit the period or region.
- A prop's state does not match `blocking`.

### 4. Narrative preview (Gate 1)

```bash
python3 scripts/preview.py --work $W --ep $EP
```

This writes `video/E0N.preview.mp4`: each cut's storyboard frame stays on screen for the cut's length, with the dialogue overlaid at the bottom and the shot ID in the top-left corner. Show it to the user and confirm the story is easy to follow.

If the user says still frames do not help them judge, stop making previews: make one or two extra trial shots, and check blocking and location problems in moving footage.

### 5. Generate prompts

```bash
node scripts/video-prompts.mjs --work $W --ep $EP --target grok   # or generic, or your own targets/<tool>.mjs
```

It writes two files and prints preflight warnings:

- `video/shots.json`: shot descriptions (action, eyeline, camera move, dialogue, constraints). They do not depend on the video tool.
- `video/prompts.json`: prompts rendered for the target tool, with duration options.

Existing entries are not overwritten, so you can safely rerun it after editing prompts by hand. When you switch tools, add `--force` to render them again.

### 6. Review each prompt

Check each prompt against its first frame:

- Does the direction of the action match the first frame?
- Who is on screen, and who speaks?
- In inner-voice shots, does the speaker face the camera with their mouth closed?
- Does the camera move have an end point?

The rules are in `prompt-rules.md`.

### 7. Trial shot (Gate 2)

Pick a shot with a face and dialogue and generate it first. Ideally it also tests what is new in this episode: a new character, prop or camera move. Show it to the user. Generate the batch only after it passes.

### 8. Generate video

Generate the shots one by one in the video tool: upload the first frame, paste this shot's `prompt` from `prompts.json`, and set the duration to `seconds`. Put the shot ID in the downloaded file name, such as `E01-03-s1.mp4` (a tool-name prefix is fine).

- Grok: see `adapters/video-grok.md` (tested).
- Other tools: see `adapters/video-other.md` (not tested; make a few extra trial shots in the first episode).

Record usage (quota percentage, credits or cost) three times: before generating, after the batch and after rework. Write it to `_logs/usage.tsv`.

### 9. Ingest

```bash
bash scripts/ingest.sh $W            # reads ~/Downloads by default; pass another directory as the second argument
bash scripts/ingest.sh $W --file ~/Downloads/<downloaded file>.mp4 E01-03-s2   # when the file name has no shot ID (e.g. the page's download button names it by conversation ID), name the shot yourself
```

It moves each video whose file name contains `E01-03-s1` to `video/E01-03/s1.mp4`. If that shot already exists, the old file is renamed `s1.old.mp4` and one rework is logged.

After ingesting, check that every cut has a video and that each video matches its storyboard frame. Shots have been missed in batch submissions before.

**Check frame by frame for things that appear from nowhere.** Video models sometimes add props in the middle of an action. In 加油 E01-03/s1, a shoe flew down the stairs after he stamped his foot. It was on screen for only 0.4 seconds, and frames sampled every 0.5 seconds missed it. For every range the edit will use, make contact sheets at 8 frames per second or more, and look closely before and after hand and foot movements and handovers of props:

```bash
ffmpeg -ss 2 -to 4 -i $W/video/E01-03/s1.mp4 -vf fps=12,scale=270:-1,tile=6x4 /tmp/E01-03-s1.png
```

If this happens in a static shot, you can cover the area with a clean frame instead of generating again.

### 10. Edit and review

```bash
python3 scripts/cut.py --work $W --ep $EP                                 # cut into segments
node scripts/assemble.mjs --work $W --ep $EP --loudnorm --align --no-burn # assemble the episode, align subtitles
python3 scripts/review.py --work $W --ep $EP                              # review cut: shot IDs in the top-left corner
```

- `cut.py` uses whisper to find when the dialogue ends, and always keeps at least that much.
- Write manual cut points in `video/fix.json`: `{"E01-06": {"fix": {"1": 4.0}, "skip": [2], "in": {"3": 1.25}, "speed": {"4": 1.6}}}`. Shots in `fix` are not shortened. `in` is the second of the raw clip to start from: if an action comes later than the prompt asked (a lamp that goes out a second late), take the later part instead of generating again.
- When you check sampled frames, always look at the full frame. Do not crop to the faces.
- The user gives feedback by shot ID (such as `06-2`). For rework, first check for a spare second take; generate again only if there is none. Then go back to step 9.
- Cutting off a flaw at the end is cheaper than generating again: if the flaw appears late, after the dialogue is over, shorten the cut in `fix.json`.
- `speed` is the speed-up factor for the cut. Picture and sound speed up together, and the pitch stays the same. For a vertical short, follow the pacing in section 5 of `writing.md`: ×1.4–2.0 for action-only shots.
- **Check that sound and picture stay in sync.** `cut.py` and `assemble.mjs` compare the length of the audio and the video after each render, and stop if they differ by more than 0.25 seconds. The total length cannot show a drift in the middle, so if you do extra post-production yourself, also check:
  1. Read the audio and video stream durations from `ffprobe`. Do not divide the frame count by 24; that is wrong for variable frame rate files.
  2. Find a few places where picture and sound change together, for example a line that starts on a cut, or a stamp that turns a light on. Take the frame by time (`ffmpeg -ss <seconds>`), not by frame number, and find the sound onset in the loudness envelope. The two must land within one frame.

  Matching subtitle times against a loudness envelope is not a check: both were laid out from the planned times, so a match only shows they agree with each other. That is how the first version of 加油 missed a 0.3 second drift.

  **The joining trap.** In a segment file, the audio timestamps often do not match the actual sound: the container says 22.3 seconds, but only 22.229 seconds decode. Joining by timestamps (a concat list, even with `aresample` to fill gaps) makes later sound drift early or late. `assemble.mjs` pads or trims each segment's picture to n frames, pads or trims its sound by sample count to the same n/24 seconds, and joins the two tracks end to end separately. Do not fill picture gaps by rewriting timestamps from frame numbers and forcing a constant frame rate; frames get dropped. The fourth version of 加油 tried it and lost the last 276 frames.

### 11. Final cut

```bash
node scripts/assemble.mjs --work $W --ep $EP --loudnorm --align
```

This burns in the subtitles and writes `video/E0N.final.mp4` and `video/E0N.srt`. Sample a few frames to check subtitle position and text.

### 12. Clean up and write the retrospective

After the user approves, delete the raw shots and intermediate files. Keep only the final cut, subtitles and generation logs. Then write a retrospective from `retro-template.md`: record only what differs from the previous episode, and why. If a rule changed, update these reference docs.

## Story language

The story can be in Chinese, English or Korean. Set `"language": "zh" | "en" | "ko"` in `project.json`. The scripts use it to decide:

- How dialogue length is estimated: by characters (syllables) for Chinese and Korean, by words for English, divided by the speech rate, plus 1 second of lead-in.
- Which language speech recognition uses (`cut.py` to find when the dialogue ends, `assemble.mjs --align` to align subtitles).
- Subtitle font and line breaks: Chinese breaks by character, English and Korean by word.
- The fixed sentences in prompts (constraints, number of people on screen, eyeline, etc.) and the name of the dialogue language.

Script messages also come in the three languages. They follow the work's story language by default. To choose one, set the environment variable `DRAMAZING_LANG=zh|en|ko`.

**Calibrate the speech rate with a trial shot.** The Chinese rate of 3 characters/second comes from the 6 episodes of *Dukou*. The English and Korean values each come from a single trial shot, a very small sample (see `calibrated` in `langs.json`). When the first trial shot of a new work is ready:

1. Run `cut.py --work $W --ep 1 <segment of the trial shot>`. It works when the trial shot is the only shot in that segment: it measures the dialogue without assembling the segment, and prints where the speech starts and ends and the `rate` (characters or words ÷ seconds from first to last word).
2. If this rate differs a lot from `rate` in `langs.json`, set `speechRate` in `project.json`. The rate includes the pauses between sentences, which is what timing the storyboard needs.

If the rate is too high, the storyboard gives the dialogue too little time; editing then keeps cuts longer automatically, and the episode runs over its target length. If it is too low, the opposite happens.

## Dependencies

| Tool | Used for |
|---|---|
| Node.js 18+ | All `.mjs` scripts |
| Python 3 + Pillow | Editing, review cut, subtitles, preview |
| ffmpeg / ffprobe | All video processing |
| [whisper.cpp](https://github.com/ggerganov/whisper.cpp) (`whisper-cli`) + the `ggml-large-v3-turbo` and `ggml-silero-v5.1.2` models | Measuring dialogue length and aligning subtitles. The model directory defaults to `~/models/whisper`; change it with the environment variable `WHISPER_MODELS` |
| An image tool | Makes the sheets and storyboard frames; must accept reference images. Tested: Codex CLI |
| A "first frame + text → video" tool | Generates the video; must speak dialogue in the story language. Tested: Grok (web) |
| Fonts | Subtitles and preview. Defaults to fonts built into macOS: STHeiti for Chinese, Helvetica Neue for English, Apple SD Gothic Neo for Korean (see `scripts/lang/langs.json`). Change them with `subFont` in `project.json` or the environment variable `SUB_FONT`; the system fonts are not cleared for commercial use |
