import { ENDLESS } from '../config/endless';

/**
 * The first-visit hints: one card the first time a player opens the Scrapbook, Settings or
 * Endless Mode, saying what the screen is for in a few lines, closed once and never shown
 * again on this device (`seenScreenHint` in `game/progress.ts`). Pure: the words and the
 * rules, no Phaser. `ui/screenHint.ts` draws them.
 *
 * Device-local, like the offbeat and long-phrase flags: they are not in the cloud save
 * or a save code. A player moving to a new phone has not seen that phone's screens, and
 * reading three short cards again costs less than a cloud schema change.
 */
export type ScreenHintId = 'scrapbook' | 'settings' | 'endless' | 'reminder';

export interface ScreenHintCopy {
  /** The screen's name, small, over the title. */
  readonly eyebrow: string;
  readonly title: string;
  /** One idea a line, numbered on the card. Short enough to stay two lines on a handset. */
  readonly lines: readonly string[];
  /** The main button. */
  readonly action: string;
  /** A second, quieter button beside it, for a card that asks a question. None on the plain hints. */
  readonly secondary?: string;
  /**
   * Whether a tap outside the card closes it. Not for Endless: closing it starts the run,
   * and a stray tap should not start one.
   */
  readonly outsideCloses: boolean;
}

const BPM = ENDLESS.tempo, BAR = ENDLESS.threshold, LIVES = ENDLESS.lives;

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five'] as const;

export const SCREEN_HINTS: Readonly<Record<ScreenHintId, ScreenHintCopy>> = Object.freeze({
  scrapbook: {
    eyebrow: 'Scrapbook',
    title: 'Keepsakes for three stars',
    lines: [
      'Some levels hold a keepsake. Each empty slot names its level.',
      'Finish that level with three stars and the keepsake is yours.',
      'Opening a new area on the map stamps its badge on the first page.',
      'Touch a keepsake to see where it came from.',
    ],
    action: 'Got it',
    outsideCloses: true,
  },
  settings: {
    eyebrow: 'Settings',
    title: 'Make the game yours',
    lines: [
      'Music and Effects each have their own volume.',
      'Taps landing early or late? Set the Tap offset under Timing. Speaker and headphones each keep their own.',
      'Your save code, under Progress, carries your levels to another device.',
    ],
    action: 'Got it',
    outsideCloses: true,
  },
  endless: {
    eyebrow: 'Endless Mode',
    title: 'One long run',
    lines: [
      'Acts follow one another with no break, and the clock never stops.',
      `The tempo climbs from ${BPM.startBpm} to ${BPM.capBpm} BPM, and the bar from ${BAR.start}% to ${BAR.peak}%.`,
      `${NUMBER_WORDS[LIVES.start] ?? LIVES.start} Groove Lives. A round under the bar costs one; ${(NUMBER_WORDS[LIVES.recoveryStreak] ?? LIVES.recoveryStreak).toString().toLowerCase()} in a row at ${LIVES.excellentAccuracy}% win one back.`,
      'Leaving the app ends the run, and it is not ranked.',
    ],
    action: 'Start run',
    outsideCloses: false,
  },
  // Not a screen's first visit: the daily reminder's one-time offer, on the map after the first
  // day's stamp (`docs/REMINDERS.md`). It is a question, so it has two answers and a tap
  // outside answers neither.
  reminder: {
    eyebrow: 'Daily objectives',
    title: 'A reminder in the evening?',
    lines: [
      'Three new objectives arrive every day, with a stamp for finishing them.',
      "If today's are still open at 6 pm, the game can send one reminder.",
      'Nothing once they are done, and you can turn it off in Settings.',
    ],
    action: 'Remind me',
    secondary: 'Not now',
    outsideCloses: false,
  },
});

/** How a hint was closed: its button, its second button, a tap outside the card, or Android's back. */
export type HintClose = 'action' | 'secondary' | 'outside' | 'back';
