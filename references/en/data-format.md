> Translated from [references/zh/data-format.md](../zh/data-format.md), which is the source of truth.

# Data format

A work is a directory (called the "work directory" below). It holds three JSON files, and the scripts read only these three:

| File | Contents | Written by |
|---|---|---|
| `project.json` | Work info, style, tool choices, characters / scenes / props | The AI assistant, after reading the source text; see `writing.md` |
| `script.json` | Script: the scenes of each episode, each scene a list of beats | The AI assistant, one episode at a time |
| `storyboard.json` | Storyboard: the segments of each episode, each segment a list of cuts | The AI assistant, one episode at a time |

Files the scripts generate:

| Location | Contents |
|---|---|
| `tasks.json` | Image task list (written by `frames.mjs plan`) |
| `sheets/<ID>.png` | Sheets: one each per character, scene and prop |
| `frames/<segment ID>/f<N>.png` | Storyboard frames: one per cut, also the first frame for video generation |
| `video/` | Prompts, raw shots, cut segments, the full episode, subtitles (change the directory name with `--dir`) |
| `_logs/` | Image usage, video generation log, video tool usage |
| `_bak/` | Old versions backed up automatically before a script rewrites a JSON file |

For a complete example, see `examples/渡口/` (Chinese, 6 episodes). English and Korean each have a small single-episode example: `examples/last-tram/`, `examples/majimak-jeoncha/`. Empty templates are in `templates/<language>/`.

## project.json

```json
{
  "title": "Title of the work",
  "source": "story.txt",
  "episodes": 6,
  "language": "zh",
  "targetSeconds": [130, 150],
  "style": "Realistic cinematic look, Jiangnan in the 1930s Republic of China era, natural light, gentle film grain",
  "images": { "provider": "manual", "cmd": "(when provider is cmd) image command template" },
  "video": { "target": "grok", "durations": [6, 10], "head": "(optional) replaces the quality sentence at the start of the prompt" },
  "characters": [
    {
      "id": "C01",
      "name": "Character name",
      "alias": { "zh": "梳双麻花辫的年轻女子", "en": "the young woman with long braids" },
      "trait": { "zh": "左眼浑浊发白，右眼正常，全程保持", "en": "His left eye is clouded milky white ..." },
      "sheet": "Sheet prompt (English or Chinese)"
    }
  ],
  "scenes": [
    { "id": "S01", "name": "Scene name", "sheet": "Sheet prompt",
      "ambient": { "*": "The boat rocks gently on the water; mist drifts slowly past outside the cabin.", "dense fog, early morning": "Ambience written for this lighting" } }
  ],
  "props": [ { "id": "P01", "name": "Prop name", "sheet": "Sheet prompt" } ]
}
```

- `language`: the story language, `zh` (Chinese) / `en` (English) / `ko` (Korean). Defaults to `zh`. Dialogue length, speech recognition, subtitle font and line breaks, and the fixed sentences in prompts all follow it. The settings for each language are in `scripts/lang/langs.json`.
- `speechRate` (optional): the speech rate of this work's dialogue, in characters (syllables) per second for Chinese and Korean, words per second for English. If you leave it out, the value in `langs.json` is used: the Chinese 3 characters/second is measured; the English and Korean values were measured from trial shots. See `workflow.md`, "Story language".
- `style`: the style prefix. It is added to the front of every sheet and storyboard frame prompt. If it is missing you get a warning, and the batch will not share one look.
- `targetSeconds`: the target length of an episode, either a number or a range.
- `images.provider`: how images are made, `manual` (default) / `cmd` / `codex`. See `adapters/image.md`.
- `video.target`: which tool the video prompts are written for, `grok` / `generic` / your own `scripts/targets/<name>.mjs`. If `durations` is missing, the target's own duration options are used.
- `alias`: an appearance phrase. Video tools do not know character names, so names in prompts are replaced with this phrase. `en` is used in English sentences; the story-language entry (`zh` / `ko`) is used in story-language sentences. English stories need only `en`. If it is missing, the name is used as is.
- `trait` (optional): a character's unusual feature, such as a blind eye, a scar or a limp. When the character faces the camera, the prompt says "keep it throughout" once in English and once in the story language. Same keys as `alias`: write the story-language key and `en`. Without the story-language key the trait never reaches the prompt; `validate.mjs` warns about it. The first frame alone cannot hold it: the video tool will "fix" it (tested on Grok).
- `ambient`: the scene's ambience. Each key is a lighting value (`light`) from the script; `*` is the default.
- `sheet`: the sheet prompt. For a character, describe the face, hair, costume and age in full. For a young woman, state that she is an adult, or she may be judged a minor. See `prompt-rules.md`.

