# The tutorial

`TutorialScene` and `game/TutorialRun.ts`, remade so that the one thing it has to
teach — *when it is your turn* — is taught on the object that says so in every level.

## What was wrong

The first tutorial predated the turn block (`docs/TURN_CUE.md`). It taught a cue the
game no longer has:

- A sign at the top of the screen flipped from **Watch** to **Your turn** on the
  downbeat it announced. That is exactly the cue the level replaced, for the reason
  the turn-cue notes give: a word that arrives on the beat arrives too late to wind up
  for, and it arrives where the player is not looking.
- Its rhythm row was four beads labelled **TAP TAP WAIT TAP**. Nothing like it appears
  in a level. A player who learnt to read it met the shelf, the face and the baton for
  the first time on level 1, with no words.
- Guided practice *waited* at every tap, indefinitely. It taught that the game pauses
  for you, when the whole point of the loop is that it does not: the answer begins on
  the bar line the demonstration ends on.

The words it did have were about the pattern ("tap, tap, wait, tap") rather than about
the turn, which is the thing new players actually get wrong — tapping along with the
hammer, or waiting through their own bar for a prompt that never comes.

## What it is now

Two passes on the real grid, both drawn with the level's own block and both without a
pause between the hammer's bar and the player's.

1. **Watch.** One counted bar, the hammer's bar, the handover, and the game answering
   its own call — the same cycle level 1's first-run pass plays, at 72 BPM. A sign
   above names each moment as it happens: *Listen*, *Their turn*, *Get ready* as the
   token starts to cross, *Your turn* on the downbeat, and *That's the whole game* at
   the end. The sign takes the side's colour — timber for the hammer's turn, coral for
   the player's, the mix while the token is crossing — so the sign and the face agree.
2. **Try.** The same cycle, and this time the taps are judged by `RoundController`,
   the level's own phase machine and judge. What passes here is what passes there.
   Two judged hits of the three is a pass. A miss is named for what it was rather than
   scored:
   - **Too early** — every tap landed in the hammer's turn. This is the mistake the
     tutorial exists for, and the copy says where to look: *wait until the token sits
     on your row*.
   - **That was your turn** — the player's whole bar went by. *It starts the moment the
     hammer's bar ends; there is no pause.*
   - **Nearly** — some taps landed.

   After three tries that did not pass, *Let's play* is offered beside *Try again*, so
   nobody is held in the lesson. *Skip* is there throughout.

Both passes draw the block through `drawBlock`, with the two things a level leaves out:
a label on each row (**THE HAMMER** above the shelf, **YOU** below the face) and a coral
pointer at the rows' right end that travels with the token. The pointer is the lesson's
one addition to the block's own cue. During the watched answer a drawn finger taps beside
the face; on the try, the player is the finger.

## Why the words come from the block

`coach(run, now)` in `game/TutorialRun.ts` is pure and produces every heading and line
from `momentOf(plan, now)`, which reads the same `handover(plan, now)` the block is drawn
from. So *Get ready* appears exactly when the baton starts to cross — `RHYTHM.runwayBeats`
before the player's first target, inside the hammer's bar — and *Your turn* on the
downbeat itself. The words and the picture cannot disagree about whose turn it is, and
`tests/tutorial.test.ts` pins the ordering: the handover is named *before* the beat it
announces, never on it.

`momentOf` says *yours* from the downbeat, while the block's own `yours` value ramps over
a fraction of a beat after it. That is deliberate: the block is animating a handover that
has already finished arriving; the word must not lag the beat it names.

## What it does not do

- It does not judge the watched pass, score anything, or spend anything. No heart, no
  progress, no analytics event.
- It does not teach with a pause. The one place the loop waits is the `TUTORIAL.leadSec`
  grace before each pass's count-in, so the count is whole.
- It does not replace level 1's first-run pass or its guiding ring. Those are still the
  in-level teach for a player who skipped this; the tutorial is the version with words.

## State

`small-acts.tutorial.v1` is unchanged: `complete` on *Let's play*, read by the menu to
decide whether a first Play opens the lesson, and carried in a save code as before. The
lesson's own state is a `TutorialRun` per visit and is not stored.

## Files

| File | What it holds |
| --- | --- |
| `game/TutorialRun.ts` | `TUTORIAL`, the two-pass model, the verdicts, `momentOf`, `coach`; no Phaser |
| `scenes/TutorialScene.ts` | The stage: hammer act, the level's block with labels and pointer, the sign, the controller |
| `tests/tutorial.test.ts` | Moments against the handover, verdicts from judgements, completion storage |
