> Translated from [references/zh/one-take.md](../zh/one-take.md), which is the source of truth.

# One take: introduce each person, then pull out to a wide shot

This page covers one camera move. A single continuous shot introduces several people one by one and ends on a wide shot. It comes from 夜馆 (10-11), made with Grok's keyframe mode. The final cut is `works/夜馆/成片/夜馆.mp4`: 16.5 seconds, 1080p. The user approved the camera move.

For a one take (一镜到底), the user wants **no visible transitions**. No dissolves. No blurred transitions. No hard cuts that join several pieces. The audience must feel that only one camera is moving.

Faces in the final wide shot still drift off-model. This problem is not solved yet; see the last section.

## When to use it

- Group introductions: a gang, a team, a family. Each person gets a 2–3 second close shot, and the shot ends on a group-photo wide shot.
- No dialogue. This shot works through camera movement and expressions. Dialogue distracts Grok.
- 3 to 5 people (a cat or a dog counts as one). More people give Grok more chances to draw something wrong midway.

## Shot structure

The reference clip is a 15-second group introduction with no cuts (the user provided it on 10-11). This is how it works:

1. **One person owns the frame.** Focus and the main subject stay on this person. The previous person stays in the background, out of focus. They do not disappear. "Only one person may be in the frame" is a misreading.
2. **A foreground wipe changes the person.** The next person's shoulder, or the prop in her hand, sweeps in from the edge of the frame into the near foreground and almost fills the frame. The camera slides past close to her, and focus passes to her. This sweep is the transition.
3. **The prop leads.** The prop enters the frame first, and the person follows. In 夜馆 the props are a lock pick, a tablet, and the wine-red cushion that the bodyguard holds.
4. **Pull out at the end.** The camera moves back diagonally, rises, and returns to the centre line. It ends on a frontal wide shot and holds still for about the last second.
5. **The tilt straightens out.** The first half is tilted. The second half levels out.

Each person stands on a fixed mark the whole time. Nobody walks or turns around. All movement in the frame comes from the camera.

## Step 1: Design the keyframes

Make one keyframe per person, plus one wide shot. 夜馆 used 5 (`works/夜馆/frames/E03-01/k1`–`k5`):

| Keyframe | Picture | Tilt |
|---|---|---|
| k1 | First person, medium shot, alone | 8° |
| k2 | Second person, extreme close-up, sharp; first person behind at right, out of focus | 6° |
| k3 | Third person, close shot, sharp; second person behind, out of focus | 4° |
| k4 | Fourth (the cat), close shot; the bodyguard's cushion reaches in from the top edge and leads; the third person's profile soft at the edge | 2° |
| k5 | Everyone, frontal wide shot | 0° |

Key points:

- **Every keyframe is a handover frame.** The new main person is in front and sharp. The previous person is behind and out of focus. Between two neighbouring keyframes, the people's positions connect. This lets Grok join them with a camera move. With only clean single-person images, Grok finds no spatial link and joins them with a dissolve (first keyframe version of 夜馆, at 7.4 seconds).
- **Attach the matching character sheets and the scene sheet when you draw.** Use `frames.mjs fix --raw`. For each keyframe, attach the character sheets of the people in it, then the scene sheet.
- **Add the tilt after drawing.** The image service cannot draw a tilted composition. Rotate the image with a script after drawing. Then enlarge it a little to crop off the black corners.
- **Do not blur the people in the background.** Grok recognizes a sharp face. It does not recognize a blurred one. Leave sharp and soft to the focus changes in the prompt.
- **Compare every face in every keyframe with the character sheets**, including each person in the wide shot k5. In 夜馆 nobody checked k5. The faces in the final wide shot drifted, and we could not tell whether k5 itself was off or Grok drew them wrong.

## Step 2: Write the prompt

