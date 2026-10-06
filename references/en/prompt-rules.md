> Translated from [references/zh/prompt-rules.md](../zh/prompt-rules.md), which is the source of truth.

# Prompt rules

Every rule here comes from testing. The parentheses say where a problem first appeared. The examples come from *Dukou (渡口)*, the sample work made with this workflow (see `examples/渡口/`).
The video tool tested was Grok. Wherever this page says "Grok will …", check again if you switch tools. The rules themselves (one action per shot, a clear end point, hold the first frame) apply to similar tools in general.
Most rules are already built into `scripts/video-prompts.mjs` and `scripts/targets/` and are added automatically when prompts are generated. The parts that need a human check are listed below too.

## Structure of a prompt

Every prompt that `video-prompts.mjs` generates follows this order (`grok` and `generic` have the same content and differ only in how the parts are joined):

1. Quality opening: film look; keep the first frame's composition, faces and costumes.
2. Shot header: ID | seconds | shot size | scene.
3. Camera setup: who it is aimed at, angle, lens.
4. Action and eyeline.
5. Camera move (if there is one).
6. Ambience.
7. Dialogue (the delivery described in English, the line itself in the story language).
8. Key constraints.
9. Number of people on screen.
10. Ending: no subtitles, no text, no music.

Everything is on one line, with no line breaks: pressing Enter in a web input box submits it immediately.

## Writing

- **Forbid actions directly; never name a forbidden object.** "Stays seated, never stands up" and "keeps their back to the camera the whole time, never turns around" work. "No bamboo hat" brings in a bamboo hat; write "this is the only person in the frame" instead.
- **Replace names with appearance phrases.** Grok does not know character names. Write an appearance phrase in `alias` in `project.json`.
- **No dashes in dialogue.** A Chinese dash gets read out as 「一」 ("one"), so always use commas in dialogue and subtitles. For English and Korean, the generator replaces dashes with comma pauses.
- **Put delivery notes after the line, marked as not to be spoken.** In brackets before the line, they get read out as dialogue (in *Dukou* E03-11-1 the character said 「抹了把汗」, "wipes his sweat", aloud). In the script, `tone` is only the tone of voice; write actions as their own beat.
- **For the speaker, write "opens their mouth on every word".** With only "lips in sync", a tone such as "low voice" turns into a voiceover with a still mouth (E06-07-2).
- **In inner-voice shots, the speaker faces the camera with their mouth closed.** If someone else is in the frame, or the speaker has their back to the camera, it looks like they are talking to someone.
- **State the physical state of small props.** "Loose, rolling at the bottom of the paper bag, none falling out". Otherwise they look glued to the hand (E02, the roasted beans).
- **For running and walking, write "normal speed, not slow motion".**
- **For period objects, state the period and the material.** "An old wooden boat with an awning"; otherwise you get a speedboat.
- **Write constraints that the storyboard cannot imply into the cut's `limits` by hand.**
- **"No cuts" everywhere.** Every prompt includes "one continuous shot with no cuts, no jumps, no change of camera position". "One take" alone can still change the camera position midway.

## Characters

- **Put unusual features in `trait`.** Grok will "fix" features such as a blind eye or a scar; a correct first frame cannot hold them. When the character faces the camera, the generator writes "keep it throughout" once in English and once in the story language. When the character has their back to the camera, it leaves this out, so it does not make them turn around (E05-03-1, 06-1).
- **State that a young woman is an adult.** A frightened expression, freckles or an upturned face make a character look childlike. Grok then judges that "the image shows a minor" and produces no video, without any error. In both the sheet and the first frame, write "an adult woman in her early twenties, with a restrained expression" (E04-14-2).
- **No names in hand / prop close-ups.** With a name, Grok draws the whole person, sometimes two of them. The generator writes "only hands, sleeves and props in the frame; the owner of the hands stays off-screen" (E06-01-1).
- **When the eyeline target is off-screen, give only the direction.** Write "looks off-screen, frame right", not who that person is. With "the young woman off-screen", Grok draws her into the frame during a push-in (E05-03-1 gained an extra little girl).
- **Faces in wide shots get redrawn.** Do not use a wide shot when someone speaks; make the first frame a medium shot or a medium close-up.

