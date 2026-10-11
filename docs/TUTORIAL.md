# The tutorial

`TutorialScene` and `game/TutorialRun.ts`, remade so that the one thing it has to
teach — *when it is your turn* — is taught on the object that says so in every level,
with the one cue that says it most plainly: the count.

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

The second tutorial moved the lesson onto the block, and players still could not say
when to act. Four things were left over:

- **It left out the count.** A level strikes "3", "2", "1" under the player's row on the
  last beats of the hammer's bar and "Go!" on the downbeat, and the lesson deliberately
  did not draw it, so as not to crowd its words. So the one cue the level relies on for
  *when* was the one cue the lesson never showed, and the player met it unexplained on
  level 1.
- **"Get ready" said that something was coming, not when.** The words were keyed to the
  baton starting to cross, two beats out, and *Your turn* was said on the downbeat —
  which the turn-cue notes themselves call too late to wind up for.
- **It went from watching straight to performing.** One watched cycle, then a judged
  bar with nothing sounded for the player. There was no step in which the downbeat
  could be *felt* before it had to be found.
- **A mistake was named after the bar.** A tap in the hammer's turn shook the rows and
  the sign kept saying *Their turn*; the player heard *Too early* a bar later, by which
  time they had made the same mistake twice more.

And its copy was two lines of body text at the top of the screen, changing every couple
of seconds, while the thing it described was at the bottom. A second line is one the
player never gets to while a bar is playing.

## What it is now

Three passes on the real grid, all drawn with the level's own block and its own count,
and none with a pause between the hammer's bar and the player's. Every pass runs the same
cycle level 1's first-run pass plays, at 72 BPM: one counted bar, the hammer's bar, the
count, the answer.

**The ball.** User testing after the count was added said the same thing again: players
could not tell that their turn starts the beat after the hammer's last. The count says
*when* in numbers and the block says it in colour and motion, but nothing showed the pulse
itself carrying on across the bar line. Every pass now draws the pulse ball
(`pulseBall`, `docs/TURN_CUE.md`): on the hammer's beads as it plays them, then one hop
down onto the first socket exactly on "Go!", then on each socket the player answers. The
ball lands, you tap — the cue every karaoke and every approach-note rhythm game relies on,
and the one thing in the lesson that is literally the same object on their row and on
yours. The words follow it: *Watch the ball hop along the hammer's row*, *3, 2, 1 — on Go!
the ball lands in your row*. And the fact first players miss is said outright, more than
once, before the player is ever judged: **no pause**.

1. **Watch.** The game plays both halves. A sign above names each moment as it happens:
   *Listen*, *Their turn*, **Count down** on the beat the "3" strikes — "3, 2, 1 — and
   the game taps on Go!" — *Your turn* on the downbeat, and *That's the whole game* at
   the end. A drawn finger taps beside the face during the answer. The sign takes the
   side's colour — timber for the hammer's turn, coral for the player's, the mix through
   the count — so the sign and the face agree.
2. **Tap along.** The same cycle, judged by `RoundController`, with every target voiced
   on the grid (`gridAction`, the same thing a laggy output route turns on for every
   act): the hammer sounds the answer and the player taps with it, so the downbeat is
   felt under the thumb before it has to be found alone. One judged hit passes
   (`TUTORIAL.alongHits`), because a single hit is proof the downbeat was found and two
   would hold a player in the scaffold who is ready to leave it. The verdict is *With it
   — now without it*, and the coral block reads **On your own**.
3. **On your own.** The same cycle, with nothing voiced for the player: what passes here
   is what passes in a level. Two judged hits of the three is a pass. A miss is named for
   what it was rather than scored:
   - **Too early** — every tap landed in the hammer's turn. *Wait for Go!*
   - **That was your turn** — the player's whole bar went by. *Your bar starts on Go!
     There is no pause.*
   - **Nearly** — some taps landed. *Start on Go! and keep the hammer's spacing.*

   A pass on their own that found no downbeat at all — **Too early** or **That was your
   turn** — goes back to **Tap along again** rather than to another silent bar: the
   scaffold is where the answer sounds under the thumb, and a player who has not located
   the downbeat is better served hearing it again than guessing again. **Nearly** tries the
   same pass again. After four judged passes that did not clear, counting the tap-along
   ones, *Let's play* is offered instead, so nobody is held in the lesson. *Skip* is there
   throughout, and *Watch again* whenever a pass is over.