Write the one-take prompt **by hand**. Do not generate it with `video-prompts.mjs`. The generator is built for one camera move per shot. When the storyboard says `Tracking Shot`, it adds tracking sentences such as "followed from behind" and "speed matches the character's pace". Grok reads them and makes the people walk (this happened twice on 夜馆). If you still drafted with the generator, search for 跟拍 (tracking) and 步速 (pace) before you submit, and delete those sentences.

Order: the style header first. Then "never dissolve" and "people do not move". Then one segment per time range, in seconds. Then the English summary and the sound. The full prompt used for 夜馆 is in `works/夜馆/_chain/E03-v1-cat.txt`. Its structure is below.

The template is shown as used in a Chinese work. The Chinese lines are pasted into Grok as they are.

```text
[Style header: Photorealistic live-action … no animation.]
单一连续镜头，一镜到底：只有一台摄影机在展厅里连续移动，绝不叠化、绝不淡入淡出、绝不剪切、绝不画面融合。
所有人站在固定点位上，脚不动、不走，只转头、转眼、做手上的小动作；一切位移都来自摄影机。
每次换人：下一个人的肩膀或手里的东西先从画面边缘扫进近前景、几乎挡住画面，摄影机贴着她滑过去，焦点快速而平滑地交给她，上一个人留在后景变虚。
0–2 秒：[first person]中景，画面倾斜，[expression]；摄影机向左弧形侧移并轻微后退。
2–4.5 秒：[second person's prop and hand]先扫进左侧近前景，摄影机贴着她的脸侧滑过，她成为大特写，[expression]；[first person]在右后方变虚。
……（每人一段）
9–15 秒：摄影机连续斜向后撤并轻微升高，到中轴线上拉成正面全景，全部清楚；约 14 秒减速停住，稳定停留最后一秒。
Camera: one unbroken Steadicam take. Never dissolve, never cross-fade, never cut. Each handover is a foreground wipe by the next person's shoulder or prop, then a fast rack focus.
环境：[ambient sound]，没有脚步声。无对白、无人声、无背景音乐、无字幕；画面里没有任何文字。
```

Writing rules (all tested on 夜馆):

- **Make the camera the subject.** Write "the camera grazes past her shoulder". Do not write "her shoulder sweeps through the foreground". With a person as the subject, Grok makes the person walk.
- **Do not write "turns around".** Write only head turns, eye movements and small hand actions. A turn becomes a step.
- **Do not write footsteps or heel clicks.** State "no footsteps". Writing footsteps asks for walking.
- **Refer to people with short appearance phrases** (盘发女人 "the woman with the hair bun", 耳麦女人 "the woman with the earpiece"). The keyframes already show their looks. A long phrase repeated a dozen times drowns out the "do not move" sentence.
- **Write the cat as "loafed, all four paws tucked in".** This keeps it from getting up and walking better than "crouching" does.

## Step 3: Generate on Grok

Keyframe mode, as of the 10-11 interface:

1. Open Imagine. Click the "+" to the left of the input box and choose keyframes. The interface has three slots: first frame, middle frame, last frame.
2. Upload in order: k1 as the first frame, one middle frame, k5 as the last frame. JPGs of about 300–450 KB.
3. **Only one middle frame fits.** It sits at its default position (about second 7.3 in a 15-second video). Dragging a thumbnail scrambles the order of the whole set. Do not drag.
4. Choose 15 seconds (the 15-second option exists from 10-11). The highest resolution is 720p.
5. Paste the prompt. Check with a script that the character count in the input box matches the file. Then submit. A 15-second video takes about 3–4 minutes.

Which keyframe to use as the middle frame:

| Middle frame | Result in 夜馆 |
|---|---|
| Cat k4 (version A) | All positions right; about 0.3 seconds of dissolve from the technician to the cat |
| Technician k3 (version B) | No dissolve at all; but an extra lock-picker appears in the background |

Grok must draw a person without a keyframe on its own, so that person goes wrong most often. Put the middle frame on the **hardest** handover. That is usually the change from a person to an animal, or to the person who stands farthest away.

