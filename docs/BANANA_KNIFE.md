# Knife + Banana — implementation and architecture review

An eighth vignette over the existing rhythm engine, added at request. No clock, input,
scheduler or judgement rule changed for it. The entry is appended to the registry, so
levels 1 to 7 keep the vignettes they had and the banana is every eighth level from 8 on.

## Visual direction and controls

A warm cream kitchen: paper `#f7f3e8` with beige grout `#e0d4bc`, a pale board
`#e6d3a4`, a warmer counter wash below. The banana peel `#f3c849` is the only saturated
yellow in frame, which makes it the subject at a glance — away from Hammer's vermilion,
Saw's brass and the tomato's red. Its cut face shows cream flesh `#fff4c4`, pith
`#e8c870` and three locule seed groups `#5a4020`. The cool steel knife has a walnut
handle, a warm metal collar and small inset rivets.

The refined silhouette has a pronounced crescent and continuous peel bands. Concave
contours use Phaser's path triangulation, not a triangle fan across the hollow. The
remaining curved heel settles onto the board, and cut coins have thickness, subtle
fibres and a three-part core. The finite end-grain board and knife are shared with the
cucumber through `kitchenArt.ts`; pile spacing compresses for dense phrases to stay
inside the board. The higher resting knife clears the fruit without changing beat timing.

Side view, board horizontal, the banana a tapered curve with its belly on the board and
the ends lifted. One tap is one rocking chop: the tip stays near the board and is the
rotation pivot, the heel lifts between chops and drops, and the edge meeting the board
carries the timing. Coins come off the tip and flop onto a pile to the right as ovals of
cream. Soft fruit overshoots a little, then settles. The demonstration rocks the knife
without slicing, so the player starts on the banana they watched. Reduced-motion
preference suppresses board press, impact shake and the idle bob.

The coda is an unscored finishing chop that takes the stem; it never changes the result.
Strong lays the last coin on an even pile and lets one speckle drop late. Rough squashes
the final disc flat.

Chop phases are fractions of a beat (`bananaTiming(beat)`): the rise back up is 0.36
beat, so the knife is always clear before the next possible hit from 120 to 150 BPM.

## Ownership and timing

- `src/vignettes/bananaMotion.ts`: presentation-only curves — knife lift and windup,
  banana centreline, cut parameter, slice flop, juice fall — pure and Phaser-free.
- `src/vignettes/BananaKnifeVignette.ts`: geometry, palette and motion.
- `src/audio/bananaSounds.ts`: deterministic dull knock with soft flesh, a hollow knock
  for bare board, a trembling ring, a late flop, a mushy squash.
- `src/vignettes/registry.ts`: one definition, appended. Nothing else in the engine
  changed.

Grading stays outside the vignette: it receives `Judgement` and inspects only `kind` and
`index`; the strong/rough boundary is the level's clear bar (`finishOutcome`, `game/taskVerdict.ts`).

## Verification

`npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass.
`tests/banana.test.ts` pins the edge landing exactly at contact, the knife back up before
a half beat at 120, 136 and 150 BPM, the belly on the board and the ends tapered, slices
advancing on hits only, a stem left for the coda, bounded flop and juice, and five
deterministic bounded sound buffers.
