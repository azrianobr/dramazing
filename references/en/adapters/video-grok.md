> Translated from [references/zh/adapters/video-grok.md](../../zh/adapters/video-grok.md), which is the source of truth.

# Generating video on the Grok website

Video is generated with the video feature (Imagine) of the Grok website, through its normal interface: upload the first frame, paste the prompt, choose the settings, submit, and download with the page's own download button.
This skill includes no browser automation scripts. Follow the Grok / xAI terms of service, and do not use scripts to get around the page's limits, moderation or billing.

## Steps for each shot

1. Open Grok's Imagine page and switch to "Video".
2. Upload the first frame through the upload button of the input box: `frames/<segment ID>/f<N>.png`. Convert a PNG over 2 MB to a JPG of about 400 KB first.
3. Paste the whole `prompt` of this shot from `video/prompts.json` into the input box.
4. Choose the settings:
   - Resolution 1080p.
   - Duration from this shot's `seconds`: 6, 10 or 15 seconds (the 15-second option exists from 10-11).
   - Aspect ratio of the work: 16:9, or 9:16 for vertical works.
5. Submit. A 6-second shot takes about a minute and a half; a 10-second shot takes a little longer.
6. When the video is ready, download it with the page's download button. The file is named after the conversation (`grok-video-<conversation id>.mp4`); take it in with `ingest.sh $W --file <file> E01-03-s1`. Note the shot ID and the conversation id from the address bar when you submit, so the downloads can be matched later.

You can open 2 or 3 tabs in parallel, with one submission at a time per tab.

## Things to know

- **1080p is available only with a first frame alone, no reference images.** With reference images attached, only 720p is left.
- **Do not click "Optimize prompt"** (the wand icon next to the sound button; labelled 优化提示词 in the Chinese UI). It rewrites the whole prompt: it invents props that are not in the first frame, and it turns "performance note, never spoken aloud" into wording the model may read out. If you click it by mistake, click "Restore original prompt" in the same place, then check that the text in the input box matches `prompt`.
- **Keep the sound button on** ("video audio"). With it off, the video has no dialogue.
- **If the upload stalls** (the thumbnail is greyed out and the send button does not respond), refresh the page and upload again. After a reconnect, an extra image may appear in the input box and the resolution drops to 720p; again, refresh and upload only one image.
- **One submission may produce two videos.** The page has no setting for the number. When there is a second one, note it as a spare; for rework, check the spare first.
- **Downloads are 1920×1088.** "Upscale" gives 1904×1072. The editing scripts scale and crop everything to the work's canvas (1920×1080 for 16:9), so no manual work is needed. Vertical download sizes have not been measured yet.
- **If a submission never produces a video and shows no error,** the first frame was most likely blocked by moderation, usually because a character looks like a minor. Do not resubmit in different ways to get around moderation. First find what is wrong with the first frame (childlike look, expression, freckles), redraw it following `prompt-rules.md`, and tell the user.
- **"No text of any kind" does not stop burned-in subtitles.** In a shot with dialogue, Grok sometimes burns the line into the picture as a subtitle (加油 E01-04/s6). When you ingest, look at the bottom third of every video. To avoid generating again, cover it with a gradient patch made from clean frames before and after the subtitle; make the patch about 20 pixels larger on each side so it hides the edge of the subtitle box. Keep a copy of the original. Grok ignores this sentence most often when it sits at the end of the prompt: for shots with dialogue, `video-prompts.mjs` now puts it first in Grok prompts (clean in both samples, 各论各的 and 真的). If you rewrite a prompt by hand, keep it at the front.

## Keyframe mode and upscaling

- **Keyframe mode**: click the "+" to the left of the input box and choose keyframes. It has three slots: first frame, middle frame, last frame. The middle frame sits at its default position. Dragging a thumbnail scrambles the order of the whole set. The highest resolution is 720p. The last frame locks the composition, not the faces. See `one-take.md` (夜馆) for how to use it.
- **"Upscale → 1080p"** (升级): the "Upscale" menu on the video page. It takes about 30 seconds and adds a file `generated_video_1080_hd.mp4` (1904×1072). It only enlarges the picture. Frame count and motion stay the same, so cut points set on the 720p video work unchanged. For keyframe-mode videos, finish the 720p version first and upscale only after it is final.
- **"Extend"** (扩展): not tested.

## Stalled downloads

The download button spins, nothing lands after several minutes, or a 0-byte file lands: the page is waiting on Grok's file server, and more clicks only open more stalled requests. What worked in practice (remake of 渡口 episode 1):

1. Keep only one Grok page playing while you download: pause the playing video in every other tab. The Imagine home page autoplays sample videos; keep it closed while downloading.
2. Click download once and check that the button starts spinning. If it does not, the click did not register; click again.
3. Once it spins, wait 5 to 8 minutes. If nothing has landed, reload this page, pause the video and click again. After a reload the download often finishes at once.
4. Move a 0-byte file away before downloading again, or the next file lands with a `(1)` name.
5. The button does nothing at all (no spinner, nothing lands; 各论各的 E01-01/s1 rework): fetch the video from a script in that page. Read the `<video>` element's address, `fetch` it with credentials, and save it as a download named with the shot number (`grok-E01-01-s1.mp4`) so `ingest.sh` picks it up from the folder. Fetching that address with curl from a terminal returns 403. Check the length with `ffprobe` afterwards.
   - Give the file name a prefix for this batch (such as `zd1011b-E01-01-s1.mp4`) and change it for each batch. The download folder may hold an old file with the same name from another work; `ingest.sh` moves files, so picking up the wrong one overwrites the old file (真的).
6. The script's `fetch` never returns: switch to another tab that has Grok open and `fetch` the same video address there. This happened 3 times on 真的; each time the other tab downloaded it at once.
7. Switching tabs, reloading and the download button all fail, and even old videos that downloaded before will not come down: hung requests have used up the browser's connections to Grok's file server. Each parallel retry hangs a few more, so it gets worse (光坐着 E01-02/s7: seven or eight requests hung across two tabs). In this order:
   1. Navigate the other Grok tab to a different page; its hung requests are dropped.
   2. Reload the current page and remove the source of every `<video>` on it, so the players stop streaming.
   3. Wait about 30 seconds without sending anything.
   4. Send one `fetch`. Before `.blob()`, store the status code and `content-length` in a page variable, so you can tell "no response at all" from "the data stopped halfway".
   5. Download one video at a time, never in parallel.

   After this, both videos downloaded at the first try. If one request still has no response after 90 seconds, the problem is on Grok's side: stop and try again a few minutes later.

## Recording usage

Grok's usage page (in the settings of the Imagine page) shows the percentage of this week's quota. Read it at three points:

1. Before the trial shot.
2. After the batch.
3. After rework.

Each time, append a line to `_logs/usage.tsv`:

```
time	event	ep	Imagine%	total%	note
2026-10-05T07:30	before batch	E05	0	0	weekly quota just reset
```

Subtract the readings to get this episode's video usage. For reference: about 0.2% to 0.3% per shot (10-second shots cost more), about 7% to 12% for an episode of 30 to 35 shots. Remake of 渡口 episode 1: 39 submissions (12 of them 10 s) used 7%.
