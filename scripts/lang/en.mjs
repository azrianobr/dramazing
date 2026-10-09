// Language pack for English stories: rules for reading the storyboard text, and the fixed sentences
// written into video prompts and image briefs. Same structure as zh.mjs (the measured original).
// Not yet trial-tested on a video model: see references/en/workflow.md, "Story language".

const w = (re) => new RegExp(`\\b(?:${re})\\b`, 'i');

export default {
  /* ---------- reading the storyboard ---------- */
  clause: /[,;]|\.(?:\s|$)/, // split the first-frame description into clauses
  comma: /,/,
  sit: w('sits?|sitting|seated'),
  back: /back to (?:the )?camera|from behind|seen from the back|back turned|turned away|walks? away from (?:the )?camera|walking away from (?:the )?camera/i,
  negate: w('no|nobody|not|without'), // "no one with their back to camera" is not a back view
  rise: w('stands? up|rises?|gets? up|to (?:his|her|their) feet'),
  turn: w('turns? (?:around|back)|looks? back'),
  run: w('runs?|running|rushes|rushing|chases?|chasing|sprints?|sprinting'),
  slowmo: /slow[ -]?motion/i,
  hand: w('hands?|thumbs?|fingers?|fingertips?|palms?'),
  face: w('face|eyes?|mouth|lips|brows?|hair|profile'),
  wholeFace: w('face|profile'), // the whole face in frame (an extreme close-up shows one detail; see validate)
  side: /frame (?:left|right)|(?:left|right) of (?:the )?frame/i,
  noEye: /^(none|no face|-|)$/i,
  toneAction: w('wipes?|pats?|grabs?|holds?|puts? down|stands? up|sits? down|turns?|walks?'),
  young: w('young|girl|teen(?:ager)?|student|maiden'),
  adult: w('adult|grown|in (?:her|his|their) (?:twenties|thirties)'),
  dashIsError: false, // dashes become commas in the prompt; only a warning
  shortName: (alias) => alias.trim().split(/\s+/).pop(),
  isLeft: (d) => /^left$/i.test(d ?? ''),
  isDown: (d) => /^down$/i.test(d ?? ''),
  isFront: (d) => /front|ahead/i.test(d ?? ''),
  isBehind: (d) => /behind|back/i.test(d ?? ''),
  levels: { calm: 'restrained', doc: 'documentary', intense: 'intense' },
  dirHint: 'behind / front / left / right',

  /* ---------- sentences for the video model ---------- */
  sizes: { 'extreme-wide': 'extreme wide shot', wide: 'wide shot', full: 'full shot', medium: 'medium shot', 'medium-close': 'medium close-up', close: 'close-up', 'extreme-close': 'extreme close-up' },
  join: ', ',
  sentence: (t) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`),
  eye: (t) => ` Eyeline: ${t.replace(/\.$/, '')}.`,
  offscreen: (side) => (side ? `off-screen, ${side}` : 'off-screen'),
  aim: (t) => `camera aimed at ${t}`,
  limit: {
    hands: 'only hands, sleeves and props in the frame; the owner of the hands stays off-screen, no face, hair or body is ever visible',
    only: (t) => `only ${t} in the frame; no face or head is ever visible`,
    sits: (x) => `${x} stays seated and never stands up`,
    back: (x) => `${x} keeps their back to the camera the whole time, never turns around or looks back`,
    mute: (x) => `${x} does not speak; their mouth stays still`,
    talk: (x) => `${x} opens their mouth from the very first word, lips moving with every word; not a voiceover`,
    still: 'the camera does not move',
    sameCast: 'the number of people stays the same; costumes, hair and the set match the first frame',
    oneTake: 'one continuous shot with no cuts, no jumps, no change of camera position, consistent screen direction',
    screen: 'the screen stays a plain flat grey panel showing nothing; all four edges of it stay fully in frame and are never covered by hands or bodies',
    phase2: 'the camera stops moving once phase two begins',
  },
  solo: (l) => !l.startsWith('this is the only camera move') && !/^the camera (?:position stays fixed|and framing stay still)/.test(l),
  twoPhase: (a, trigger, b) => `Phase one: ${a.replace(/\.$/, '')}. When ${trigger ?? 'phase one is complete'}, phase two: ${b} The two phases happen one after the other, never at the same time.`,
  handFeel: { restrained: 'only a slight breathing drift and footstep bob', documentary: 'documentary style, framing adjusts to the action as it happens', intense: 'noticeable chasing shake' },
  moves: {
    'Push In': (m) => ({
      text: `The camera ${m.speed ?? 'slowly and steadily'} dollies forward${m.from || m.to ? `, from ${m.from ?? 'the first-frame composition'} to ${m.to ?? 'one size closer'}` : ''}; the focal length stays the same and the background shows natural parallax${m.stop ? `; it stops when ${m.stop}` : '; the push is small and stops once in place'}.`,
      limits: ['focal length unchanged, no zoom', 'this is the only camera move: no orbit, no pan'] }),
    'Pull Out': (m) => ({
      text: `The camera ${m.speed ?? 'slowly and steadily'} dollies backward${m.from || m.to ? `, from ${m.from ?? 'the first-frame composition'} to ${m.to ?? 'one size wider'}` : ''}${m.target ? `, keeping ${m.target} in the center of the frame` : ''}${m.stop ? `; it stops when ${m.stop}` : '; it stops once in place'}.`,
      limits: ['focal length unchanged, no zoom', 'this is the only camera move: no orbit, no pan'] }),
    'Pan': (m) => ({
      text: `The camera stays in place and ${m.speed ?? 'slowly'} pans ${m.dir ?? 'right'}${m.from ? `, starting on ${m.from}` : ''}${m.to ? `, and stops on ${m.to}` : ', stopping once in place'}.`,
      limits: ['the camera position stays fixed; it only rotates horizontally'] }),
    'Tilt': (m) => ({
      text: `The camera stays in place and ${m.speed ?? 'slowly'} tilts ${m.dir ?? 'up'}${m.from ? `, starting on ${m.from}` : ''}${m.to ? `, and stops on ${m.to}` : ', stopping once in place'}.`,
      limits: ['the camera position stays fixed; it only rotates vertically'] }),
    'Rack Focus': (m) => ({
      text: `Shallow depth of field. Focus starts on ${m.from ?? 'the foreground'}, then ${m.speed ?? 'slowly'} shifts to ${m.to ?? 'the background'}: ${m.from ?? 'the foreground'} softens and ${m.to ?? 'the background'} sharpens${m.stop ? `, completing when ${m.stop}` : ''}.`,
      limits: ['the camera and framing stay still; only the focus changes'] }),
    'Tracking Shot': (m, { front }) => {
      const t = m.target ?? 'the character', d = m.distance ? ` about ${m.distance} away` : '';
      return {
        text: `${front ? `The camera moves backward ahead of ${t}${d} as ${t} walks toward it, matching their pace` : `The camera follows ${t} from ${m.dir ?? 'the side'}${d}, matching their pace`}; the distance and their size in frame stay the same; stabilized, with natural inertia, no floating${m.stop ? `; both stop when ${m.stop}` : ''}.`,
        limits: [front ? 'the camera stays ahead of the character, who never walks into the lens' : 'the following distance stays constant; the camera never overtakes the character'] };
    },
    'Handheld': (m, { level, intense, feel }) => ({
      text: `${level[0].toUpperCase()}${level.slice(1)} handheld camera, ${feel}; the character stays clearly readable${m.dir ? `; the camera follows ${m.target ?? 'the character'} from ${m.dir}${m.distance ? ` about ${m.distance} away` : ''}` : '; the camera position barely changes'}${m.stop ? `; it stops when ${m.stop}` : ''}.`,
      limits: intense ? ['no sudden zoom'] : ['no violent random shake, no sudden zoom'] }),
    'Crane': (m, { down }) => ({
      text: `Crane shot: the camera ${m.speed ?? 'slowly and steadily'} ${down ? 'descends forward' : 'rises up and back'} along a gentle arc${m.from || m.to ? `, from ${m.from ?? 'the first-frame composition'} to ${m.to ?? (down ? 'close to the character' : 'a high wide view')}` : ''}${m.target ? `, keeping ${m.target} ${down ? 'in the center' : 'in the lower center'} of the frame` : ''}${m.stop ? `; it stops when ${m.stop}` : '; it stops once in place'}.`,
      limits: ['steady, weighty, continuous motion, not a fast drone flight', 'focal length unchanged, no orbit'] }),
    'POV': (m, { owner, down }) => ({
      text: `First-person point of view at an eye height of about ${m.height ?? '1.6 m'}, seen through the eyes of ${owner ?? 'the character'}${m.from ? `; first looking at ${m.from}` : ''}${m.to ? `, then ${down ? 'looking down' : 'turning'} to ${m.to}` : ''}${m.stop ? `; it stops when ${m.stop}` : ''}; restrained movement, only a slight breathing rise and fall.`,
      limits: [`${owner ?? 'the viewer'}'s face and full body are never seen; only their hands and sleeves may appear at the bottom of the frame`] }),
  },
  body: {
    head: (s) => `Shot ${s.key} | ${s.seconds} s | ${s.size}${s.scene ? ` | ${s.scene}` : ''}.`,
    rig: (t) => `Camera setup: ${t}.`,
    action: 'Action: ',
    move: 'Camera move: ',
    ambient: 'Ambience: ',
    limits: (ls) => `Key constraints: ${ls.map((l) => l.replace(/\.$/, '')).join('; ')}.`,
  },

  /* ---------- sentences for the image tool ---------- */
  img: {
    // aspect follows the use: frames use the work's aspect, sheets are always 16:9
    tail: (ratio, orient) => `${ratio} ${orient}, one complete image only: no text, no watermark, no border.`,
    scene: (name, light) => `setting sheet for the location "${name}": follow its environment, materials and light${light ? ` (light at this moment: ${light})` : ''}`,
    char: (name) => `character sheet for ${name}: follow the face, hair and costume`,
    prop: (name) => `prop sheet for "${name}": follow its shape and materials`,
    first: 'first storyboard frame of this segment: keep the light, haze and positions continuous with it',
    ref: (i, role) => `Reference ${i} = ${role}`,
    frame: (t) => `Frame: ${t}`,
    // the "where the frame cuts" column of the shot-size table, placed before "Frame:" so the tool does not guess the shot size
    size: (name, key) => `Shot size: ${name}, ${{ 'extreme-wide': 'the whole place in frame, people only specks or absent', wide: 'the person together with a large part of the surroundings', full: 'the person head to feet, with room ahead in the direction of movement', medium: 'the person from the waist up', 'medium-close': 'the person from the chest up; hands enter only when raised to the chest', close: 'one face from forehead to chin filling the frame, or one prop filling the frame', 'extreme-close': 'only one detail in frame, such as one eye, one finger or one clasp' }[key]}.`,
    angle: (a) => `Camera angle: ${a}.`,
    original: 'the original image: this is the one to change',
    fix: (t) => `Change only: ${t}\nKeep the person's identity, composition, lighting and clothing exactly as in the original; change only this one thing.`,
    // camera-angle grid (frames.mjs grid): one scene with camera height and shot size varied in one image; cells are small, for choosing angles only
    gridRows: ['eye level', 'low angle looking up', 'high angle looking down'],
    gridCols: ['wide (the person in relation to the space)', 'medium (posture and action)', 'close-up (face and upper body)', 'extreme close-up (a detail such as the eyes or a hand)'],
    grid: (rows, cols) => `Using reference 1 as the only reference, make a ${rows.length * cols.length}-panel shot matrix of the same scene, in a clear grid of ${rows.length} rows and ${cols.length} columns. Keep the subject (the same person in the same clothes), the setting, light direction, time of day, mood and colour exactly as in reference 1. Do not redesign the scene and add no props, people, actions or story beats; between panels only the camera height and the framing distance change. Camera height by row, in order: ${rows.join('; ')}. Shot size by column, in order: ${cols.join('; ')}. Every panel is a complete film still.`,
    gridTail: (ratio, r, c) => `${ratio} landscape, one image with ${r} rows and ${c} columns, panels separated by thin white lines; no text, no numbers, no watermark.`,
    codex: (out) => `Use your built-in image generation tool to generate one image directly. Do not write code, call an API or draw with a script. Generate only once. Save the image as ${out} in the current directory (do not overwrite other files), then stop.`,
  },
};
