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
  "aspect": "16:9",
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
- `images.provider`: how images are made, `manual` (default) / `cmd` / `codex` / `openai`. See `adapters/image.md`. `openai` also takes `images.baseUrl` (default: the official OpenAI address) and `images.model` (default `gpt-image-2.5-sunburst`); the key goes in the environment variable `DZ_IMAGES_KEY`.
- `video.target`: which tool the video prompts are written for, `grok` / `generic` / your own `scripts/targets/<name>.mjs`. If `durations` is missing, the target's own duration options are used.
- `alias`: an appearance phrase. Video tools do not know character names, so names in prompts are replaced with this phrase. `en` is used in English sentences; the story-language entry (`zh` / `ko`) is used in story-language sentences. English stories need only `en`. If it is missing, the name is used as is.
- `trait` (optional): a character's unusual feature, such as a blind eye, a scar or a limp. When the character faces the camera, the prompt says "keep it throughout" once in English and once in the story language. Same keys as `alias`: write the story-language key and `en`. Without the story-language key the trait never reaches the prompt; `validate.mjs` warns about it. The first frame alone cannot hold it: the video tool will "fix" it (tested on Grok).
- `ambient`: the scene's ambience. Each key is a lighting value (`light`) from the script; `*` is the default.
- `aspect` (optional): the aspect ratio of the final cut, written as `width:height`; `16:9` when left out. Use `9:16` for vertical short dramas. Storyboard frames, video prompts, the narrative preview, the edit and the subtitles all follow it: the long side of the canvas is 1920, so 16:9 is 1920×1080 and 9:16 is 1080×1920. Sheets are references and never reach the final cut, so they stay 16:9.
- `cutTail` (optional, seconds): in the edit, a shot with dialogue is cut this many seconds after the line ends. Left out, a dialogue shot is kept at least as long as its storyboard length; storyboard lengths follow the video tool's 6/10-second slots and run long, so characters stand idle for a second or two after the line, which drags most at segment ends. Around `0.6` moves to the next shot right after the line; give a shot that needs a reaction its own length in `fix.json`.
- `subFont` (optional): the font file for burned-in subtitles and titles, relative to the folder that holds `project.json`. Without it the story language's default from `langs.json` is used; those are fonts bundled with macOS and licensed only for use on the machine. For a commercial release, switch to a font cleared for commercial use (such as Source Han Sans under the SIL OFL) and keep its license file next to it. The environment variable `SUB_FONT` takes precedence. A trailing Chinese full stop is removed from subtitles (`stripEnd` in `langs.json`); question marks, exclamation marks and ellipses stay.
- `subSize` (optional): the size of burned-in subtitles in pixels, an integer from 24 to 120; 54 if left out. About 64 reads better in vertical shorts. Line spacing for wrapped lines grows with the size.
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
- `size`: the shot size, one of the seven values below.

  | Value | Where the frame cuts | What must stay in frame | Use it for |
  |---|---|---|---|
  | `extreme-wide` | The whole place; people are specks or absent | The place is recognisable | Openings, scene changes, time passing |
  | `wide` | A person with a large part of the surroundings | Where the person is, how far from whom | Positions and distances |
  | `full` | Head to feet, with room ahead in the direction of movement | One complete movement, start to end | Running, walking, boarding; no face to recognise, no lines |
  | `medium` | Waist up | Both hands and what they hold; two people looking at each other | Dialogue, handing things over, exchanges |
  | `medium-close` | Chest up; hands enter only when raised to the chest | The face and where the eyes point | Speaking, the listener's reaction |
  | `close` | One face, forehead to chin, or one prop filling the frame | The one detail that carries the feeling: eyes, mouth, a tight grip | The strongest emotional beat |
  | `extreme-close` | One eye, one finger, one clasp | That single detail; both things being compared are readable | Clues, evidence, small gestures; no lines |
