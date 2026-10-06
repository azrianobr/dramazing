> Translated from [references/zh/writing.md](../zh/writing.md), which is the source of truth.

# From source text to storyboard

This stage has no script. The AI assistant reads the source text and writes `project.json`, `script.json` and `storyboard.json`. The format is in `data-format.md`.
Write dialogue (`say`) in the story language, and set `language` in `project.json` to match. Descriptions written for the image and video models, such as `frame` and `action`, can be in the story language or in English.
Follow the rules below when you write. Each one comes from a real problem in video generation.

## 1. Set the scale first

- After reading the source text, give the user an estimate of the scale first: how many episodes, how many scenes per episode, how long each episode runs, and how many characters and main props appear. Wait for the user to approve before you write more.
- 120 to 150 seconds is a good length for an episode. For reference: *Dukou (渡口)*, 813 characters long, became 6 episodes, 9 scenes and 123 lines of dialogue, with final cuts of 128 to 152 seconds per episode.
- End each episode on a hook: an unfinished sentence, an object just revealed, a character's reaction.

## 2. project.json: characters, scenes, props

- **Describe each character's face, hair, costume and age in full.** For a young woman, state that she is an adult, and do not make her expression frightened or childlike. Freckles or an upturned face can both get a character judged as a minor.
- **Put unusual features in `trait`.** A blind eye, a scar or a limp mentioned in the source text must stay the same throughout.
- **Make `alias` an appearance phrase that identifies the character at a glance.** For example, "the young woman with long braids". Video models do not know character names.
- **Match costumes and props to the source text.** Where the source says nothing, fill in details that fit the period and the character's position, write them into the setting, and follow them in every storyboard cut afterwards.
- **Write each scene's `ambient` by lighting.** The same scene moves differently in fog and after daybreak.
- **`sheet` prompts for the sheets**: for a character, a multi-view character sheet (front bust portrait + full-body front, side and back); for a scene, an environment reference image; for a prop, a multi-angle image on a white background. All in 16:9 landscape, whatever the work's aspect ratio, so the views fit side by side.

## 3. script.json: the script

- **One beat, one thing.** Write actions as `act`; write dialogue as `who` + `say` + `tone`.
- **`tone` is only the tone of voice.** "Low voice" or "shouting" is fine; "wipes his sweat" is an action and must be its own `act` beat.
- **No dashes in dialogue.** Use commas for pauses.
- **Mark inner voice with `inner: true`.** In an inner-voice shot, either show the speaker's face with their mouth closed, or keep them out of the frame.
- **Introduce every entrance.** The first time a character appears in a scene, an earlier beat must show how they got there.
- **Keep beats consistent with the scene's cast.** If you write the sound of a punting pole, the person punting must be in this scene's `cast`.
- **Dialogue length sets the running time.** Chinese runs at about 3 characters/second, plus 1 second of lead-in, so a 20-character line takes about 7.7 seconds. Speech rates for English and Korean are in `scripts/lang/langs.json`; `validate.mjs` calculates by the story language.

## 4. storyboard.json: the storyboard

### Before you write

- **Check against the end of the previous episode.** Is each person standing or sitting, where are they, what are they holding, is each prop open or closed? This episode starts exactly where the last one ended.
- **Write `blocking` first for each segment.** Where each person is at the start of the segment, their pose, which way they face, and the state of each prop. Every cut's first frame follows it.

### Each cut

- **One cut is one video generation.** 6 or 10 seconds. When the dialogue runs longer than the storyboard allows, editing keeps enough time for the dialogue.
- **Answer three questions before choosing a shot size.** What must this cut make readable: a detail, a whole movement, an exchange between two people, one person's reaction, or where someone is? What would one size wider pull attention toward, and what would one size tighter lose? Will it still read on a phone screen? Then pick from the size table in `data-format.md`.
- **No wide shots for cuts with dialogue or a face that must be recognized.** The face is too small, and the video model will redraw it.
- **When a face must be recognized while the character runs or walks, frame no wider than the waist.** In a full-body running shot the face is a few dozen pixels high; the model redraws it every frame and after a few steps it is someone else (tested in 渡口 episode 1, shot 01-1). To show the whole body in motion, add a separate full shot from behind or from the side, with no face to recognize and no lines.
- **Write `frame` as the first frame looks.** State the shot size, who is where in the frame, their pose, which way they face, the physical state of the props, and the light. Anything the source text calls "faint" or "glimpsed" must also be blurry in the first frame.
- **When the camera moves, `frame` describes where the move starts.** For a pull-out, draw the close shot; for a pan, keep the target out of frame. See the "Camera moves" section of `prompt-rules.md`.
- **When someone speaks to a person off-screen, `eyeline` gives only the direction.** "Off-screen, frame right"; do not say who that person is.
- **No character names in hand close-ups.** Write "a hand", not "her hand".
- **Use the last frame for continuous action.** When the action of two cuts must connect (standing up, handing something over), the next cut's first frame is the frame at the previous cut's cut point, not the storyboard frame.
- **State what small props are doing.** Loose or tied up, where they are, whether anyone touches them.

### After you write

1. Run `node scripts/validate.mjs --work <work directory> --ep N`. You must fix every `✗`. Read every `⚠️` so you know about it.
2. After the storyboard frames are made, build a narrative preview for the user to confirm the story is easy to follow, then generate video. See step 4 of `workflow.md`.