**A tap in the hammer's turn is named as it lands.** On either judged pass, a tap before
the player's window makes the rows shake, as before, and now also turns the sign to
**Not yet** — *That's the hammer's turn. Wait for Go!* — for `TUTORIAL.nudgeSec`. The
nudge never covers the player's own bar or a verdict: once it is their turn, the words say
so.

Every pass draws the block through `drawBlock` and the count through `turnCountPose`,
exactly as `PlayScene` does, in the same place under the face. The lesson adds the two
things a level leaves out: a label beside each owner slot (**THE HAMMER** over the shelf's
hammer slot, **YOU** under the face's tap slot — beside the glyph each names, which is what
leaves the band under the face's centre free for the count) and a coral pointer at the
rows' right end that travels with the token.

## Why the words come from the block

`coach(run, now)` in `game/TutorialRun.ts` is pure and produces every heading and line
from `momentOf(plan, now)`, which reads the plan the block is drawn from. The *Count down*
moment opens exactly when `turnCount` first returns a numeral — `RHYTHM.turnCountBeats`
before the player's first target, one beat ahead of the baton — and *Your turn* on the
downbeat itself. The words and the picture cannot disagree about whose turn it is, and
`tests/tutorial.test.ts` pins the ordering: the count is named on the beat its first
numeral strikes, *before* the beat it counts to, never on it.

The moment is keyed to the count rather than to the baton on purpose. The "3" lands a beat
before the runway opens, and a sign still saying *Their turn* under a numeral that has
already struck would be the words lagging the block. From that beat on, the count is what
the player should be reading, and the words say so in the three words that matter: *tap on
Go!*

`momentOf` says *yours* from the downbeat, while the block's own `yours` value ramps over
a fraction of a beat after it. That is deliberate: the block is animating a handover that
has already finished arriving; the word must not lag the beat it names.

Every line of copy is one line and under about fifty characters, pinned by the tests. It is
read while a bar is playing, from the far end of the screen.

## What it does not do

- It does not judge the watched pass, score anything, or spend anything. No heart, no
  progress, no analytics event beyond the visit's start and how it ended.
- It does not teach with a pause. The one place the loop waits is the `TUTORIAL.leadSec`
  grace before each pass's count-in, so the count is whole.
- It does not replace level 1's first-run pass or its guiding ring. Those are still the
  in-level teach for a player who skipped this; the tutorial is the version with words.
- It does not add a sound to the count. The level's count has no voice, for the reason
  `docs/TURN_CUE.md` gives — a second pulse under the demonstration's own beats — and the
  lesson's count is the level's.
- It does not show the ball on every level. The ball is a scaffold, like the guiding ring:
  the lesson, level 1's first-run pass, the guided level and a new grid's introduction have
  it; a learnt level reads the block alone.

## State

`small-acts.tutorial.v1` holds `complete` on *Let's play* and `skipped` on *Skip*, and a
skip never overwrites `complete`. The menu reads either (`tutorialSeen`) to decide whether
a first Play opens the lesson: a player who skipped it has said they know the game, and
the lesson is *How to play* on the title screen after that rather than a gate in front of
every Play — which is what it was while only `complete` counted. A save code carries
`complete` alone (`tutorialComplete`), as before. The lesson's own state is a
`TutorialRun` per visit and is not stored. `tutorial_skipped` reports the step it was
skipped from — `watch`, `along`, `try` or `done`.

## Files

| File | What it holds |
| --- | --- |
| `game/TutorialRun.ts` | `TUTORIAL`, the three-pass model, the verdicts, the re-scaffold, the nudge, `momentOf`, `coach`; no Phaser |
| `game/beatTrack.ts` | `pulseBall`: where the ball is at any moment of a plan; `numeralStyle`: how each numeral is dressed |
| `scenes/TutorialScene.ts` | The stage: hammer act, the level's block with labels, pointer and count, the sign, the controller |
| `tests/tutorial.test.ts` | Moments against the count, verdicts from judgements, the nudge, completion storage |
