export interface Pattern {
  readonly id: string;
  readonly label: string;
  readonly lengthBeats: number;
  readonly hits: readonly number[];
  /** Steps per beat the notation was written on: 1 for quarters, 2 for eighths, 3 for triplets, 4 for sixteenths. */
  readonly grid?: number;
}

export function validatePattern(pattern: Pattern): void {
  if (!Number.isFinite(pattern.lengthBeats) || pattern.lengthBeats <= 0 || !pattern.hits.length) {
    throw new Error('A pattern needs a positive length and at least one TAP.');
  }
  let previous = -Infinity;
  for (const beat of pattern.hits) {
    if (!Number.isFinite(beat) || beat < 0 || beat >= pattern.lengthBeats || beat <= previous) {
      throw new Error('TAP beats must be finite, unique, sorted and inside the phrase.');
    }
    previous = beat;
  }
}

/** Each whitespace-separated X or - occupies stepBeats, including trailing rests. */
export function parsePattern(id: string, notation: string, stepBeats = 1): Pattern {
  const tokens = notation.trim().split(/\s+/);
  if (!Number.isFinite(stepBeats) || stepBeats <= 0 || tokens.some(t => t !== 'X' && t !== '-')) {
    throw new Error('Use X and - tokens with a positive step length.');
  }
  const pattern: Pattern = Object.freeze({
    id, label: notation, lengthBeats: tokens.length * stepBeats,
    hits: Object.freeze(tokens.flatMap((token, i) => token === 'X' ? [i * stepBeats] : [])),
    grid: 1 / stepBeats,
  });
  validatePattern(pattern);
  return pattern;
}

/**
 * A pattern on a grid of `stepsPerBeat` steps to the beat, for the subdivisions a step
 * length cannot write: a triplet step is a third of a beat, which no binary fraction
 * holds, so twelve of them multiplied out land a hair over four beats and the phrase
 * rounds up to two bars. Dividing by the step count instead makes the length exact, and
 * the hits fall where the beat grid the level runs on expects them.
 */
export function parseSubdivided(id: string, notation: string, stepsPerBeat: number): Pattern {
  const tokens = notation.trim().split(/\s+/);
  if (!Number.isInteger(stepsPerBeat) || stepsPerBeat < 1 || tokens.some(t => t !== 'X' && t !== '-')) {
    throw new Error('Use X and - tokens with a whole number of steps per beat.');
  }
  const pattern: Pattern = Object.freeze({
    id, label: notation, lengthBeats: tokens.length / stepsPerBeat,
    hits: Object.freeze(tokens.flatMap((token, i) => token === 'X' ? [i / stepsPerBeat] : [])),
    grid: stepsPerBeat,
  });
  validatePattern(pattern);
  return pattern;
}

/** The closest two hits come, in beats; Infinity for a single hit. */
export function tightestGap(pattern: Pattern): number {
  let gap = Infinity;
  for (let i = 1; i < pattern.hits.length; i++) gap = Math.min(gap, pattern.hits[i]! - pattern.hits[i - 1]!);
  return gap;
}

export function secondsPerBeat(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error('BPM must be positive and finite.');
  return 60 / bpm;
}

export const PATTERNS: readonly Pattern[] = Object.freeze([
  parsePattern('steady', 'X X X -'),
  parsePattern('gap', 'X X - X X'),
  parsePattern('double', 'X - X - - - X X', 0.5),
]);
export const TEMPOS = [80, 100, 120] as const;
