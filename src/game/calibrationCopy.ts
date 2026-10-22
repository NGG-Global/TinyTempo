import { CALIBRATION, type CalibrationVerdict } from './CalibrationRun';
import { CALIBRATION_TAPS } from './settings';

/**
 * The Tap offset's words, pure: the number as the game prints it, and the result strip's
 * two lines. In a module of its own because Settings prints the number too, and the words
 * are tested without a scene.
 */

/** A typographic minus, to match the rest of the game's type rather than a hyphen. */
export function formatOffset(ms: number): string {
  return `${ms > 0 ? '+' : ''}${String(Math.round(ms)).replace('-', '−')} ms`;
}

/**
 * The result strip's two lines: the reason over the number. A measurement says how tightly
 * the taps agreed and what it changes from; a check that lands within `spotOnMs` says so
 * instead of offering a number a hair different; a failure says which of the two things
 * went wrong, since each is different advice. Pure, so the wording is tested.
 */
export function resultCopy(verdict: CalibrationVerdict | null, before: number | null, checking: boolean): { readonly note: string; readonly value: string } {
  if (verdict === null) return { note: 'After eight taps', value: '' };
  if (verdict.kind === 'few') return { note: `Only ${verdict.landed} of ${CALIBRATION_TAPS} taps landed`, value: 'Tap on every beat' };
  if (verdict.kind === 'uneven') return { note: `Taps uneven · ±${Math.round(verdict.spreadMs)} ms`, value: 'Try a steadier beat' };
  const within = `Taps within ±${Math.round(verdict.spreadMs)} ms`;
  if (checking && Math.abs(verdict.residualMs) <= CALIBRATION.spotOnMs) return { note: `Spot on · ${within}`, value: formatOffset(verdict.offsetMs) };
  const from = before === null ? 'was not set' : `was ${formatOffset(before)}`;
  return { note: `${within} · ${from}`, value: formatOffset(verdict.offsetMs) };
}