## script.json

```json
{
  "episodes": [
    {
      "ep": 1,
      "targetSeconds": 120,
      "scenes": [
        {
          "scene": "S01",
          "light": "dense fog, early morning",
          "cast": ["C01", "C03"],
          "props": ["P01"],
          "beats": [
            { "act": "She runs along the foggy riverbank, holding an old leather suitcase." },
            { "who": "C03", "say": "上船喽，过河的抓紧。", "tone": "calling out at the top of his voice, unhurried" },
            { "who": "C01", "say": "这一路，总算到了。", "tone": "very soft", "inner": true }
          ]
        }
      ]
    }
  ]
}
```

There are only three kinds of beat:

| Kind | Format | Default length |
|---|---|---|
| Action | `{ "act": "..." }` | 2.5 seconds |
| Dialogue | `{ "who", "say", "tone" }` | Character count ÷ speech rate + 1 second (speech rate: see `speechRate`; English counts words) |
| Inner voice / voiceover | Dialogue plus `"inner": true` | Same as above |

- Beats are numbered from 1 within each scene. The storyboard refers to beats by these numbers.
- `tone` is only the tone of voice, never an action. If you put an action such as "wipes his sweat" in `tone`, the video tool reads it out as dialogue (tested on Grok). Write the action as its own `act` beat.
- No dashes in `say`; use commas. A Chinese dash gets read out as 「一」 ("one"), and `validate.mjs` reports an error. For English and Korean it is only a warning, and the prompt replaces dashes with comma pauses automatically.

## storyboard.json

```json
{
  "episodes": [
    {
      "ep": 1,
      "segments": [
        {
          "id": "E01-01",
          "scene": 1,
          "blocking": "Where each person is at the start of this segment, their pose, who holds which prop",
          "sound": "Ambient sound",
          "cuts": [
            {
              "beats": [1, 2],
              "seconds": 6,
              "size": "medium",
              "camera": "Push In",
              "move": { "from": "a full-body medium shot", "to": "a close shot from the chest up", "stop": "she finishes that line", "speed": "slowly and steadily" },
              "chars": ["C01"],
              "props": ["P01"],
              "frame": "First-frame description: shot size, who is where, pose, facing, prop state, light",
              "action": "What happens in this cut, written for the video model",
              "aim": "Who the camera is aimed at",
              "angle": "eye level / slightly low angle / high angle",
              "lens": "50mm standard, medium-shallow depth of field",
              "eyeline": "Where the character looks",
              "focus": "Where the focus is locked",
              "limits": ["Constraints the storyboard cannot imply, written by hand"]
            }
          ]
        }
      ]
    }
  ]
}
```

- Segment: a continuous stretch of action in one scene, with ID `E<episode>-<segment>`. `scene` is which scene of this episode's script the segment belongs to, counting from 1.
- Cut: one shot, which is one video generation. `beats` is `[from, to]` and refers to beat numbers in this scene.
- `seconds`: the storyboard length. Videos are generated at 6 or 10 seconds; when the dialogue runs longer than the storyboard allows, editing keeps enough time for the dialogue.
- `size`: `extreme-wide` / `wide` / `full` / `medium` / `medium-close` / `close` / `extreme-close`.
- `camera`: `Static Shot`, `Push In`, `Pull Out`, `Pan`, `Tilt`, `Rack Focus`, `Tracking Shot`, `Handheld`, `Crane`, `POV`.
- `move`: details of the camera move; see the "Camera moves" section of `prompt-rules.md`. Fields: `from`, `to`, `stop`, `dir`, `speed`, `target`, `distance`, `level`, `who`, `height`, `then`.
- You can use character names directly in `frame` and `action`; they are replaced with `alias` when the prompts are generated.

## ID conventions

| Item | ID | Example |
|---|---|---|
| Character / scene / prop | `C` / `S` / `P` + two digits | `C03`, `S01`, `P02` |
| Segment | `E<episode>-<segment>` | `E03-06` |
| Shot (cut) | `<segment>/s<cut>` | `E03-06/s2` |
| Downloaded video file | File name contains `<segment>-s<cut>` | `E03-06-s2.mp4`, `grok-E03-06-s2.mp4` |
| ID used in review | `<segment>-<cut>` | `06-2` |