## Step 4: Check frame by frame

- **Dissolves**: grab a frame every 0.125 seconds and lay them out as a contact sheet. At each handover, look for two faces on top of each other. Thumbnails miss light dissolves. View suspect frames at full size.
- **Walking**: check whether anyone's feet leave their mark.
- **Head count**: check for an extra person in the background, or the same person appearing twice.
- **Faces**: compare each person with the character sheet, not with the keyframe.

## Step 5: Fix a dissolve (continuation)

When there is only one dissolve, do not regenerate the whole video. Each regeneration brings new problems and can ruin the parts that were right. Regenerate only the part after the dissolve:

1. Before the dissolve starts, find a frame where the camera is almost still. View it at full size. Check that it has no ghost of the next person.
2. Use this frame as the first frame and the original last frame (the wide shot) as the last frame. Generate 10 seconds in keyframe mode. The prompt covers only the remaining segments.
3. Trim the original video to just before this frame. Join the new video with a hard join. Do not reuse frame 0 of the new video.
4. Zoom in and compare the two frames on either side of the join. Pose, position and light must connect.

How 夜馆 was joined: version A kept its first 6.46 seconds, up to the technician pressing her earpiece with a cold look. That frame and k5 generated the second half. The prompt is in `works/夜馆/_chain/E03-part2.txt`. At the join, the technician lowers her eyes once. This is the only trace, and the user accepted it.

## Step 6: Upscale to 1080p

On each video's page, click "Upscale → 1080p" (升级). It takes about 30 seconds. It adds a file `generated_video_1080_hd.mp4` at 1904×1072.

- Upscaling only enlarges the picture. It does not regenerate. Frame count, motion and composition are identical to the 720p original. So cut points set on the 720p video work unchanged on the 1080p one.
- Finish the 720p version first. Upscale only after it is final. Each video then costs only one extra upscale.
- When you join the videos, scale them all to 1920×1080.

## Approaches we tried and rejected

| Approach | Result |
|---|---|
| Put everyone in the first frame (background out of focus) and let Grok do it in one video | Every frame showed several people; in the second half the people walked on their own |
| Shoot one person per segment, join four segments behind stone pillars, add blur transitions | User: 「两版都有过渡的效果，不符合一镜到底」 ("Both versions have a transition effect. That isn't one take.") |
| Attach only clean single-person keyframes | Dissolves at the handovers |
| Chain segments, using the last frame of one as the first frame of the next | The next person's face changed midway |
| Push in from the wide-shot first frame, then reverse it for a pull-out ending | The first try kept the faces; the second changed more of them. The cause is unclear, so this is not a rule |
| Speed changes, face swaps, or digital zoom for a dolly zoom in post | All rejected. User: speed changes 「总是会带来其它问题」 ("always bring other problems"), face swaps 「不行」 ("no"), the zoom 「整体看就不协调」 ("looks off as a whole") |

Conclusion: **solve problems at generation. Do not patch Grok's footage with post effects.**

## Unsolved: faces in the wide shot

As the camera pulls out, faces get small, about 60–120 pixels tall. Grok redraws them. The last frame locks the composition, not the faces. At the end of 夜馆, the lock-picker had short hair and no longer looked like herself.

Next time, try these at the design stage (none tested yet):

- **Check k5 after drawing.** Compare every face in k5 with the character sheets before you generate video.
- **Keep each person in the frame from their own keyframe on.** The reference clip does this: nobody re-enters from off-screen at the end. Grok must redraw anyone who enters from off-screen.
- **Stop the wide shot closer.** Make each face at least about 150 pixels tall in the final wide shot. For example, pull out to a knee-up shot, not a full-body shot.
- **"@ reference image" in Grok's input box**: not properly tested this time. We do not know whether it locks faces.

## Untested

- The "Extend" button (扩展). The name suggests it continues from the last frame. Not clicked yet.
- Keyframe mode for 9:16 vertical video.
