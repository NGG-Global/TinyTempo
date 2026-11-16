import { BANANA_MOTION } from './bananaMotion';
import { CUCUMBER_MOTION } from './cucumberMotion';
import { CHALK_DRAW_SEC, DROP_BOUNCE_SEC, DROP_LANDING_SEC } from './curlMotion';

/**
 * How long the first eight acts' codas are visibly moving after the finishing contact.
 *
 * These acts hold their ending for the default one beat (`TaskSequence.ending`) where every
 * act from scissors & paper on holds five, and each of those has a test that its reveal
 * fits the hold. The originals had their lengths written inline, so nothing measured them
 * against the beat: at the 150 BPM ceiling the slide comes 0.4 s after the contact and the
 * next task's downbeat 1.2 s after it. The numbers are named here so one test can report
 * which codas run into the slide and which into the next task (`tests/earlyCodas.test.ts`);
 * whether the hold should grow is a design decision that changes every level's length,
 * and is not taken here.
 */
export const HAMMER_CODA_SEC = 0.7;
export const WINDOW_GLINT_SEC = 0.45;
export const BUG_SHOE_SETTLE_SEC = 0.45;
export const BUG_EXIT_SEC = 0.5;
export const SAW_CODA = { dropSec: 0.42, moteAtSec: 0.95, moteSec: 0.34 } as const;
export const TOMATO_SEED = { atSec: 0.9, sec: 0.32 } as const;
export const CURL_CODA = { chalkAtSec: 0.15, armDriftAtSec: 0.1, armDriftSec: 0.7 } as const;

/** A coda's length: in seconds where the act animates on the clock, in beats where it follows the tempo. */
export type CodaLength = { readonly sec: number } | { readonly beats: number };

export type EarlyAct = 'hammer' | 'window' | 'bug' | 'saw' | 'tomato' | 'curl' | 'cucumber' | 'banana';

/** The longest thing each act's coda does, by act id. */
export const EARLY_CODAS: Readonly<Record<EarlyAct, CodaLength>> = Object.freeze({
  hammer: { sec: HAMMER_CODA_SEC },
  window: { sec: WINDOW_GLINT_SEC },
  bug: { sec: Math.max(BUG_SHOE_SETTLE_SEC, BUG_EXIT_SEC) },
  saw: { sec: Math.max(SAW_CODA.dropSec, SAW_CODA.moteAtSec + SAW_CODA.moteSec) },
  tomato: { sec: TOMATO_SEED.atSec + TOMATO_SEED.sec },
  curl: {
    sec: Math.max(
      CURL_CODA.chalkAtSec + CHALK_DRAW_SEC,
      DROP_LANDING_SEC + DROP_BOUNCE_SEC.first + DROP_BOUNCE_SEC.second,
      CURL_CODA.armDriftAtSec + CURL_CODA.armDriftSec,
    ),
  },
  cucumber: { beats: Math.max(CUCUMBER_MOTION.tumbleBeats, CUCUMBER_MOTION.juiceBeats) },
  banana: { beats: Math.max(BANANA_MOTION.tumbleBeats, BANANA_MOTION.juiceBeats) },
});

export function codaSeconds(length: CodaLength, beatSec: number): number {
  return 'sec' in length ? length.sec : length.beats * beatSec;
}
