> Translated from [references/zh/showcase.md](../zh/showcase.md), which is the source of truth.

# Action showcase: travel, wipe transitions, keyframe transformations

This page covers a short film with no plot, carried by camera moves and action. It comes from 狐月 (10-12). The final cut is `works/狐月/成片/狐月.mp4`: 16:9, 31.5 seconds, 13 shots, at original speed. The lead has two forms, human and fox, and changes form inside two camera moves. The user approved the camera work and the transformations.

It is different from the one take in `one-take.md`. A one take allows no cuts; people stand on their marks and all movement comes from the camera. A showcase allows cuts; the subject keeps moving, and shots are joined by something covering the lens.

## When to use it

- The user gives a camera-move table or a reference video, or says "show off" or "no plot".
- There are no lines, or only a sound or two. Lines distract Grok and hold the action back.
- One lead is the safest. The more leads, the more often Grok gets positions and occlusions wrong.

**Get the reference video first.** A camera-move table from the user is often a transcription of a reference video. The table can say how the camera moves, but not that the subject travels, which effects there are, or how shots are joined. 狐月 first made 7 vertical shots from the table. The user said it looked like "spinning on the spot", and only the reference showed the direction was wrong: 2 hours and 9 submits were wasted. When you get a table, ask whether there is a reference video. If there is, step through it frame by frame (one frame every 0.25 seconds, laid out as a sheet) before you design.

## Shot structure

1. **One shot, one journey.** Each shot states the direction the subject travels: slides right along the ground, leaps up to the left, dives at the lens, crosses the moon. The camera moves with the subject, who enters at one edge of the frame and leaves at the other. A subject who stays on the spot, turning and spreading the sleeves, looks like "spinning on the spot".
2. **Fast action, no speed-up in the edit.** Write the action as bursts: "suddenly", "pushes off", "snaps open". Generate 6 seconds per shot and use only the densest 1–2 seconds in the edit. The speed comes from the frame, not from speeding up afterwards.
3. **Join shots with an occluder.** At the end of a shot, let something fill the frame: a light arc flashing white, white silk, a wide sleeve, a tail, moonlight. Cut to the next shot on the frame where it covers about 95% or more. 狐月 cuts straight from a filled frame at 9.9 seconds (white flash) and 12.8 seconds (white silk), and the user accepted that.
4. **Put close-ups before the action.** The landing step, the hand gripping the prop and the eye opening are hard cuts, about 1 second each. Both the reference video and the user's table do this.
5. **The face is large only once.** The whole film has one extreme close-up of the eyes. Its first frame comes from the character sheet, with the eye crop from the sheet attached. All other shots use profile, three-quarter back or silhouette. A face that turns to the front tends to drift (trial t2, horizontal s9).

## How to write the effects

In photoreal style, Grok can draw these:

| Effect | Wording | Result on 狐月 |
|---|---|---|
| A prop swings out a light arc | "the fan sweeps out a crescent-shaped blue-white arc of light; the arc is light; after it crosses the lens the frame flashes white" | t1 and s13 both drew it as light |
| White silk occlusion | "strips of white silk sweep fast across the lens, with motion blur; the last wide strip fills the frame" | s7 usable |
| Frost spray on the ground | "her foot lands on frosted tiles and frost mist sprays up" | s2 usable |
| Burst of light particles | "the whole body bursts into white light particles that fill the frame" | s11 usable (not used after the transformations were redone) |
| A prop covers the moon | "the fan opens into a full circle and covers the moon exactly, leaving only a crescent rim of light" | s8 right on the second try: the fan must be drawn big enough in the first frame |

Rules:

- **Attach light effects to props, not to bodies or tails.** A light trail swung from the tail was drawn as a second tail (vertical s6). For fire on a tail, write only "a small tuft of flame at the tail tip, no light trail".
- **"Ink-wash streaks" cannot be drawn.** White ink-wash streaks on the ground came out as splashes and white mist. Write what Grok can draw: "a trail of white mist".
- **Say clearly when a prop leaves the hand.** "There is only one fan in the whole shot; after she throws it, both her hands are empty." Without this, Grok draws another fan in her hand (x1, first take).

## Transformations: done inside one keyframe shot

