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
- **An expression sheet isn't needed.** With the original sheet attached, asking for "six expressions + a costume flat-lay" gave six nearly identical faces, and the flat-lay row came out as the original's three views. With only the bust portrait as the face reference, the six expressions do come out, as the same person; but using that as a reference for tearful and surprised close-ups made no visible difference against the sheet alone (measured on 《加油》, one image per arm). Write the expression in each cut's `frame`.

## 3. script.json: the script

- **One beat, one thing.** Write actions as `act`; write dialogue as `who` + `say` + `tone`.
- **`tone` is only the tone of voice.** "Low voice" or "shouting" is fine; "wipes his sweat" is an action and must be its own `act` beat.
- **No dashes in dialogue.** Use commas for pauses.
- **Mark inner voice with `inner: true`.** In an inner-voice shot, either show the speaker's face with their mouth closed, or keep them out of the frame.
- **Introduce every entrance.** The first time a character appears in a scene, an earlier beat must show how they got there.
- **Beats follow from each other.** Two beats next to each other must join as "because … so …": because he sees the note is in his own handwriting, he snorts. After you write, read the script again with every unspoken "and then" replaced by "because … so". Where it does not join, add the cause or cut the beat.
- **When a twist lands, give the person it lands on a reaction.** The audience must see that what she expected and what happened differ: she thought he would pay for her, then he has her thrown out, so she needs a beat of surprise before she acts. If she just complies calmly, the twist does not land (光坐着, user feedback).
- **Keep beats consistent with the scene's cast.** If you write the sound of a punting pole, the person punting must be in this scene's `cast`.
- **Dialogue length sets the running time.** Chinese runs at about 3 characters/second, plus 1 second of lead-in, so a 20-character line takes about 7.7 seconds. Speech rates for English and Korean are in `scripts/lang/langs.json`; `validate.mjs` calculates by the story language.

## 4. storyboard.json: the storyboard

### Before you write

- **Check against the end of the previous episode.** Is each person standing or sitting, where are they, what are they holding, is each prop open or closed? This episode starts exactly where the last one ended.
- **When the user gives a camera-move table or a shot list, first ask for the reference video.** The table is often a transcription of a reference video. It can say how the camera moves, but not that the subject travels, which effects there are, or how shots are joined. If there is a reference, step through it frame by frame before writing. 狐月 first made 7 vertical shots from the table; the user said it looked like "spinning on the spot", and only the reference showed the direction was wrong. 9 submits were wasted.
- **Fix a floor plan of the location first.** Doors, windows, the kitchen or counter, each table and each person: where they are and which way they face. Put it in the scene setting or in the first segment's `blocking`. Derive every later "toward frame left / right" from it. 光坐着 had no floor plan; the storyboard said "toward the kitchen on frame right", but that side was the window, and in the video he shouted for the boss out of the window. For shots from the same camera position, check each first frame against the floor plan for which way people face once it is drawn (in 拍张照 01-1 she has her back to the bar, but 01-7, from the same position, was drawn with her facing it; the user spotted it at once).
- **Write `blocking` first for each segment.** Where each person is at the start of the segment, their pose, which way they face, and the state of each prop. Every cut's first frame follows it.
- **Whatever the reveal depends on stays out of frame; a clue that only makes sense after the reveal is in frame from the first shot.** The first is the answer itself; the second is the setup that makes viewers watch again. 跟谁吃的 opens with him phoning from the restaurant, and at second 6 an over-the-shoulder shot shows the lipstick-marked glass and empty plates across the table; viewers take it as a jealous call and only get it on "I left you at the restaurant".
- **Whatever the reveal depends on stays out of frame until the reveal.** When the joke is "there is nothing on the table", showing the empty table at the start gives viewers the answer in the first second. Frame the shots before the reveal so the tabletop is out of frame, write "the camera does not tilt down or pull out" in the limits, and do not mention a table in the prompt; the cut where the empty table is first seen is the reveal (拍张照: 01-1, 01-3 and 01-4 were tightened, and the viewfinder insert is the first time the tabletop shows).
- **First list what this episode will not give to the video model.** Video models get the following wrong, and handing them over only leads to repeated generations:
  - **Text the audience must read** (on a note, a screen, a gauge): draw no text in the first frame or the video; overlay it in the edit, for example with a `title`.
  - **Pictures that do not move** (a note on a desk, a fuel gauge): use the first frame as an insert (`insert` points to the first-frame file) and generate no video. An insert is at least 2 seconds for now; shorter stills must be made separately after the edit.
  - **Changes that must land on an exact moment** (a light snapping on, a car stopping): keep them unchanged in the video and make them in the edit, for example by changing the brightness, or with a freeze frame, a shake and a sound effect. The edit scripts do not do these effects yet; make them separately with ffmpeg.
  - **Light must follow cause and effect.** When the streetlight comes on, the sky is already dark; when it goes off, the sky is not yet fully light. When you must hand it to the video model (for example, when it is joined to a pan), use first and last frames: draw the last frame as it looks after dark, and pin it down in the prompt, "no light is on before second N; the sky darkens continuously". When you ingest, measure each frame's average brightness and check for jumps (老地方 E01-02/s6 was right on the 5th take).

  Reference: in 加油, 3 of the 14 cuts were stills, the corridor light and the engine stall were made in the edit, and none of the 11 generated videos had to be generated again.

