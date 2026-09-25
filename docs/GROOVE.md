# Groove

How locked in the player is, shown by the room rather than told by a meter. Every
flawless task — every beat of a response judged Perfect — steps a level-local state up;
any other scored task steps it down; the scene reads the state and the judge, the scorer,
the stars, the hearts and the curve never do. It is not a combo, a multiplier, a currency
or a difficulty, and nothing on screen counts it.

## The shape

```
showResult            PlayScene           one scored task's verdict → advanceGroove
  game/groove.ts      pure                the state: level 0–3, the counts, mastery
  ui/groove.ts        pure f(t)           the room's pose, the beat's breath, the mastery payoff
  ui/grooveStage.ts   Phaser              one warm Image, one brass stroke on the block
  audio/grooveSounds.ts                   three synthesized accents, on grid times
  playAnalytics.ts    LevelRun.groove / finish(..., mastered)
```

`tests/groove.test.ts` reads the sources of the judge, the scorer, the scheduler, the
curve, the music system, the save and the hearts and fails if any of them so much as names
groove; it also checks the scene moves the state from `showResult` alone, after the
introduction's early return, and that a restart resets it and shutdown destroys it.

## The rules

| Scored task | Level |
| --- | --- |
| flawless | +1, capped at 3 |
| not flawless | −1, floored at 0 |

There is no "very poor" step: the scorer has no such verdict and none is invented. Level
3 with a slip is level 2, then 1, then 0 — momentum lost, not a punishment, and nothing is
said about it. `GROOVE_START` is assigned on every `startRound`, so a restart, a retry,
Resume and a new level all start cold. Nothing is stored.

Only scored tasks move it. The first-run pass never reaches `showResult`; a finer grid's
introduction returns from it before the state is touched; the breather is a lead-in, not a
task. Level 1 is the existing flawless flourish — the word, the sweep, the socket glints —
and adds nothing.

## What the room does

Everything is `f(t)` from the audio clock, blended over `GROOVE_POSE.blend` (0.7 s) when
the level changes, and the numbers are in `ui/groove.ts`, not the scene.

**Level 2.** A warm pool of light (`FxKey.glow`, the workshop's sun leaning toward the
coral) comes up behind the act, just over its backdrop and under everything in it. The
block's face takes a brass edge: a line on its outline and a lighter one inside it, never
a tint over the sockets. The room breathes with the bar — the pool swells by about 1.2%
on a beat, fully on beat 1 and about half as much on 2–4 — from the running plan's own
demonstration downbeat, which is a bar line, so beat 1 is the level's beat 1. Perfect
sparks pick up a few more and the sun among their colours. A flawless task's handover to
the next puts a soft shaker on the downbeat the next count-in starts on.

**Level 3.** The pool is stronger and warmer, the rim brighter, the breath about 2%.
A Perfect hit flares the pool for under a beat. A flawless coda takes a warm chime on its
contact as well as the shaker. Nothing new appears on the block: it stays the clearest
thing on screen.

No camera moves. Nothing flashes full-screen. The pool never exceeds 0.8 before the
stage's own gain, and every pose is continuous across the beat, so the room never jumps.

## The accents

Synthesized on the shared context, once per scene entry, and played through
`playStinger` like the finale's fanfare — the same bus, so mute, `cancel()` and a restart
stop them. They land on times the level already has: a coda's contact, the next task's
downbeat, the result. None is on a beat the player is copying, none moves a cue, and the
shaker is shorter than a beat at the fastest tempo so it cannot reach the next count.

## Mastery

`isMastered(state, taskCount, cleared)`: every one of the level's scored tasks was
flawless and the level was cleared. The count is checked as well as the flag, so a pass cut
short cannot be mastered on the tasks it happened to play, and a failed level cannot be
mastered at all. It changes nothing: not a star, not a threshold, not a heart, not an
unlock.

On the result, the medals land as they always have. After the third medal's chorus has had
its moment (`MASTERY.delay`, 1.35 s) a brass ring opens behind the plaque, the medals glint
together once, the plaque takes a small knock, a short warm chord sounds, sparks leave the
plaque's middle, and a brass plate arrives under it reading **IN THE POCKET** — a row in
`planResult`, after a finale's card and before a keepsake's, so it stands on the frame like
the other rows. No fourth star, no second score, no medal, no modal.

On a cleared finale the order is: medals → ribbon and its card → mastery → keepsake.
Area complete is the bigger thing and goes first; mastery follows at
`MASTERY.finaleDelay` (1.9 s) as the smaller supporting one, and never crosses the ribbon.
A keepsake earned by the same clear waits `MASTERY.keepsakeLag` behind the label.

## Reduced motion

The pool and the rim hold their level's value and nothing breathes, flares or blends; the
accents still play; the mastery ring is a static fade, the medals do not glint, the plaque
does not knock, and the label is simply there. A player with the setting on still sees the
room warm, the brass come up and the plate arrive.

## Analytics

Two events, on the gameplay bus: `groove_reached` the first time a run reaches 2 and the
first time it reaches 3 (`LevelRun.groove`, once each per attempt however many climbs),
with the scored task that reached it; and `level_mastered` once beside `level_completed`.
Nothing hit by hit.

## For an act

`Vignette.onGroove?(level, now)` is optional and called only on a change. An act that
implements it adds a reaction of its own — the DJ booth's lights, the doorbell's porch
light, the snare's shell — on top of the generic treatment, and must consume nothing of
its subject and move no cue. No act implements it yet, and none needs to.

## Manual QA on Android

Level 1 should feel exactly like the flawless flourish did. Two flawless tasks: the room
warms and the block's edge catches the light, noticeable if you are looking. Three: plainly
lit, breathing with the bar, a chime on the coda, without the block becoming harder to
read or the beat harder to hear. A slip from 3 settles to 2 without a word. A flawless
level gets the ring, the glint and the plate; on level 10 the ribbon comes first and the
plate reads as the smaller thing. Reduced motion stays comfortable. Restart, the map puck,
a pause and a new level all start the room cold. Frame rate on a low-end handset should
be what it was: the treatment is one quad and one stroke.
