import { MASTERED_ACCURACY } from './mastery';
import type { Progress } from './progress';
import { clampVolume, type Settings } from './settings';

/**
 * A save as a short string the player can carry.
 *
 * Progress lives in the WebView's storage, which Android's Auto Backup restores onto a
 * new phone. That covers the common case and nothing else: a player who clears app data,
 * moves off Android, or asks support for help after losing a device has no route back.
 * This is that route, and the only one that does not require the game to have accounts.
 *
 * **What travels is what the player earned, never what they owe or own.** Levels, best
 * accuracies, calibration, the mute, the two levels and whether the tutorial is done. Not hearts,
 * not the refill ledger, not the daily-heart ledger, not the premium cache — restoring
 * those is either an exploit or an incoherence, and premium comes back through the store
 * rather than through a string a player can edit.
 *
 * The encoding is Crockford base32: case-insensitive, and with `I`, `L`, `O` and `U`
 * excluded so the characters that get misread do not appear. A code is copied far more
 * often than it is typed, but the one time it is typed is a support email from someone
 * who has already lost their progress once.
 */

/** No `I`, `L`, `O` or `U`: the four that get misread as 1, 1, 0 and V. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const DECODE = new Map<string, number>([
  ...[...ALPHABET].map((c, i) => [c, i] as const),
  // The confusable characters are accepted on the way in and mapped to what was meant.
  ['I', 1], ['L', 1], ['O', 0], ['U', 27],
]);

export const SAVE_CODE = {
  /**
   * 2 adds the music and effects levels. 1 is still read: a code written before the
   * sliders existed carries the mute and neither level, and both levels come back full.
   */
  version: 2,
  /** Levels beyond this are not encoded; far past where the difficulty curve saturates. */
  maxLevel: 4000,
  /** Characters per group in the printed form. Groups are cosmetic and stripped on read. */
  group: 5,
} as const;

export type SaveCodeError = 'empty' | 'malformed' | 'checksum' | 'version';

/**
 * The settings a code carries — deliberately not all of them.
 *
 * `Settings.analytics` is a consent signal, not a preference: it belongs to the device
 * and the jurisdiction its owner is in, not to the save. Restoring a code must not answer
 * a consent question on a phone whose owner was never asked it, so the type says so and
 * the compiler keeps it that way.
 */
export type PortableSettings = Pick<Settings, 'muted' | 'music' | 'sfx' | 'haptics'> & {
  /**
   * One offset, as version 1 and 2 codes carry it. A code is written with the active route's
   * value so an older build restoring it gets something sensible, and this build's restore
   * ignores it: per-route calibration is device-local (`game/routeCalibration.ts`).
   */
  readonly calibrationMs: number;
};

export interface SaveData {
  readonly progress: Progress;
  readonly settings: PortableSettings;
  readonly tutorialComplete: boolean;
}

export type SaveCodeResult =
  | { readonly ok: true; readonly data: SaveData }
  | { readonly ok: false; readonly reason: SaveCodeError };

const FLAG_MUTED = 1;
const FLAG_HAPTICS = 2;
const FLAG_TUTORIAL = 4;
/**
 * Bytes before the per-level scores. Version 1 is six: version, unlocked (2), calibration
 * (2), flags. Version 2 inserts the two levels after the flags, and the scores start
 * after those. The checksum is one further byte at the very end, so a buffer is
 * `header + levels + 1` — getting that wrong let the checksum land on the last level's
 * score and silently corrupt it, which the round-trip test now pins.
 */
const HEADER_V1 = 6;
const HEADER_V2 = 8;
/** A level played flawless: the only byte that restores as mastered. */
const FLAWLESS_BYTE = 101;
/** What an older code's ambiguous 100 restores as: the lowest best that rounds to it. */
const AMBIGUOUS_HUNDRED = 99.5;

/** Sum of every preceding byte. Catches a truncated paste and most single-character slips. */
function checksum(bytes: Uint8Array, end: number): number {
  let sum = 0;
  for (let i = 0; i < end; i++) sum = (sum + (bytes[i] ?? 0)) & 0xff;
  return sum;
}

function clampLevel(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(SAVE_CODE.maxLevel, Math.floor(value)));
}

export function encodeSaveCode(data: SaveData): string {
  const unlocked = clampLevel(data.progress.unlocked);
  // One byte per level from 1, holding a rounded accuracy (`accuracyByte`). Empty levels are zero, which
  // is what makes a 300-level save a few hundred characters instead of a few thousand.
  const cleared = Object.keys(data.progress.best)
    .map(Number)
    .filter(level => Number.isInteger(level) && level >= 1 && level <= SAVE_CODE.maxLevel);
  const top = cleared.length === 0 ? 0 : Math.max(...cleared);
  const bytes = new Uint8Array(HEADER_V2 + top + 1);
  bytes[0] = SAVE_CODE.version;
  bytes[1] = unlocked & 0xff;
  bytes[2] = (unlocked >> 8) & 0xff;
  // Calibration is signed and bounded to ±500 ms by `clampCalibration`, so it fits.
  const calibration = Math.max(-32768, Math.min(32767, Math.round(data.settings.calibrationMs)));
  const unsigned = calibration < 0 ? calibration + 0x10000 : calibration;
  bytes[3] = unsigned & 0xff;
  bytes[4] = (unsigned >> 8) & 0xff;
  bytes[5] = (data.settings.muted ? FLAG_MUTED : 0)
    | (data.settings.haptics ? FLAG_HAPTICS : 0)
    | (data.tutorialComplete ? FLAG_TUTORIAL : 0);
  // Whole percent. `clampVolume` is the same rounding the slider stores, so a code and
  // the device it came from cannot disagree by a step.
  bytes[6] = Math.round(clampVolume(data.settings.music) * 100);
  bytes[7] = Math.round(clampVolume(data.settings.sfx) * 100);
  for (let level = 1; level <= top; level++) bytes[HEADER_V2 - 1 + level] = accuracyByte(data.progress.best[level]);
  bytes[bytes.length - 1] = checksum(bytes, bytes.length - 1);
  return group(toBase32(bytes));
}

