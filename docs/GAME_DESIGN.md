# Game design

> **Part archive, as of 11 September 2026.** The endless-progression section below is
> current. The music-integration note at the top and the "current prototype
> scope" section further down describe superseded milestones — the seven-stem
> playback and the deleted Rhythm Lab respectively. For the state of the code,
> read `CLAUDE.md` and the README.

## Superseded: the seven-stem music integration

All rounds share the seven-stem composition at its measured 120 BPM. Each stem is normalized to an exact 60-bar loop whose origin is the first downbeat, so the count-in starts on the loop origin. Music continues through the final summary; restart schedules all stems anew. Authored patterns and judgement are unchanged, while the old 86/96/104 tempo progression is inactive. Supplied metadata also mentions 121 BPM and needs confirmation—see [music notes](MUSIC.md). No dynamic tempo or gameplay-driven stem mixing is implemented.

## Endless level progression

The game is an endless road of levels (`src/game/levels.ts`, tuned in `src/config/progression.ts`), reached from a scrollable map (`MapScene`) grouped into ten-level areas: Grass, Pavement, Sand, Snow, Dusk, then Grass II and so on forever. A level is one round of one vignette (Hammer, Window, Bug, Saw, Tomato, Curl, Cucumber, Banana rotating by level, in registry order), several tasks long. Clearing a level unlocks the next; stars record how far above the bar the player finished. Progress is saved locally.

One curve drives every difficulty knob so they move together and never contradict each other: `d(level) = 1 − e^(−(level−1)/25)`, which rises fast through the first two areas and saturates near level 60. From `d`:

| Knob | Formula | Level 1 | Level 10 | Level 20 | Level 40 | Plateau |
| --- | --- | --- | --- | --- | --- | --- |
| Tasks per level | 3 + 5d | 3 | 5 | 6 | 7 | 8 |
| Tempo ceiling (BPM) | 120 + 30·d^1.5, in 2 BPM steps | 120 | 124 | 132 | 142 | 150 |
| Pattern tier reached | ⌊5·d^0.8⌋, spanning two tiers below | 0 | 1 | 3 | 4 | 4 |
| Clear bar (mean accuracy) | 40 + 40d | 40% | 52% | 61% | 72% | 80% |
| Stars | clear bar, then thirds of the headroom to 100% | 40/60/80 | 52/68/84 | 61/74/87 | 72/81/91 | 80/87/93 |
| Length | | ~30 s | ~50 s | ~65 s | ~80 s | ~95 s |

**Every level starts at 120 BPM**, the music's real tempo, and ramps task by task toward its ceiling: task `i` of `n` plays at `120 + (ceiling − 120)·i/(n−1)`, rounded. The music follows: on the downbeat that starts each new task the seven stems get the same playback-rate automation, so the beat grid and the backing track change tempo together. Pitch rises with tempo (Web Audio has no time-stretch), which is why the ceiling stops at +25%. Levels 1–3 are entirely flat: three quarter-note tasks at 120 BPM with a 40% bar, which mostly-Good tapping (70 points each) clears comfortably. Tempo and density use higher exponents than length and the clear bar, so the first things a new player notices are slightly longer levels and a slightly higher bar, not faster or denser music.

Pattern tiers: 0 quarter notes only; 1 one offbeat per bar; 2 two offbeats; 3 eight-beat phrases; 4 dense eight-beat phrases. No pattern places hits closer than half a beat, so at the 150 BPM ceiling the tightest spacing is 200 ms, still wider than the 130 ms Good window. Within a level the tiers also ramp from two below the ceiling tier up to it, and patterns are chosen with a per-level seed so a level is identical on every attempt and can be learned.

Failing shows the bar that would have cleared it and offers an immediate retry; the level itself does not get easier. Replaying a cleared level can only raise its best. The plateau is deliberate: past level 60 parameters hold while the seeded patterns keep changing, which keeps the road endless without becoming unfair.

The earlier one-task-per-act table below is retained as history.

| Act | Tempo | Phrase | Lesson |
| --- | --- | --- | --- |
| Hammer | music tempo | 4 beats; hits 0, 1, 2 | Steady quarter-note vocabulary |
| Window | music tempo | 4 beats; hits 0, 1, 2, 3.5 | Familiar start, one offbeat ending |
| Bug | music tempo | 8 beats; hits 0, 1, 2.5, 3, 4, 5, 6.5, 7 | Two similar halves combine rests and offbeats |

Each act keeps four preparation beats and four handoff beats. Tempo changes only at the next act's prepared downbeat. The default session takes approximately 43 seconds including codas/transitions; it ends with the mean of the three existing weighted task accuracies, not a new scoring formula. Each timing window remains Perfect ±55 ms / Good ±130 ms. All neighboring targets are more than 260 ms apart.

