# Design gaps on record

Found by the design audit of October 2026 and **not changed**, because each is a decision
about the game rather than a defect in it, or needs a device. The defects the same audit
found were fixed (the ice cream's shelf, two middle endings without a voice, the light
switch under reduced motion, "Miss" for an extra tap, the click under the plaque, the map's
unnamed pucks, the refill ledger on reset; see the commit history). This page is where the
rest wait, so they are not found twice.

## Decisions

- **Two demonstration styles.** Eleven acts preview the action on a copy that snaps back at
  the handover; the rest draw only judged hits. Nothing is consumed either way. See
  `docs/VISUAL_POLISH.md`, "Two demonstration styles".
- **The first eight acts hold one beat.** Every later act holds five and tests that its coda
  fits. `tests/earlyCodas.test.ts` reports the eight against the 150 BPM ceiling: seven
  outrun the table's slide (0.4 s after the contact) and the saw and the tomato outrun the
  next task's downbeat (1.2 s). Growing the hold changes every level's length.
- **The content horizon.** The curve's last change is the clear bar at level 111; the last
  new rhythm is the sixteenth at 59 (met on 72); the last new area look is Art Deco, to
  140; the last act debuts at 171 and the last keepsake sits at 207. Past 207 nothing new
  arrives, and the signpost still reads "More road opens as you play". Live achievements
  stop at level 100; thirty more wait in the Console's import ZIP (`docs/ACHIEVEMENTS.md`).
- **Endless draws on acts 1–28.** Rules v1 pinned the pool; acts 29–36 never appear in
  Endless until a v2 ruleset and leaderboard (`docs/ENDLESS_MODE.md`).
- **Endless parity.** No pause or resume (an interruption invalidates the run), one pointer,
  no groove, no timing details on its plaque though the counts are collected, and no sign of
  how far a life has been earned back. Most of it is bound to rules v1.
- **No level preview on the map.** A tap on a stop starts the level; nothing shows the act,
  tempo, tier, best or clear bar first, and the clear bar is never shown before or during a
  level — only on the result. Endless shows its bar live.
- **Rewarded ads are offered unasked.** No screen reads `rewardedAvailable()`, so on a
  device without ads the primary *Watch ad* action can only fail; the failure shows a line
  of feedback, so the player is not stuck.
- **Pause** is reached only by the map puck's first tap or Android's back; the pause screen
  stops the music outright and does not say which task resumes.
- **Settings** have no in-game reduced-motion switch, no way to keep the pulse ball on, no
  metronome volume (it rides the music bus), no text size. Every word is rasterised in the
  canvas, so the OS font size and TalkBack have no effect.
- **What is device-local.** The Endless record, the objectives' stamps, the gate-tap record
  and the hints' flags travel in no save code and no cloud save. Reset keeps the stamps.
- **`tests/fixtures/levels-choreography.json` pins levels 1–120** while debuts run to 171
  and keepsakes to 207.
- **The window's subject size** sits above the band and **the curl's height** at its top:
  "left for Dor" in `docs/STAGING.md`.

## Device work outstanding

- Acts 26–36 have not been seen on a handset, per their own docs: barber, popcorn and
  toothbrush, the prospector, the ice cream, the frog and the glasses, the camera.
- The staging audit's sizes for acts 33–36 (`docs/STAGING.md`).
- Real multitouch, Android audio latency on each route, and OS reduced-motion behaviour
  (`docs/VISUAL_POLISH.md`, "Remaining device QA").
