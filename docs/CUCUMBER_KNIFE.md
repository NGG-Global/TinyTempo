# Knife + Cucumber — implementation and architecture review

A seventh vignette over the existing rhythm engine, added at request. No clock, input,
scheduler or judgement rule changed for it. The entry is appended to the registry, so
levels 1 to 6 keep the vignettes they had and the cucumber is every eighth level from 7 on.

## Visual direction and controls

A cool tiled kitchen: mint-white paper `#f1f5f3` with grey-green grout `#b7c9c4`, a pale
board `#ddd0a8`, a cooler counter wash below. The cucumber skin `#4c8848` is the only
saturated green in frame, which makes it the subject at a glance — away from Window's
glass, Bug's sage and Curl's teal. Its cut face shows pale flesh `#eef6d4`, a gel
`#c5d86a` and pale almond seeds. The cool steel knife has a deep teal handle and a
warm metal collar, matching the banana's chef-knife construction.

Long tonal ridges and restrained pores replace the flat stripes and oval highlight.
The cut face has a rind sidewall and three translucent seed chambers. The finite
end-grain board and knife are shared through `kitchenArt.ts`, with dense slice piles
kept on the board. Knife clearance and the phone-safe stage framing are visual only;
all contacts still land on the original audio-clock beats.

Side view, board horizontal, the cucumber a long stadium left of centre. One tap is one
rocking chop: the tip stays near the board and is the rotation pivot, the heel lifts
between chops and drops, and the edge meeting the board carries the timing. Coins come
off the flower end and lean in a pile to the right as round discs with a seed star. The
demonstration rocks the knife without slicing, so the player starts on the cucumber they
watched. Reduced-motion preference suppresses board press, impact shake and the idle bob.

The coda is an unscored finishing chop that takes the standing heel; it never changes the
result. Strong lays the last coin on an even pile. Rough
squashes the final disc flat.

Chop phases are fractions of a beat (`cucumberTiming(beat)`): the rise back up is 0.36
beat, so the knife is always clear before the next possible hit from 120 to 150 BPM.

## Ownership and timing

- `src/vignettes/cucumberMotion.ts`: presentation-only curves — knife lift and windup,
  stadium clip, cut fraction, slice topple, juice fall — pure and Phaser-free.
- `src/vignettes/CucumberKnifeVignette.ts`: geometry, palette and motion.
- `src/audio/cucumberSounds.ts`: deterministic board knock with a watery crunch, a hollow
  knock for bare board, a trembling ring, a late seed pip, a wet squash.
- `src/vignettes/registry.ts`: one definition, appended. Nothing else in the engine
  changed.

Grading stays outside the vignette: it receives `Judgement` and inspects only `kind` and
`index`; the strong/rough boundary is the level's clear bar (`finishOutcome`, `game/taskVerdict.ts`).

## Verification

`npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass.
`tests/cucumber.test.ts` pins the edge landing exactly at contact, the knife back up
before a half beat at 120, 136 and 150 BPM, the stadium clipped to the left of the cut,
slices advancing on hits only, a heel left for the coda, bounded topple and juice, and
five deterministic bounded sound buffers.