Bug is a small fictional plum-colored rubber creature on pale green tiles. A large sneaker attempts each stomp. Successful contact briefly compresses the bug; it always remains alive and playful. On a strong finish it springs onto the shoe as a new passenger. On a rough finish it hops safely to the side. No gore, injury detail, hold or swipe mechanic is involved.

See [implementation and QA](VERTICAL_SLICE.md). This section supersedes the infinite alternating-round milestone below.

## Current milestone: alternating Hammer and Window rounds

A three-task Hammer round now leads automatically into a three-task Window Cleaning round, and back again. Each retains the four-beat preparation and handoff, existing patterns, 100 BPM grid, and unchanged judgement. The existing musical ending/slide bar also carries the inter-vignette transition: a warm paper panel sweeps across, hides the scene replacement and reveals the next visual world. There is no tap-to-continue or loading screen between rounds.

Window uses TAP, not swipe: each input starts a lateral squeegee stroke. Successful outcomes clear bands of grime; misses leave them dirty. Demonstration cleaning resets for the player's turn. Clear glass reveals stronger diagonal reflections, an abstract landscape and a reflected sun. A good finish adds a crisp sun-glint; a rough finish leaves grime and a tiny drip. The common typography, geometric construction and quiet UI tie the cool blue/plum scene to the warm timber vignette without copying its composition or physical motion.

Restart repeats the current vignette's three-task round. Background interruption pauses/cancels and resumes with a fresh count-in. No additional mechanics or Bug content were added. See [implementation and API review](WINDOW_CLEANING.md). This section supersedes earlier single-vignette flow descriptions below.

## Current pacing: rounds contain tasks

A round now contains three nail tasks using the existing patterns, in order. One task is one demonstration/response nail riddle. Each task has four preparation beats and four handoff beats. In 4/4, four beats are one bar (not four bars). Longer patterns keep their hit offsets and gain trailing silence up to the next whole bar; the five-beat pattern therefore occupies two bars.

At 100 BPM the first and third tasks each take four bars of preparation/watch/handoff/response; the second takes six. Between tasks there is one musical bar: the finishing strike is on beat two, the table starts sliding on beat three, the new nail enters on beat four, and the next count-in begins on the following downbeat. Progress is automatic even after poor performance. Only after all three tasks does the player tap to begin another round. Restart or interruption restarts the full round with a fresh count-in. Judgement windows and scoring are unchanged; round accuracy is the equal-weight mean of task accuracies.

Backing music is an optional continuous bedding layer sharing the round's tempo/downbeat. There is no music asset yet. Impacts remain distinct foreground sounds, and player taps are never snapped to the music. See [music integration](MUSIC.md). This section supersedes the historical milestone descriptions below.

## Previous milestone: Hammer + Nail

Hammer + Nail is now playable with a procedural workshop illustration, anticipatory demonstration strikes, immediate player contacts and distinct flush/crooked endings. The same engine and ±55/±130 ms grades remain in use. A 70% result selects the satisfying ending (all Good hits with no extras qualify); this is a presentation choice, not a second score calculation. The finish is a short, unscored cinematic strike after the controller resolves the response. Another nail cycles the existing three patterns at 100 BPM; ↻ repeats the current one. Window and Bug remain unimplemented. See [implementation and QA notes](HAMMER_NAIL.md).

Status: core timing prototype implemented, 9 September 2026. The vignette design below remains a future proposal. See [Technical architecture](TECHNICAL_ARCHITECTURE.md) for implementation details and the original audit.

## Superseded: the Rhythm Lab prototype scope

PlayScene is now a temporary Rhythm Lab with a large pulsing circle, Watch/Your turn labels, immediate tap reaction, signed timing error, result and restart. There are no vignettes, progression or polished assets. Start/Restart repeats the selected phrase and BPM; Pattern and BPM cycle the available options and immediately begin a fresh attempt. Sound toggles output without stopping the timing clock. The notation remains visible as a debugging aid.

The current grades are **Perfect: absolute error ≤55 ms**, **Good: >55 ms and ≤130 ms**, **Miss: no matching tap within ±130 ms**. A tap outside all target windows or on an already consumed target also displays Miss and is counted separately as an extra. There is no Off grade in this prototype. These fixed casual windows apply at every BPM and are configured in `src/config/rhythm.ts`.

Perfect earns 100 points, Good earns 70, omissions earn zero, and each extra subtracts 25. Displayed accuracy is the clamped weighted points divided by expected-hit maximum. It is not simply hit count or average timing error; mean absolute matched-hit error is shown separately. A missed target has no fabricated millisecond error.

The three selectable patterns are `X X X -` (one beat per token), `X X - X X` (one beat per token), and `X - X - - - X X` (half a beat per token). Tempos are 80, 100 and 120 BPM. Each includes two preparation beats and a two-beat handoff. The response entry is fixed in advance; an early first tap within the Good window is accepted even while the handoff label is still displayed. Input is Phaser unified touch/mouse pointer-down; keyboard controls remain future work.

