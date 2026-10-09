> Translated from [references/zh/writing.md](../zh/writing.md), which is the source of truth.

# From source text to storyboard

This stage has no script. The AI assistant reads the source text and writes `project.json`, `script.json` and `storyboard.json`. The format is in `data-format.md`.
Write dialogue (`say`) in the story language, and set `language` in `project.json` to match. Descriptions written for the image and video models, such as `frame` and `action`, can be in the story language or in English.
Follow the rules below when you write. Each one comes from a real problem in video generation.

## 1. Set the scale first

- After reading the source text, give the user an estimate of the scale first: how many episodes, how many scenes per episode, how long each episode runs, and how many characters and main props appear. Wait for the user to approve before you write more.
- 120 to 150 seconds is a good length for an episode. For reference: *Dukou (渡口)*, 813 characters long, became 6 episodes, 9 scenes and 123 lines of dialogue, with final cuts of 128 to 152 seconds per episode.
- **Open the first 3 seconds on the strangest thing.** No setup, small talk or background at the start of an episode. Open on the strangest image or the strangest line in it. If viewers do not understand at once, that is fine: they stop to watch. If they see two people making small talk, they swipe away. A title card at the start also uses these 3 seconds.
- **In a series, end each episode on a hook**: an unfinished sentence, an object just revealed, a character's reaction. Change the type of hook from episode to episode: if this one reveals a secret, make the next one a hard choice or a reversal. A single short ends on its punchline, which must land; it does not end on a hook.
- These two rules, "cause and effect" in section 3 and the self-check in "After you write" come from the craft experience of short-drama writers. They are not yet checked against audience-retention data from this project.

## 2. project.json: characters, scenes, props

- **Describe each character's face, hair, costume and age in full.** For a young woman, state that she is an adult, and do not make her expression frightened or childlike. Freckles or an upturned face can both get a character judged as a minor.
- **Put unusual features in `trait`.** A blind eye, a scar or a limp mentioned in the source text must stay the same throughout.
- **Make `alias` an appearance phrase that identifies the character at a glance.** For example, "the young woman with long braids". Video models do not know character names.
- **Match costumes and props to the source text.** Where the source says nothing, fill in details that fit the period and the character's position, write them into the setting, and follow them in every storyboard cut afterwards.
- **Write each scene's `ambient` by lighting.** The same scene moves differently in fog and after daybreak.
- **`sheet` prompts for the sheets**: for a character, a multi-view character sheet (front bust portrait + full-body front, side and back); for a scene, an environment reference image; for a prop, a multi-angle image on a white background. All in 16:9 landscape, whatever the work's aspect ratio, so the views fit side by side.
- **Choose appearance words to fit the character.** For an idol or a star you can write "idol-level looks, refined features"; for an ordinary person, don't: crow's feet and stubble are what make them believable. For skin, don't write "translucent" or "glass skin"; write "clean skin with a healthy colour, natural pores and texture kept". In a test with one image each, differing only in that phrase, the "translucent" face came out with smoother cheeks (measured on 《加油》).
- **No text of any kind on a sheet.** No title, number, slogan, bio, tags, signature or colour codes. Sheets are attached as references to the first frames; text on a sheet leaks into the frames, and the video model then burns it in. Put the colour palette in the prompt text.
- **An expression row and a costume flat-lay don't work when the original sheet is attached as the reference.** Asked to draw "six expressions + a costume flat-lay" from the original sheet, the model gave six nearly identical faces, and drew the flat-lay row as the original's three views and detail strip (measured on 《加油》, one image). Without the original attached, with only the bust portrait as the face reference, it is untested. Write the expression in each cut's `frame`.

## 3. script.json: the script

- **One beat, one thing.** Write actions as `act`; write dialogue as `who` + `say` + `tone`.
- **`tone` is only the tone of voice.** "Low voice" or "shouting" is fine; "wipes his sweat" is an action and must be its own `act` beat.
- **No dashes in dialogue.** Use commas for pauses.
- **Mark inner voice with `inner: true`.** In an inner-voice shot, either show the speaker's face with their mouth closed, or keep them out of the frame.
- **Introduce every entrance.** The first time a character appears in a scene, an earlier beat must show how they got there.
- **Beats follow from each other.** Two beats next to each other must join as "because … so …": because he sees the note is in his own handwriting, he snorts. After you write, read the script again with every unspoken "and then" replaced by "because … so". Where it does not join, add the cause or cut the beat.
- **Keep beats consistent with the scene's cast.** If you write the sound of a punting pole, the person punting must be in this scene's `cast`.
- **Dialogue length sets the running time.** Chinese runs at about 3 characters/second, plus 1 second of lead-in, so a 20-character line takes about 7.7 seconds. Speech rates for English and Korean are in `scripts/lang/langs.json`; `validate.mjs` calculates by the story language.

## 4. storyboard.json: the storyboard

### Before you write

- **Check against the end of the previous episode.** Is each person standing or sitting, where are they, what are they holding, is each prop open or closed? This episode starts exactly where the last one ended.
- **Write `blocking` first for each segment.** Where each person is at the start of the segment, their pose, which way they face, and the state of each prop. Every cut's first frame follows it.
- **First list what this episode will not give to the video model.** Video models get the following wrong, and handing them over only leads to repeated generations:
  - **Text the audience must read** (on a note, a screen, a gauge): draw no text in the first frame or the video; overlay it in the edit, for example with a `title`.
  - **Pictures that do not move** (a note on a desk, a fuel gauge): use the first frame as an insert (`insert` points to the first-frame file) and generate no video. An insert is at least 2 seconds for now; shorter stills must be made separately after the edit.
  - **Changes that must land on an exact moment** (a light snapping on, a car stopping): keep them unchanged in the video and make them in the edit, for example by changing the brightness, or with a freeze frame, a shake and a sound effect. The edit scripts do not do these effects yet; make them separately with ffmpeg.

  Reference: in 加油, 3 of the 14 cuts were stills, the corridor light and the engine stall were made in the edit, and none of the 11 generated videos had to be generated again.