## Camera moves

### First ask whether to move

For shots with dialogue or clear acting, default to a static shot (`Static Shot`): the audience can see the performance clearly only when the camera stays still. A camera move needs a narrative reason:

| What you want | Use |
|---|---|
| Get closer to the character's mind | `Push In` |
| Establish the setting, show isolation, close a scene | `Pull Out` |
| Reveal something off-screen | `Pan`, `Tilt`, `Rack Focus` |
| Walk along with a character | `Tracking Shot` |
| Conflict, panic, staying close to a character | `Handheld` |
| Rise to a wide view at the opening, rise and pull away at the end | `Crane` |
| See through a character's eyes | `POV` |

Do not move the camera just to look sophisticated.

### One camera move per shot, with start, end and stop point

- **One main camera move per shot.** A push-in, then a pan, then an orbit easily breaks a video only a few seconds long. Split complex staging into two shots.
- **Write it all: name, direction, speed, subject, start and end framing, stop point.** With only "push in", the AI keeps pushing until the shot ends. Write it in the cut's `move`, and the generator turns it into "from … to …, stopping when …":

```json
"move": { "from": "a waist-up medium shot", "to": "a close-up of the face", "stop": "she looks up", "dir": "right", "speed": "slowly", "target": "陆行远" }
```

- **Draw the first frame as the start of the move.** Grok moves from the first frame toward the end point; if the first frame already has the end composition, there is nowhere to move. For a pull-out, the first frame is the close shot where the move starts; for a pan, the target is still out of frame; for a rack focus, only the starting layer is sharp. Of the 13 camera moves in *Dukou* E06, 4 failed, all for this reason.
- **The push-in is the most reliable.** It works best with an emotionally heavy line, stopping as the line ends.

### Three pairs of moves that are easy to confuse

| This | Is not | Difference |
|---|---|---|
| Pan | Truck | A pan rotates in place with the camera position fixed; a truck moves the whole camera sideways |
| Tilt | Pedestal | A tilt looks up or down in place; a pedestal raises or lowers the whole camera |
| Push / pull | Zoom | In a push or pull the camera really moves forward or back, and the background shows parallax; we always write "focal length unchanged" |

### Keep the actor and the camera from colliding

When a character walks toward the camera, state whether the camera waits in place or moves back to keep its distance. For a tracking shot, set `move.dir`: behind / front / left / right. "front" means the camera moves backward while the character walks toward it; the constraint then changes automatically to "the character never walks into the lens".

### Handheld, POV, two phases

- **Handheld is a texture, not a path.** Set `move.level` to restrained / documentary / intense (default: restrained), then say whom the camera follows, from which direction and how far away.
- **Point of view (POV).** Set `move.who` to whose eyes these are. Only that person's hands and sleeves may appear in the frame, and they cannot speak, because the audience cannot see their mouth.
- **Two phases.** `move.then = { camera, trigger, ... }` is written as "Phase one: …. When [trigger], phase two: …". Use it only for 10-second shots. The second move must have a trigger.

**Untested camera moves** (two phases): the first time you use one, make a trial shot of that shot, and generate the batch only after it passes. The generator's preflight reminds you. Crane and POV have passed on Grok.

### Moves we do not use

- Drone / FPV: needs a route to fly through, so it does not work indoors or in tight spaces. It also breaks the mood of a period drama.
- Camera roll: too showy for restrained storytelling.
- Dolly zoom (Hitchcock zoom): hard for AI, and it needs a depth reference such as a corridor.
- Dutch angle: a static tilted composition, not a camera move. If you want it, write it in the first-frame description.

The camera-move section draws on AdrianPunk's *AI Video Camera-Movement Dictionary* ([part 1](https://x.com/adrianpunk115/status/2104172387575222768), [part 2](https://x.com/adrianpunk115/status/2104523576020017575)). This is our own summary, reorganized by our test results; see the links for the original.