export function decodeSaveCode(code: string): SaveCodeResult {
  const cleaned = code.trim().toUpperCase().replace(/[\s-]/g, '');
  if (cleaned === '') return { ok: false, reason: 'empty' };
  const read = fromBase32(cleaned);
  // A character outside the alphabet means this was never a save code. A character that
  // *is* in the alphabet but leaves rubbish in the padding is a save code with a slip in
  // it, and telling a player to check their typing beats telling them it is not a code.
  if (read === null) return { ok: false, reason: 'malformed' };
  // Long enough to be a version 1 code. A shorter one never was; a version 2 code that
  // is only this long fails once the version is known, below.
  if (read.bytes.length < HEADER_V1 + 1) return { ok: false, reason: 'malformed' };
  const bytes = read.bytes;
  if (!read.canonical || checksum(bytes, bytes.length - 1) !== bytes[bytes.length - 1]) {
    return { ok: false, reason: 'checksum' };
  }
  const version = bytes[0];
  if (version !== 1 && version !== SAVE_CODE.version) return { ok: false, reason: 'version' };
  const header = version === 1 ? HEADER_V1 : HEADER_V2;
  if (bytes.length < header + 1) return { ok: false, reason: 'malformed' };
  const unlocked = clampLevel((bytes[1] ?? 0) | ((bytes[2] ?? 0) << 8));
  const raw = (bytes[3] ?? 0) | ((bytes[4] ?? 0) << 8);
  const calibrationMs = raw >= 0x8000 ? raw - 0x10000 : raw;
  const flags = bytes[5] ?? 0;
  const best: Record<number, number> = {};
  const levels = bytes.length - header - 1;
  for (let level = 1; level <= levels; level++) {
    const value = bytes[header - 1 + level] ?? 0;
    if (value > 0) best[level] = accuracyFromByte(value);
  }
  return {
    ok: true,
    data: {
      progress: { unlocked, best },
      settings: {
        calibrationMs,
        muted: (flags & FLAG_MUTED) !== 0,
        // A version 1 code has no levels to restore. Full is what that mute was covering.
        music: version === 1 ? 1 : clampVolume((bytes[6] ?? 0) / 100),
        sfx: version === 1 ? 1 : clampVolume((bytes[7] ?? 0) / 100),
        haptics: (flags & FLAG_HAPTICS) !== 0,
      },
      tutorialComplete: (flags & FLAG_TUTORIAL) !== 0,
    },
  };
}

/**
 * A level's best as one byte. Whole percent, except that 100 is never written: a flawless
 * level is `FLAWLESS_BYTE` and anything short of it is at most 99, because rounding a 99.6
 * up to 100 used to restore as a mastered level (`game/mastery.ts`). Every star threshold
 * is a whole percent at or under 93, so capping at 99 costs no star. An older build reads
 * 101 with `Math.min(100, value)`, so its restore of a newer code is what it always was.
 */
function accuracyByte(best: number | undefined): number {
  if (typeof best !== 'number' || !Number.isFinite(best)) return 0;
  if (best >= MASTERED_ACCURACY) return FLAWLESS_BYTE;
  return Math.max(0, Math.min(MASTERED_ACCURACY - 1, Math.round(best)));
}

/**
 * The inverse. A byte of exactly 100 comes only from a code written before the flawless
 * byte existed, where it means somewhere from 99.5 to 100: it is read as the bottom of that
 * range, which keeps the level's three stars and claims no mastery the code cannot prove.
 * A byte above 101 is written by nothing and is read the same cautious way.
 */
function accuracyFromByte(value: number): number {
  if (value === FLAWLESS_BYTE) return MASTERED_ACCURACY;
  return value >= MASTERED_ACCURACY ? AMBIGUOUS_HUNDRED : value;
}

/** Dashes every few characters. Purely so a long code can be read and checked by eye. */
function group(text: string): string {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += SAVE_CODE.group) parts.push(text.slice(i, i + SAVE_CODE.group));
  return parts.join('-');
}

function toBase32(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(buffer >> bits) & 31];
    }
  }
  // Whatever is left is padded with zero bits rather than with a pad character, so the
  // code carries no `=` for a player to lose in an email client.
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

/**
 * Null when a character is not in the alphabet at all. `canonical` is false when every
 * character was legal but the trailing padding bits were not zero — see `decodeSaveCode`
 * for why those two are different answers.
 */
function fromBase32(text: string): { readonly bytes: Uint8Array; readonly canonical: boolean } | null {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of text) {
    const value = DECODE.get(character);
    if (value === undefined) return null;
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  // The trailing bits are padding and `toBase32` always writes them as zero. Anything else
  // is a character that was mistyped into the padding, where it changes no byte and the
  // checksum therefore cannot see it — the one single-character slip that would otherwise
  // be accepted in silence. Rejecting a non-canonical tail is what RFC 4648 recommends.
  const canonical = bits === 0 || (buffer & ((1 << bits) - 1)) === 0;
  return { bytes: new Uint8Array(out), canonical };
}