Backgrounding, touch-device landscape, audio suspension or an active callback gap over 250 ms cancels the attempt without a score. Tap Restart to replay the same selected settings. Result/restart is manual; this prototype does not advance automatically into another scene.

## Premise and feel

A mobile portrait rhythm game made from tiny visual jokes. A mundane action performs a short rhythm; the player repeats it with taps; the scene delivers a punchline and cuts to an unrelated situation. The recurring element is the interaction, not a character or continuous world.

The player should understand each new scene at a glance. Different props, palettes, framing and sounds provide variety while the same tap always means “do the action now.” Accuracy changes the physical reaction and ending. Failure should be amusing and readable, without interrupting the sequence with a retry screen.

## Round loop

1. Reveal the vignette and show “Watch.” Give two beats of preparation with a quiet count-in.
2. Demonstrate a four-beat phrase through clearly timed physical contacts and short action sounds.
3. Show “Your turn” for a two-beat handoff. Reset the props to the same starting state. The last handoff beat is a distinct readiness cue; it is not a target.
4. The player repeats the four-beat phrase. Every eligible tap triggers the action immediately. There are no ghost action sounds or target flashes revealing the answer during the response.
5. Allow the final timing window to close, show a short result and a roughly 450 ms punchline, then transition in roughly 180 ms.
6. Reveal a visually unrelated vignette. Continue even after a poor round.

These durations are initial tuning values. At 100 BPM, preparation + demonstration + handoff + response takes 7.2 seconds, followed by feedback and transition: approximately eight seconds per round. There is no loading between these three vignettes.

Example phrase, in quarter-note beat offsets: `[0, 1, 3, 3.5]`, length `4`. It reads “HIT — HIT — rest — HIT HIT.” At 100 BPM the action offsets are 0, 600, 1800 and 2100 ms. A rest is an absence of action; phrase length explicitly preserves the remaining silence. The response uses the same offsets from its own announced start, so both tempo and entry timing matter. The first tap does not establish the response clock.

## Mobile interaction and presentation

Use one large safe-area play surface with no spatial aiming requirement. Tapping anywhere on it performs the vignette action, regardless of where the prop appears. The window scene uses taps, not swipe recognition; the bug scene uses rhythm, not target chasing. Pointer-down is the moment of input, with no wait for release. Desktop left mouse and Space provide equivalent testing controls.

Only one contact is active at a time in the slice. A second finger held concurrently is ignored; lifting and tapping again creates the next hit. Holding does not repeat. Pause, mute, start and resume controls consume their own touches. Inputs during Watch, result, transition or pause do not count toward score; a subtle surface acknowledgement can explain that the touch was received without performing the demo action twice.

Keep the action high enough that the thumb does not cover the contact point. Put phase text and score inside the safe content area, with reachable pause/mute controls and at least 48 CSS px targets. Use the existing expanding portrait viewport; backgrounds fill the canvas, important art fits the safe central region. Extra tablet or tall-phone space is breathing room, not extra gameplay.

Show phase changes through text and shape as well as color. Perfect/Good/Off timing can use a small contact burst and a short label; avoid a text pileup on quick doubles. Offer reduced shake/flash and mute. Muting retains the audio clock and visual demonstration. A full alternate accessibility mode is outside this slice, but do not rely on color alone.

## Vertical slice: exactly three vignettes

| Vignette | Demonstration and player action | Accuracy and miss response | Round punchline |
| --- | --- | --- | --- |
| Hammer + Nail | A chunky hammer hits a nail in a block of wood. Contact, not the beginning of the swing, marks each beat. Each tap gives immediate contact followed by recoil. | Perfect has a clean spark; Good a small wobble; Off/extra a rattly glancing hit. A missed target leaves a wobble without inventing another hammer strike. | Strong round: nail settles flush with a tiny satisfied bow from the hammer. Weak round: nail curls into a silly hook. |
| Window Cleaning | A gloved hand makes one short wipe per beat, alternating direction by action count. Each stroke starts with a sharp squeak/contact accent. | Accurate wipes reveal clean patches; Off/extra smears them. A miss leaves a drip where a patch could have cleared. | Strong round: sparkling glass reveals a ridiculous face behind it. Weak round: the same face peers through one stubborn dirty patch. |
| Bug Squash | A cartoon shoe stomps a springy toy-like bug, which pops back up between actions. No gore. The sole's contact is the beat. | Accurate hits flatten it with a puff; Off/extra produces a comic skid. A miss lets it taunt the shoe. Every tap still produces a stomp. | Strong round: bug springs up holding a white flag. Weak round: bug dusts itself off and bows. |

