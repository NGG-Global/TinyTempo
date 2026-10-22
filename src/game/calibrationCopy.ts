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

export type CalibrationPhase = 'idle' | 'counting' | 'measured' | 'failed';

/**
 * The line under the title: what to do now, and what it is for. It used to say one thing
 * in every phase — tap on every beat — which left out the two things a player asked: what
 * pressing Start would do, and what Keep and Retry do once there is a number. The phases
 * are the screen's own, and the words follow them.
 */
export function instructionCopy(phase: CalibrationPhase, kept: boolean): string {
  switch (phase) {
    case 'counting':
      return 'Tap on every click, steadily. The count stops itself after eight.';
    case 'measured':
      return 'Keep saves this offset for the audio you are using now. Retry runs the beat again.';
    case 'failed':
      return 'Nothing was saved. Retry runs the beat again: tap on every click, steadily.';
    case 'idle':
      return kept
        ? 'Press Check and tap on every click again. Spot on means the offset is right; a new number is a better one to keep.'
        : 'Press Start, then tap anywhere on every click. Eight taps tell the workshop how late your device plays sound.';
  }
}