### Each cut

- **One cut is one video generation.** 6 or 10 seconds. When the dialogue runs longer than the storyboard allows, editing keeps enough time for the dialogue.
- **What one person says in one breath goes in one cut.** Split over two cuts, the two videos differ in pace, tone and pauses, and the join does not flow (光坐着 E01-02/s3, s4). If it fits in 10 seconds, merge it into one cut and put the old second cut in `skip` in `fix.json`.
- **Answer three questions before choosing a shot size.** What must this cut make readable: a detail, a whole movement, an exchange between two people, one person's reaction, or where someone is? What would one size wider pull attention toward, and what would one size tighter lose? Will it still read on a phone screen? Then pick from the size table in `data-format.md`.
- **Choose the camera height together with the shot size, and write it in `angle`.** Eye level is neutral and steady, and is the default; a low angle makes a person look commanding or powerful, and adds tension; a high angle makes a person look small, vulnerable or controlled, and also shows the space. `angle` goes into both the first-frame prompt and the video prompt. For a hero's entrance, for example, use a low angle. If you are unsure, make a 12-panel grid with `frames.mjs grid` and pick from it; see `workflow.md` step 2.
- **No wide shots for cuts with dialogue or a face that must be recognized.** The face is too small, and the video model will redraw it.
- **When a face must be recognized while the character runs or walks, frame no wider than the waist.** In a full-body running shot the face is a few dozen pixels high; the model redraws it every frame and after a few steps it is someone else (tested in 渡口 episode 1, shot 01-1). To show the whole body in motion, add a separate full shot from behind or from the side, with no face to recognize and no lines.
- **Write `frame` as the first frame looks.** State the shot size, who is where in the frame, their pose, which way they face, the physical state of the props, and the light. Anything the source text calls "faint" or "glimpsed" must also be blurry in the first frame.
- **When the camera moves, `frame` describes where the move starts.** For a pull-out, draw the close shot; for a pan, keep the target out of frame. See the "Camera moves" section of `prompt-rules.md`.
- **When someone speaks to a person off-screen, `eyeline` gives only the direction.** "Off-screen, frame right"; do not say who that person is.
- **No character names in hand close-ups.** Write "a hand", not "her hand".
- **Use the last frame for continuous action.** When the action of two cuts must connect (standing up, handing something over), the next cut's first frame is the frame at the previous cut's cut point, not the storyboard frame.
- **Start a new action at the head of the next cut.** For an action such as grabbing a collar, draw the next cut's first frame a moment before it (the hand still hanging down), not with the collar already grabbed; otherwise the cut looks like it skipped a beat (老地方 E01-02/s2).
- **Use the same first frame for a running gag.** For repeats such as raising a hand three times or rushing to the bar twice, reuse the first occurrence's first frame for the later ones, with exactly the same composition and shot size, so viewers recognize "here we go again" (拍张照 01-1/02-1/02-4, 01-7/02-3).
- **In a pan transition, the first and last frames must be in the same space.** To tilt down from the lamp head to the bench, draw the last frame as a downward extension of the first frame: the top half of the last frame is the bottom half of the first. If the last frame is drawn from a new camera position, the trees and the lamp post shift during the move (老地方 E01-03/s1, twice).
- **Handing something across, shoot over the shoulder.** Shoot from behind the receiver, with the giver facing the camera and pushing the object toward the camera until it is in front of the receiver. If you film the giver head-on and only write "pushes it to the person opposite", the video model cannot draw a push toward the camera and sends it to the table edge or the frame edge (各论各的 E01-03/s1, first two takes). The first frame can reuse an over-the-shoulder frame from the same scene.
- **State what small props are doing.** Loose or tied up, where they are, whether anyone touches them.
- **Show banknotes only by colour and edge; state the amount in dialogue.** Write "one green banknote, only its edge and colour visible", with no close-up of the note face and no denomination digits. Viewers read the value from the colour (green = 50, blue-grey = 10), and the amount is said in a line ("找你三十", "thirty back"). Written this way, the image model does not refuse, and the notes do not warp or sprout text when they move in the video (真的).
- **The first-frame background decides which side a character is on.** In scenes across a counter, bar or window, the shopkeeper has shelves behind them and the customer has the door and street. If a first frame gets the background backwards, viewers think the character has moved to the other side. The image model may draw a door even when the storyboard says shelves: check every first frame's background before giving it to the video tool (真的 E01-03, two frames redrawn).
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
- **Speed up speech a little, action a lot.** Shots with dialogue run at ×1.0–1.25; `cut.py --rate 4.0` works this out (up to 1.3, or `maxSpeed` in `project.json`). For action-only shots (putting something down, straightening a collar, opening a door), write ×1.4–2.0 in `speed` in `fix.json`. Within a line, Chinese runs at about 5–8 characters per second; leave a 0.2–0.3 second breath between lines.
- **"Not so fast": ask which kind of fast.** Speeding up in the edit and the speed of the action in the frame are two different things. On 狐月 the user said "no need to speed it up that much", meaning no speed-up in the edit (a slow BGM was planned). I also wrote the action slow in the prompts, and the result looked like spinning on the spot. The reference had explosive action, cut at 1.0x.
- **Make every silence deliberate.** Keep the pause before a punchline, such as 1.3 seconds of dark corridor or a 1.3 second freeze when the engine dies. Cut gaps that do no work.
- **Very fast pace: speed up all dialogue shots, and add silent absurd shots when time runs short.** When the user wants to give the viewer no time to think, set `maxSpeed` to 1.45 and `cutTail` to 0.05 in `project.json` and edit with `cut.py --rate 6.5`; dialogue shots all at ×1.45 still look natural. When the film runs short, add a few silent absurd action shots (a counterfeit-detector pen, a banana held like a gun) instead of slowing the pace to fill time (真的: 18 cuts, 38.7 seconds).
- **In vertical video, single shots can make viewers believe two people are a couple.** A vertical cut usually has room for only one person. Use four techniques together: match the two people's eyelines (he looks down to the right, she looks up to the left); lay one person's voice over the other person's picture; give a shared signal with two inserts of the same composition (a wedding ring, a diamond ring); and never show the two in the same frame before the reveal, so their first shot together is the reveal (老地方).
- **After the last beat, hold a 1–1.5-second reaction, then cut to black.** If the film ends as soon as the last line or chat bubble is done, the user feels "it just ends" (拍张照); but Douyin data shows viewers leave once the punchline lands: 各论各的 dips at 35–37 s and 不能闭眼 at 34–35 s. So hold a single reaction (freezing, lowering the phone) of about 1.3 seconds, then `tailBlack` 0.3 seconds, with no 2-second fade (跟谁吃的: 1.3 seconds after the waiter's line; the film went from 24.3 to 23.3 seconds).

### Keeping viewers: rules from Douyin data

On 10-16 we read the Douyin back-end data for 10 of the account's films (2-second bounce rate, 5-second retention, per-second retention, traffic sources). Films that got recommendation traffic lost to similar films at seconds 3–8 and in the middle, not because of length. Write the script and storyboard by these rules:

- **The picture reads in 0.2 seconds and the first line is a conflict.** The first frame shows a relationship or an event: no establishing shot, no walking in through a door. The first line starts within 0.5 seconds and is a question or a conflict (各论各的 and 换回来: 2-second bounce 26% and 20%; 光坐着 had no line for its first 2 seconds: 31%).
- **Say what the two people are to each other within 5 seconds.** Source clips often name the relationship late (the original clip says "老公" at 11.5 seconds); move it into the first line (跟谁吃的: "老婆，你在哪儿呢？" at 0.3 seconds).
- **Every line adds new information.** Cut any line that only repeats an emotion or asks something the audience already knows. The first cut of 跟谁吃的 had "那你刚才跟谁吃的？" / "跟你啊": he is in the restaurant himself, so the question makes no sense, and the user spotted it at once. "那你倒是回来接我啊" / "我都快到家了" adds a layer: she is not coming back.
- **A second twist must explain itself.** The audience must get it within a second, without inventing a backstory. 跟谁吃的 first had a stranger sit in her seat and eat her leftovers; the user asked "what is the man for?" A waiter handing over the bill, "您爱人走的时候说，您买单", needs no explanation.
- **When a twist turns on money, draw the direction of every payment first.** Who pays whom, who owes whom: list it in a table, then write the lines. For a reverse con to work, the con man must hold a payment he owes the other side anyway. The ending of 等同现金 was wrong twice: "pay the rent with this card" means the landlord hands the card back and collects 1,500 less rent; "transfer me 1,500 more with the rent" gives the owner no reason to pay. "When I return your rent deposit, I'll return it as this card" works, because the landlord owes the tenant the deposit; he nets 500.
- **A twist must be unexpected, and make sense looking back.** Do not show the audience the hidden card early, and do not add an unconnected event just for one more twist (the first draft of 等同现金 had "another man comes in with found money"; the user called it "a twist for the sake of a twist"). Put the clues in plain sight: the assistant recognises him and the owner is unusually polite to him; after the reveal, both make sense.
- **No crossovers, no reliance on earlier films.** The title, the first line and the cover text must make sense on their own. 夜馆, 老地方 and 拍张照 depended on earlier films; their traffic came from the friends and profile pages, with only 4%–18% from recommendations.
- **Choose subjects for the account's audience.** The audience came from the one hit: about 90% male, about 90% aged 41+. Married couples, checking up on a spouse and paying the bill fit; café girls and camera-move showcases do not.
