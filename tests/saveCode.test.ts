import { describe, expect, it } from 'vitest';
import { decodeSaveCode, encodeSaveCode, SAVE_CODE, type SaveData } from '../src/game/saveCode';

const save = (over: Partial<SaveData> = {}): SaveData => ({
  progress: { unlocked: 23, best: { 1: 92, 2: 78, 3: 100, 22: 61 } },
  settings: { calibrationMs: -42, muted: false, haptics: true },
  tutorialComplete: true,
  ...over,
});

describe('a save code', () => {
  it('round-trips everything the player earned', () => {
    const result = decodeSaveCode(encodeSaveCode(save()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual(save());
  });

  it('stays short enough to paste, and short enough to read out', () => {
    // A typical player, and a player far past where the difficulty curve saturates.
    const typical = encodeSaveCode(save());
    const best: Record<number, number> = {};
    for (let i = 1; i <= 300; i++) best[i] = 60 + (i * 7) % 40;
    const deep = encodeSaveCode(save({ progress: { unlocked: 301, best } }));
    expect(typical.length).toBeLessThan(60);
    expect(deep.length).toBeLessThan(600);
  });

  it('carries what the player earned and nothing they owe or own', () => {
    // Hearts, the refill and daily ledgers and the premium cache are deliberately absent:
    // restoring them is either an exploit or an incoherence. This asserts the shape,
    // so a later field cannot be added to the code without this failing.
    const result = decodeSaveCode(encodeSaveCode(save()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.data).sort()).toEqual(['progress', 'settings', 'tutorialComplete']);
    expect(Object.keys(result.data.settings).sort()).toEqual(['calibrationMs', 'haptics', 'muted']);
    expect(JSON.stringify(result.data)).not.toMatch(/heart|premium|refill|entitle/i);
  });
});

describe('reading a code a human handled', () => {
  it('ignores case, spacing and the grouping dashes', () => {
    const code = encodeSaveCode(save());
    const mangled = ` ${code.toLowerCase().replace(/-/g, ' ')} `;
    const result = decodeSaveCode(mangled);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(save());
  });

  it('accepts the four characters that get misread', () => {
    // Crockford's rule: I and L were meant to be 1, O was meant to be 0.
    const code = encodeSaveCode(save());
    const swapped = code.replace(/1/g, 'I').replace(/0/g, 'O');
    const result = decodeSaveCode(swapped);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(save());
  });

  it('never emits a confusable character in the first place', () => {
    const best: Record<number, number> = {};
    for (let i = 1; i <= 200; i++) best[i] = (i * 37) % 101;
    const code = encodeSaveCode(save({ progress: { unlocked: 201, best } }));
    expect(code.replace(/-/g, '')).not.toMatch(/[ILOU]/);
  });
});

describe('a code that is wrong', () => {
  it('refuses an empty one rather than restoring a blank save', () => {
    expect(decodeSaveCode('')).toEqual({ ok: false, reason: 'empty' });
    expect(decodeSaveCode('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('refuses characters that are not in the alphabet', () => {
    const result = decodeSaveCode('ABC$%^');
    expect(result).toEqual({ ok: false, reason: 'malformed' });
  });

  it('refuses a truncated code', () => {
    const code = encodeSaveCode(save()).replace(/-/g, '');
    expect(decodeSaveCode(code.slice(0, 4)).ok).toBe(false);
  });

  it('catches a single mistyped character instead of restoring a wrong save', () => {
    // The checksum is the whole reason a player can trust what they pasted, so this
    // sweeps every position against every character in the alphabet rather than a sample.
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    const code = encodeSaveCode(save()).replace(/-/g, '');
    const expected = JSON.stringify(save());
    let caught = 0;
    let missed = 0;
    for (let i = 0; i < code.length; i++) {
      for (const swap of alphabet) {
        if (code[i] === swap) continue;
        const typo = code.slice(0, i) + swap + code.slice(i + 1);
        const result = decodeSaveCode(typo);
        if (!result.ok || JSON.stringify(result.data) !== expected) caught += 1;
        else missed += 1;
      }
    }
    expect(missed).toBe(0);
    expect(caught).toBe(code.length * (alphabet.length - 1));
  });

  it('refuses a code whose padding bits carry something', () => {
    // The last character holds a few real bits and the rest is padding, which the encoder
    // always writes as zero. A typo landing only in that padding changes no byte, so the
    // checksum cannot see it — this is what stops it being accepted in silence.
    const code = encodeSaveCode(save()).replace(/-/g, '');
    const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    const last = ALPHABET.indexOf(code[code.length - 1] ?? '0');
    expect(last).toBeGreaterThanOrEqual(0);
    // 29 bytes is 232 bits against 47 characters' 235, so the low two bits are padding.
    const nudged = code.slice(0, -1) + ALPHABET[last ^ 0b10];
    // Reported as a typo rather than as a malformed string: it is a real code with one
    // character wrong in it, and that is what the player needs to be told to look for.
    expect(decodeSaveCode(nudged)).toEqual({ ok: false, reason: 'checksum' });
    expect(decodeSaveCode(code).ok).toBe(true);
  });

  it('refuses a code from a future format rather than guessing at it', () => {
    const bytes = new Uint8Array(7);
    bytes[0] = SAVE_CODE.version + 1;
    let sum = 0;
    for (let i = 0; i < 6; i++) sum = (sum + (bytes[i] ?? 0)) & 0xff;
    bytes[6] = sum;
    // Encode by hand, since `encodeSaveCode` only ever writes the current version.
    const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let out = '';
    let buffer = 0;
    let bits = 0;
    for (const byte of bytes) {
      buffer = (buffer << 8) | byte;
      bits += 8;
      while (bits >= 5) { bits -= 5; out += ALPHABET[(buffer >> bits) & 31]; }
    }
    if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
    expect(decodeSaveCode(out)).toEqual({ ok: false, reason: 'version' });
  });
});

describe('values at their limits', () => {
  it('survives a player with nothing cleared', () => {
    const empty = save({ progress: { unlocked: 1, best: {} }, tutorialComplete: false });
    const result = decodeSaveCode(encodeSaveCode(empty));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(empty);
  });

  it('keeps a negative calibration negative', () => {
    for (const calibrationMs of [-500, -1, 0, 1, 500]) {
      const result = decodeSaveCode(encodeSaveCode(save({
        settings: { calibrationMs, muted: true, haptics: false },
      })));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.settings.calibrationMs).toBe(calibrationMs);
    }
  });

  it('keeps each switch independent', () => {
    for (const muted of [false, true]) for (const haptics of [false, true]) {
      const result = decodeSaveCode(encodeSaveCode(save({
        settings: { calibrationMs: 0, muted, haptics },
      })));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.settings).toEqual({ calibrationMs: 0, muted, haptics });
    }
  });

  it('does not trust a level or an accuracy beyond its range', () => {
    const result = decodeSaveCode(encodeSaveCode(save({
      progress: { unlocked: 9_999_999, best: { 1: 250, 2: -30, 3: Number.NaN } },
    })));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.progress.unlocked).toBe(SAVE_CODE.maxLevel);
    expect(result.data.progress.best[1]).toBe(100);
    // A nonsense accuracy encodes as zero, which reads back as "not cleared".
    expect(result.data.progress.best[2]).toBeUndefined();
    expect(result.data.progress.best[3]).toBeUndefined();
  });
});