The user wanted "covered by white silk: in goes a person, out comes a fox", with no hard cut. Each transformation is one continuous 6-second shot from Grok's keyframe mode, with the camera moving the whole time.

| Keyframe | What to draw | 狐月 transformation 1 | 狐月 transformation 2 |
|---|---|---|---|
| First frame | The frame at the previous shot's cut point, taken straight from the video | s8 at 1.7 s: she flies in front of the moon holding the fan open in a full circle | s11 at 0.5 s: the fox has just reached the middle of the moon, with half the moon still ahead |
| Middle frame (3.0 s) | The occluder fills the frame, with nobody in it | White silk rushing at the lens | The moon's face filling the whole frame |
| Last frame | The new form, from behind or as a silhouette | The fox bursts out from behind the silk toward the roof ridge | Her back, dropping out of the moonlight toward the silk road |

Key points:

- **Take the first frame from the previous shot.** Then the camera carries on moving instead of starting a new shot. In `one-take.md`, chaining from the previous part's last frame changed a face. Here it caused no trouble because the chosen frame shows no face: a silhouette, the fox, the fan in front. Choose the frame the same way.
- **The subject must move toward the middle frame's "entrance".** In the first take of transformation 2, the first frame had the fox already past the middle of the moon, and the middle frame had the moon in the centre. To make it "fly into the moon", Grok pulled it back, and the fox looked as if it were flying backwards. Choose the first frame from the moment before the subject reaches the target.
- **Leave no target in the middle frame to aim at.** The occluder fills the whole frame, with no edges showing. With night sky around the moon, Grok pulls the subject toward the moon's centre. Cropped so the moon's face fills the frame, the fox flew straight on into it.
- **The last frame locks the composition, not the face.** Use a back view or a silhouette for the human form's last frame.
- **Write "at every moment there is only one figure in the frame; never a person and a fox at once"**, then "never dissolve, never cut". Make the camera the subject only for the occluder: "the camera skims along the white silk". The subject must travel, so do not borrow "people do not move, do not write turns" from `one-take.md`.
- **Check at 720p first, then upscale.** Keyframe mode tops out at 720p. Check frame by frame and set the cut points at 720p, then upscale to 1080p (1904×1072) on Grok and use the same cut points.

Check: for 1 second either side of the middle frame, take a frame every 0.125 seconds. Look for any frame with both a person and a fox, or two shapes overlapping. Check that direction, height and speed match before and after the occluder, and that the new form's marks (one tail, forehead mark, bell) are all there.

Results on 狐月: transformation 1's first take had an extra fan, and one retake fixed it. Transformation 2's first take had the fox flying backwards; after changing the first and middle frames, one retake fixed it. Neither had a dissolve. In transformation 2 she slowly appears out of the moonlight rather than being revealed as an occluder clears; the user accepted it.

## Editing

`cut.py` cuts from `storyboard.json`, and this kind of film has no script or storyboard JSON. 狐月 uses a cut list, `docs/cut.tsv`, one segment per row: shot, in point, out point, note. A shot can have several rows: s13 uses only 0–2.0 and 5.0–6.0 seconds, cutting out the courtyard Grok jumped to in between. The script `works/狐月/docs/hy_cut.py` cuts by the list at original speed, scales and crops everything to 1920×1080, and fades out over the last 0.5 seconds.

## Tried and rejected

| Approach | Result |
|---|---|
| 7 vertical shots, action written as "unhurried and flowing" | The subject turns and spreads her sleeves on the spot. The user: "like spinning on the spot", "no transitions at all" |
| Transformations as hard cuts: the previous shot fills the frame, the next first frame shows the new form | The user: "we agreed to use camera moves, to show off — where is it?" |
| Keyframe transformation with the moon in the centre of the middle frame and the subject already past the middle in the first frame | The fox turned round and flew backwards |
| Writing "spins" for the person | The far side was a front too, so the body had two fronts |

## Not tested

- Ordinary seams (not keyframe) where the next first frame is drawn as a handover frame with the occluder clearing. On 狐月 all ordinary seams cut straight from a filled frame.
- Keyframe transformations of 10 or 15 seconds.
- A vertical 9:16 showcase. The vertical version of 狐月 was made in the wrong direction and is no basis for comparison.
