/**
 * The beat the music is on, for anything outside a level that moves with it: the map's
 * frontier hop and the title's beads and hammer. Pure, so the phase is tested under node.
 *
 * A level is judged against `MusicSystem`'s grid and never reads this. This is the same
 * arithmetic for presentation: a position on the music in source seconds becomes beats,
 * and beats become where we are in the bar. With no music to read — none loaded, none
 * started, a browser still waiting for its first touch — the pulse runs on the frame clock
 * at the music's own tempo instead, so nothing that moves with it ever freezes. When the
 * music does arrive the phase moves once onto the music's, and stays there.
 */

/** The tempo the frame-clock fallback runs at: the game's music, at its source tempo. */
export const PULSE = Object.freeze({ fallbackBpm: 120, beatsPerBar: 4 });

export interface Pulse {
  /** Beats since the grid's origin: the music's first downbeat, or the frame clock's zero. */
  readonly beats: number;
  /** The tempo heard at that moment, for turning beats back into seconds. */
  readonly bpm: number;
  /** Whether this came from the music, or from the frame clock in its place. */
  readonly onMusic: boolean;
}

/**
 * A pulse from a position on the music (source seconds from its first downbeat) at the
 * source tempo and the rate it is playing at, or the frame clock's when there is none.
 */
export function pulseAt(position: number | null, sourceBpm: number, rate: number, fallbackSec: number): Pulse {
  if (position !== null && Number.isFinite(position) && sourceBpm > 0 && rate > 0 && Number.isFinite(rate)) {
    return { beats: position * sourceBpm / 60, bpm: sourceBpm * rate, onMusic: true };
  }
  const t = Number.isFinite(fallbackSec) ? fallbackSec : 0;
  return { beats: t * PULSE.fallbackBpm / 60, bpm: PULSE.fallbackBpm, onMusic: false };
}

export interface BarPose {
  /** Whole bars since the origin. */
  readonly bar: number;
  /** Which beat of the bar, from 0. */
  readonly beatInBar: number;
  /** How far into that beat, 0 → 1. */
  readonly phase: number;
  /** Seconds since the last bar line, and until the next, at the pulse's tempo. */
  readonly sinceBarSec: number;
  readonly untilBarSec: number;
}

/** Where a pulse is in its bar. Beats before the origin count back from bar 0 like any other. */
export function barPose(pulse: Pulse, beatsPerBar: number = PULSE.beatsPerBar): BarPose {
  const perBar = Math.max(1, Math.round(beatsPerBar));
  const beats = Number.isFinite(pulse.beats) ? pulse.beats : 0;
  const bar = Math.floor(beats / perBar);
  const inBar = beats - bar * perBar;
  const beatInBar = Math.min(perBar - 1, Math.floor(inBar));
  const secPerBeat = 60 / (pulse.bpm > 0 ? pulse.bpm : PULSE.fallbackBpm);
  return {
    bar,
    beatInBar,
    phase: inBar - beatInBar,
    sinceBarSec: inBar * secPerBeat,
    untilBarSec: (perBar - inBar) * secPerBeat,
  };
}
