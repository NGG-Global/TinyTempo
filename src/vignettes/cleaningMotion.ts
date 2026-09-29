import { clamp01, easeOut } from './motion';

export const CLEANING_REVEAL_SEC = 1.2;
export const CLEANING_REVEAL_AT = 0.28;

/** Short enough for the game's fastest subdivisions; a new beat always restarts it. */
export function cleaningPulse(age: number, beat: number): number {
  const duration = Math.min(0.18, beat * 0.3);
  return age >= 0 && age < duration ? Math.sin(Math.PI * age / duration) : 0;
}

/** Judged hits clean the surface, but the last patch belongs to a successful verdict. */
export function cleanedSpots(hits: number, targets: number, spots: number, ending: number, successful: boolean): number {
  if (successful && ending >= CLEANING_REVEAL_AT) return spots;
  return Math.floor(clamp01(hits / Math.max(1, targets)) * Math.max(0, spots - 1));
}

export function cleaningReveal(ending: number, still: boolean): number {
  return ending < 0 ? 0 : still ? 1 : easeOut(ending / CLEANING_REVEAL_AT);
}