### Each cut

- **One cut is one video generation.** 6 or 10 seconds. When the dialogue runs longer than the storyboard allows, editing keeps enough time for the dialogue.
- **Answer three questions before choosing a shot size.** What must this cut make readable: a detail, a whole movement, an exchange between two people, one person's reaction, or where someone is? What would one size wider pull attention toward, and what would one size tighter lose? Will it still read on a phone screen? Then pick from the size table in `data-format.md`.
- **Choose the camera height together with the shot size, and write it in `angle`.** Eye level is neutral and steady, and is the default; a low angle makes a person look commanding or powerful, and adds tension; a high angle makes a person look small, vulnerable or controlled, and also shows the space. `angle` goes into both the first-frame prompt and the video prompt. For a hero's entrance, for example, use a low angle.
- **No wide shots for cuts with dialogue or a face that must be recognized.** The face is too small, and the video model will redraw it.
- **When a face must be recognized while the character runs or walks, frame no wider than the waist.** In a full-body running shot the face is a few dozen pixels high; the model redraws it every frame and after a few steps it is someone else (tested in 渡口 episode 1, shot 01-1). To show the whole body in motion, add a separate full shot from behind or from the side, with no face to recognize and no lines.
- **Write `frame` as the first frame looks.** State the shot size, who is where in the frame, their pose, which way they face, the physical state of the props, and the light. Anything the source text calls "faint" or "glimpsed" must also be blurry in the first frame.
- **When the camera moves, `frame` describes where the move starts.** For a pull-out, draw the close shot; for a pan, keep the target out of frame. See the "Camera moves" section of `prompt-rules.md`.
- **When someone speaks to a person off-screen, `eyeline` gives only the direction.** "Off-screen, frame right"; do not say who that person is.
- **No character names in hand close-ups.** Write "a hand", not "her hand".
- **Use the last frame for continuous action.** When the action of two cuts must connect (standing up, handing something over), the next cut's first frame is the frame at the previous cut's cut point, not the storyboard frame.
- **State what small props are doing.** Loose or tied up, where they are, whether anyone touches them.
- **Text to be read never faces the camera.** The text is overlaid in the edit, so the generated cut says "the note always shows its back to the camera". Otherwise the model draws a line of garbled text.
- **Use a static camera wherever possible, and give each cut one continuous chain of action.** In 加油, 13 of the 14 cuts were static, and each was generated in one attempt.
- **For a cut with dialogue, write `limits` for the people in the frame:**
  1. Each speaker's voice: age, timbre, tone. Write it in every cut, for example "an adult man of thirty-six, low and steady, completely serious".
  2. When more than one person is in the frame, state which line is spoken by the person in which part of the frame, and that the person not speaking keeps their mouth closed. For example, "the first line is spoken by her on the right of the frame, the second by him on the left; while one speaks, the other keeps their mouth closed".
  3. For narration from off-screen, write "the person in the frame keeps their mouth closed throughout".

  大水 and 加油 were both written this way, and neither had a wrong speaker or two people moving their mouths at once.

### After you write

1. Check it yourself first:
   - At the end of each scene, at least one of these has changed: a character's state of mind, a relationship, what the audience knows, how strong the conflict is. If none changed, cut the scene or merge it into another.
   - Do the first 3 seconds open on something strange? Does every beat join with "because … so"? Is there one image people will remember?
2. Run `node scripts/validate.mjs --work <work directory> --ep N`. You must fix every `✗`. Read every `⚠️` so you know about it.
3. After the storyboard frames are made, build a narrative preview for the user to confirm the story is easy to follow, then generate video. See step 4 of `workflow.md`.

## 5. Pacing for vertical shorts

For a vertical short of 30 to 60 seconds, follow the numbers from 加油. The user rated it the most comfortable of the three shorts for pacing and speech rate.

| | 不能闭眼 | 大水 | 加油 |
|---|---|---|---|
| Average shot length | 3.7 s | 3.3 s | 1.5 s |
| Words per second, whole film (Chinese characters) | 2.5 | 3.6 | 1.7 |
| Speed-up of shots with dialogue | ×1.15, whole film | ×1.0–1.3 | ×1.0–1.25 |
| Speed-up of action-only shots | ×1.15, whole film | not separately | ×1.4–2.0 |

- **Keep shots short.** About 1.5 seconds per cut on average, never more than 3.5 seconds. When you write the storyboard, split a long action into several cuts.
- **Pack in events, not words.** 加油 has the fewest words and drags the least. Fill the time between lines with action, quick cuts, sound effects and stills, so that something happens every second.
- **Speed up speech a little, action a lot.** Shots with dialogue run at ×1.0–1.25; `cut.py --rate 4.0` works this out (up to 1.3). For action-only shots (putting something down, straightening a collar, opening a door), write ×1.4–2.0 in `speed` in `fix.json`. Within a line, Chinese runs at about 5–8 characters per second; leave a 0.2–0.3 second breath between lines.
- **Make every silence deliberate.** Keep the pause before a punchline, such as 1.3 seconds of dark corridor or a 1.3 second freeze when the engine dies. Cut gaps that do no work.
