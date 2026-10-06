> Translated from [references/zh/adapters/video-other.md](../../zh/adapters/video-other.md), which is the source of truth.

# Generating video with other tools

> Not tested. dramazing has made a complete work only on the Grok website (see `video-grok.md`). This page is based on what "first frame + text → video" tools have in common. After switching tools, make a few extra trial shots in the first episode, and add the test results here.

## Requirements for the tool

| Requirement | Why |
|---|---|
| Can use one image as the first frame | Consistency of characters, costumes and sets depends entirely on the first frame |
| Can speak dialogue in the story language, with matching lip sync | A short drama moves forward through dialogue; a tool that makes only silent video needs separate voice-over |
| Can generate 5 to 10 seconds | A cut is usually 2 to 8 seconds; leave room for editing |
| Can output the work's aspect ratio (16:9 or 9:16), around 1080p | Matches the first frame and the final cut |

Tools such as Kling, Jimeng, Veo, Runway and Hailuo meet most of the first three requirements; check the current version for details.

## Prompts

```bash
node scripts/video-prompts.mjs --work $W --ep 1 --target generic
```

- `video/shots.json`: the shot description of each cut, independent of the tool.
- `video/prompts.json`: the `generic` format, written over several lines, with duration options of 5 / 10 seconds.

If the tool has different duration options, set them in `project.json`:

```json
"video": { "target": "generic", "durations": [5, 10] }
```

## Writing a target for a specific tool

Once testing shows a tool's own patterns (for example, it follows English better, needs a certain opening, or does not allow line breaks in the input box), write a `scripts/targets/<tool name>.mjs` modeled on `scripts/targets/grok.mjs`:

```js
import { body, FILM_HEAD } from './_common.mjs';
export default {
  durations: [5, 10],             // this tool's duration options, ascending
  render(shot, project, ctx) {    // shot is one entry of shots.json; ctx holds the story language's fixed sentences and language name
    return [FILM_HEAD, ...body(shot, ctx), '...'].join('\n');
  },
};
```

Then `--target <tool name>` works. `body()` already writes the action, eyeline, camera move, dialogue and constraints following `prompt-rules.md`; usually you change only the opening, the ending and how the parts are joined.

## Generating and ingesting

1. Upload the first frame `frames/<segment ID>/f<N>.png`, paste this shot's `prompt` from `prompts.json`, and set the duration to `seconds`.
2. Put the shot ID in the downloaded file name, such as `E01-03-s1.mp4`.
3. Run `bash scripts/ingest.sh $W` to move it to `video/E01-03/s1.mp4`.

The editing scripts scale and crop any resolution to the work's canvas (1920×1080 for 16:9, 1080×1920 for 9:16).

## What to test

After switching tools, test at least these with trial shots, and write the results back into this page:

- Dialogue: is it spoken correctly, and does the tool read delivery notes out as dialogue?
- Lip sync: is the person speaking the one moving their mouth?
- First frame: does the tool keep faces, costumes and unusual features (a blind eye, a scar)?
- Camera moves: make one push-in, one pull-out and one pan. Does each move happen, and does it stop?
- Moderation: are close-ups of young women blocked?
- Usage: how much does one 5-second and one 10-second video cost?