Demonstration and response start with fresh visual state: the demo must not consume the player's nail depth, clean patches or bug reactions. The toy bug can recover repeatedly, so the first hit never removes the subject for the rest of the phrase. Art must support interruptible repeated contacts at the fastest selected interval; long recoil animations never lock input.

Start with procedural shapes and simple sprite transforms. The three scenes need different silhouettes and palettes even as placeholders. Each needs one crisp main action sample; window wipes may use two alternating variants. Share count-in, handoff and result sounds. Keep sample leading silence trimmed so physical contacts share an audible timing reference. Music, voice-over and custom shaders are unnecessary for this test.

## Patterns, progression and score

Use a small authored catalog shared by every vignette. Pattern identity and difficulty are independent of artwork. Initial four-beat catalog:

| ID | Beat offsets | Purpose |
| --- | --- | --- |
| steady-three | `[0, 1, 2]` | Learn the response entry and basic pulse |
| gap-three | `[0, 1, 3]` | Remember a rest |
| late-pair | `[0, 2, 3]` | Vary spacing |
| closing-double | `[0, 1, 3, 3.5]` | Rest followed by a quick pair |
| middle-double | `[0, 1.5, 2, 3]` | Introduce an offbeat |

Propose a six-round session: Hammer, Window, Bug, Hammer, Window, Bug, followed by a compact score/replay screen. Round one always uses steady-three at 100 BPM. Begin on Easy (three-hit patterns at 100 BPM). After two consecutive rounds at 80% or above, move to Standard (three/four-hit patterns at 110 BPM, including closing-double). After two consecutive rounds below 60%, return to Easy. Otherwise hold the tier. Reset these streaks after a tier change, and never change tempo or judgement windows mid-round. Keep middle-double for optional Standard variety after the closing-double is understood. Seeded selection makes a reported session reproducible; avoid immediately repeating a pattern when alternatives exist.

Initial timing grades, subject to handset playtesting:

| Absolute timing error | Grade | Points per expected hit |
| --- | --- | --- |
| Up to 45 ms | Perfect | 100 |
| Over 45 through 90 ms | Good | 70 |
| Over 90 through 130 ms | Off | 30 |
| No matched tap by the deadline | Miss | 0 |

An extra tap subtracts 25 points. Round percentage is `100 * max(0, earnedHitPoints - 25 * extraCount) / (100 * expectedHitCount)`. Clamp to 0–100. A strong ending requires at least 80%; lower scores get the weak joke. A Perfect round requires all Perfect and no extras. Session percentage uses total earned points and total expected-hit maximum, not an unweighted mean of percentages. Show a simple Perfect/Good streak if useful; Off, extra or Miss resets it. Streaks do not multiply score in this slice.

These are deliberately fixed, forgiving windows. Difficulty comes from rhythm structure and modest tempo changes. Extra taps never make spam a winning strategy, and one tap can satisfy only one expected hit. Technical matching rules are specified in the architecture document.

## Interruptions and session boundaries

Start with a clear “Tap to start” gesture that unlocks sound. Loading or audio failure provides a visible retry state. Pause, backgrounding, touch-device landscape orientation and audio suspension invalidate the current attempt without penalty. Resume requires a gesture and restarts that round from its demonstration, with the same pattern, tempo and vignette. Completed round scores remain; the interrupted attempt contributes nothing. Routine portrait resizing only relayouts the scene.

Replay resets the six-round session and its score. Keep the slice's state in memory; saved progression, accounts, leaderboards and native Android packaging can wait.

## Acceptance criteria and boundaries

- A first-time player can read whose turn it is from the turn block — the hammer's row, the token crossing, their row — and knows when to enter after one tutorial round.
- All three vignettes run the same pattern and judgement system without vignette-specific timing rules.
- A clean run, no-input run, early/late run and spam run produce understandable, consistent results.
- Rapid doubles trigger two visible actions and two sound attacks; recoil does not swallow the second input.
- Transitions take roughly 180 ms, block gameplay input and have no asset-loading stall.
- A six-round session completes and can replay without duplicate handlers, leftover audio or growing scene objects.
- Test on a physical Android phone, mobile Safari where available, and desktop mouse/keyboard; portrait resizing and interruptions preserve fairness.
- Under deliberate frame delays, scheduled sound remains steady and judgement uses event timestamps; a severe stall restarts the attempt instead of issuing unfair misses.

The slice excludes egg cracking, stamping, procedural rhythms, a song library, multiplayer, physics simulation, asset editors and monetization. Sawing, the tomato, the curl, and later cucumber and banana cutting were each added at request, and endless levels superseded the fixed session; see the current sections above. Further vignettes remain out of scope without a request. Its purpose is to prove that repeating rhythms through changing physical jokes is satisfying and technically reliable.