- `camera`: `Static Shot`, `Push In`, `Pull Out`, `Pan`, `Tilt`, `Rack Focus`, `Tracking Shot`, `Handheld`, `Crane`, `POV`.
- `move`: details of the camera move; see the "Camera moves" section of `prompt-rules.md`. Fields: `from`, `to`, `stop`, `dir`, `speed`, `target`, `distance`, `level`, `who`, `height`, `then`.
- `sheets` (optional): extra sheet ids to attach for this cut. Only the scene's own location sheet is attached automatically; when the shot shows something from another sheet, list it here, e.g. `["S04"]` for the ferry seen from the pier. The first letter of the id tells character, location or prop; these go after the automatic references. Character, location and prop entries in `project.json` can carry `sheets` too; they are attached when that sheet is drawn, e.g. so the ferry's exterior matches its cabin.
- `place` (optional): use it when this cut is filmed somewhere other than the scene's location, `{ "name": "muddy riverside path", "ambient": "the dry reeds on both sides sway…" }`. The scene name and ambient motion in the prompt are replaced by these; leave out `ambient` for none. With `place`, the scene sheet of the scene is no longer attached automatically when drawing; list the sheets you need in `sheets`.
- `only` (optional): for close-ups of a body part other than hands (feet, a pocket, a coat hem), say exactly what is in the frame, `{ "zh": "坐着的人的大衣口袋、大衣下摆和腿", "en": "the coat pocket, coat hem and thigh of the seated man" }`, keyed by the story language and `en`. Without it the generator writes "only hands, sleeves and props in the frame", and a pocket shot then brings the hand out.
- You can use character names directly in `frame` and `action`; they are replaced with `alias` when the prompts are generated.
- `insert` (optional): an insert shot that uses existing footage (a screen recording or a screenshot) with no image or video generation. Write a path relative to the work dir, or `{ "file": "inserts/list.mp4", "fit": "blur" }`. `fit` says how footage of a different aspect ratio is placed: `blur` (default: centred as is, with a scaled-up blurred copy behind it) / `crop` (scaled up to fill) / `pad` (centred as is, black bars). An insert has only `beats`, `seconds` (2–30) and `insert`, with no size, camera or characters. It has no sound, so its beats cannot hold a line; the edit pads it with silence. Until the footage is in the work dir, the preview shows a text card and the edit skips the segment.
- `cover` (optional): cut away to a screen recording or screenshot while a character keeps talking. The cut is generated and voiced as usual; in the edit the picture switches to the footage from second `at`, stays for `seconds` (default: the footage's full length), then returns to the character. The sound is always the cut's own. The cut is kept at least until `at` plus the cover length; if the generated shot is too short, the footage is trimmed. Write `{ "file": "inserts/list.mp4", "at": 1.2, "fit": "blur", "seconds": 2.5 }`; `fit` is as for `insert`, `at` defaults to 1 s. Set `at` from the real delivery: after the shots are made, read the speech times the edit prints and adjust. Put any standalone insert it replaces in `skip` in `fix.json`. Not on the same cut as `screen`; on a cut without lines it is just an insert, and `validate.mjs` warns.
- `screen` (optional): screen replacement. A computer or TV screen in the shot is replaced with footage in the edit, `{ "file": "inserts/confirm.mp4", "corners": [[x, y], [x, y], [x, y], [x, y]] }`. `corners` are the four corners of the screen, top-left, top-right, bottom-right, bottom-left, in canvas pixels; measure them in the shot after it is made. Without them `validate.mjs` only warns and the edit skips the segment. Draw the screen switched off in one flat colour in the first frame and use `Static Shot` so the corners hold. A handheld phone or tablet keeps moving: use an insert instead.
- `title` (optional): an on-screen title, such as the name card when a character first appears in a short drama. The edit draws it as a transparent layer that fades in and out over the cut, and the story preview draws it too; the text never goes through the video model, so it stays exact. Write a string `"Zhao Jinbao"`, or `{ "text": "Zhao Jinbao", "sub": "Owner of the shop across the street", "at": 0.3, "seconds": 2.5, "pos": "left", "y": 0.62 }`: `text` is the large line (keep it to about 6 CJK characters in portrait, 10 in landscape; longer text shrinks to fit); `sub` is the small label below; `at` and `seconds` are when it starts within the cut and how long it stays, default 0.3 and 2.5; `pos` is `left` / `center` / `right`; `y` is the title's centre line as a fraction of the frame height, default 0.62, clear of the subtitles. Set the font with the environment variable `TITLE_FONT`; without it the subtitle font is used. If the edit shortens the cut, the title ends early with it.
- Episode-level `intro` / `outro` (optional): the episode's opening and closing bumpers, set in `episodes[]` next to `ep`, as a path to a ready-made video in the work dir, e.g. `"intro": "bumpers/E03-intro.mp4"`. `assemble.mjs` joins them as-is before and after the episode and shifts subtitle times; `review.py` plays them without shot numbers. A bumper must match the episode's canvas and frame rate and carry an audio track, or the join fails. An outro that freezes the last shot should take the last frame of the cut segment file (`video/E03-05.mp4`), not of the raw shot, because the edit may have trimmed the shot's tail.
- Episode-level `audio` (optional): the episode's music and sound effects, set in `episodes[]` next to `ep`, as an array with one entry per sound. Fields: `file` (an audio file in the work dir, required), `at` (when it starts on the episode timeline, counted from the start of the intro, default 0), `from` / `dur` (which part of the file to use, default the whole file), `gain` (volume in dB, may be negative), `fadeIn` / `fadeOut` (seconds), `duck` (negative dB; lowered by that much wherever a dialogue subtitle shows, with 0.15 s and 0.3 s ramps; omit for no ducking). Example: `{"file": "music/E03.wav", "at": 2.9, "dur": 30, "gain": -8, "fadeOut": 2, "duck": -16}`. `assemble.mjs` mixes these in after joining the picture; with `--loudnorm`, loudness normalization runs after the mix. Video prompts already ask the model for no music, so music only enters here. Check that the music's license covers how the finished video will be used.

## ID conventions

| Item | ID | Example |
|---|---|---|
| Character / scene / prop | `C` / `S` / `P` + two digits | `C03`, `S01`, `P02` |
| Segment | `E<episode>-<segment>` | `E03-06` |
| Shot (cut) | `<segment>/s<cut>` | `E03-06/s2` |
| Downloaded video file | File name contains `<segment>-s<cut>` | `E03-06-s2.mp4`, `grok-E03-06-s2.mp4` |
| ID used in review | `<segment>-<cut>` | `06-2` |
