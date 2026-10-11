/** All musical timing values are seconds unless the name explicitly says Ms. */
export const RHYTHM = {
  perfectMs: 55,
  goodMs: 130,
  deliveryGraceMs: 50,
  leadSec: 0.2,
  beatsPerBar: 4,
  /** One bar, once at the start of a level. Tasks after the first have no lead-in at all. */
  leadInBeats: 4,
  /**
   * How far before the player's first target the turn starts changing hands.
   *
   * Nothing is added to the loop: these are the last beats of the demonstration's own
   * bar, and the handover is a rendering change keyed to times the plan already carries.
   * Two beats is enough for a player to be winding up rather than reacting; on the
   * densest patterns it may crowd, which is why it is a knob rather than a literal.
   */
  runwayBeats: 2,
  /**
   * How many numerals count the player into their turn: "3", "2", "1" on the beats
   * before their first target, and "Go!" on the target itself.
   *
   * One more than `runwayBeats`, deliberately. The block's own cue opens two beats out;
   * the count opens a beat ahead of it so the first numeral is a heads-up rather than
   * another thing arriving at the same moment as the baton. Nothing is scheduled and
   * nothing sounds — the numerals land on beats the plan already carries.
   */
  turnCountBeats: 3,
  pumpMs: 20,
  stallMs: 250,
  /**
   * How old a `getOutputTimestamp()` pair may be before it is ignored. Bluetooth A2DP
   * routinely reports 200–400 ms of output delay; the previous 250 ms ceiling treated
   * those stamps as stale, fell back to the render clock, and jumped the scene forward
   * by the delay — which expired the player's targets before they heard them.
   */
  clockStampMaxAgeMs: 1000,
  /**
   * How old a tap's DOM timestamp may be before `input()` treats it as a different
   * clock rather than a late handler. Original timestamps exist to remove a frame of
   * dispatch delay — tens of milliseconds. Chrome on Bluetooth often stamps pointer
   * events on the audio device clock, 150–400 ms behind `performance.now()`. The old
   * 1000 ms window kept those, so `now()` (synced, using `performance.now()`) looked
   * fine while `input()` placed every tap a Bluetooth buffer early and missed.
   */
  inputStampMaxAgeMs: 80,
  /**
   * The output lag, in milliseconds, past which the player's own beat is voiced on the
   * grid instead of on the tap.
   *
   * A tap-triggered voice is written at `currentTime` and heard one output lag later. A
   * speaker's 40 ms still reads as the sound of the tap; Bluetooth's 150–400 ms is most
   * of an eighth note at 120 BPM, so a tap the judge scores Perfect sounds on the next
   * subdivision, after a picture that already moved. No offset can fix it — a sound the
   * tap starts can never play before the tap — so on such a route every target is
   * sounded on the grid, as the trombone always is, and the tap keeps the picture and the
   * verdict. The threshold sits under the Good window so a voice that would still land
   * inside the tap's own judgement stays on the tap.
   */
  gridVoiceLagMs: 100,
  /**
   * How long the AudioContext may sit outside `running` before the level is paused.
   *
   * A Bluetooth rebuffer suspends it for a frame, and `tick` waits that out. A context that
   * stays suspended — audio focus taken by another app, a device that idles its output —
   * stops every clock the level runs on, and waiting it out was waiting forever: the picture
   * stood still, nothing was judged and nothing on screen said to tap. Past this the level
   * pauses, and Resume is the gesture that brings the context back.
   */
  suspendedPauseMs: 750,
  /**
   * How far past the coda's own end, on the wall clock, the result may be held waiting for
   * the audio clock to arrive there.
   *
   * The result opens when the heard clock reaches the end of the last coda. That clock
   * follows the device's output stream, and a stream that stops reporting progress — seen
   * as "the game freezes when a level ends" — left a finished, saved level on its last frame
   * for good. The level is already scored and saved by then, so nothing is lost by opening
   * the plaque on time from the wall clock instead.
   */
  resultGraceMs: 1500,
  goodPoints: 70,
  extraPenalty: 25,
} as const;

export interface TimingWindows {
  readonly perfectMs: number;
  readonly goodMs: number;
  readonly deliveryGraceMs: number;
}
