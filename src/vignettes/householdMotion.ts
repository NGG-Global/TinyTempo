import { clamp01, easeOut } from './motion';

/** Shared by the sound buffer and illustration: the chain stays in sync at every tempo. */
export const BUBBLE_CHAIN = Array.from({ length: 8 }, (_, i) => 0.12 + i * 0.085);
export const HOUSEHOLD_REVEAL_SEC = 1.65;

export function contactPulse(age: number, duration = 0.18): number {
  return age < 0 || age >= duration ? 0 : (1 - age / duration) ** 2;
}

export function eggReveal(age: number, successful: boolean, still = false) {
  const open = easeOut(age / 0.42);
  const drop = clamp01((age - 0.2) / 0.4);
  return {
    open: successful ? open : open * 0.24,
    drop: successful ? drop : 0,
    splash: successful && !still ? Math.sin(clamp01((age - 0.6) / 0.32) * Math.PI) : 0,
  };
}

export function doorOpening(age: number, successful: boolean, still = false): number {
  return successful ? easeOut((age - (still ? 0 : 0.16)) / (still ? 0.15 : 0.82)) : 0;
}

export function roomReveal(age: number, successful: boolean): number {
  return successful ? easeOut((age - 0.12) / 0.95) : 0;
}
