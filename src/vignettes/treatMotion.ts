import { clamp01, easeOut } from './motion';

/** Coda contacts are shared by the picture and its rendered audio buffer. */
export const TREAT_REVEAL_SEC = 1.8;
export const SNARE_ROLL = [...Array.from({ length: 19 }, (_, i) => ({
  at: i * 0.062, side: i % 2, gain: 0.42 + i / 32,
})), { at: 1.24, side: 0, gain: 1.55 }];
export const BONGO_BEAT = [
  { at: 0, side: 0, gain: 1 }, { at: 0.18, side: 1, gain: 0.85 },
  { at: 0.36, side: 0, gain: 0.7 }, { at: 0.45, side: 0, gain: 0.65 },
  { at: 0.63, side: 1, gain: 1 }, { at: 0.9, side: 0, gain: 0.8 },
  { at: 1.08, side: 1, gain: 1 },
] as const;
export const BONGO_FAIL = [
  { at: 0, side: 0, gain: 0.65 }, { at: 0.27, side: 1, gain: 0.55 },
  { at: 0.62, side: 1, gain: 0.4 },
] as const;
export const STICK_LANDINGS = [0.48, 0.64, 0.79, 0.9] as const;
export const FREEZE_AT = 0.32;
export const WORM_AT = 0.3;

export function stickDrop(age: number, side: number, still: boolean): { fall: number; bounce: number } {
  const lands = STICK_LANDINGS[side]!, settles = STICK_LANDINGS[side + 2]!;
  return {
    fall: still ? 1 : clamp01((age - side * 0.16) / 0.48),
    bounce: still ? 0 : Math.sin(clamp01((age - lands) / (settles - lands)) * Math.PI) * 24,
  };
}

export function contactPulse(age: number, duration = 0.18): number {
  return age < 0 ? 0 : 1 - easeOut(age / duration);
}

export function percussionPose(age: number, events: readonly { at: number; side: number }[], side: number): number {
  let pulse = 0;
  for (const hit of events) if (hit.side === side) pulse = Math.max(pulse, contactPulse(age - hit.at, 0.115));
  return pulse;
}

/** A successful coda consumes the last portion; a failed round always has food left. */
export function consumed(hits: number, targets: number, ending: number, successful: boolean): number {
  const progress = clamp01(hits / Math.max(1, targets)) * 0.82;
  return ending >= 0 && successful ? progress + (1 - progress) * easeOut(ending / 0.72) : progress;
}

export function reveal(age: number, from: number, still: boolean): number {
  return still ? (age >= from ? 1 : 0) : easeOut((age - from) / 0.45);
}
