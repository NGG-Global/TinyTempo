import { describe, expect, it } from 'vitest';
import { FLAWLESS, flawlessPose, socketGlint, sweepBand } from '../src/ui/flourish';

describe('the word for a flawless task', () => {
  it('strikes in oversized from above and settles to rest inside its stamp', () => {
    const struck = flawlessPose(0)!;
    expect(struck.scale).toBeGreaterThan(1.5);
    expect(struck.rise).toBeLessThan(-20);
    const rested = flawlessPose(FLAWLESS.stamp * 1.5)!;
    expect(rested.scale).toBeCloseTo(1, 4);
    expect(rested.rise).toBeCloseTo(0, 4);
    expect(rested.alpha).toBeCloseTo(1, 4);
  });

  it('glows brightest mid-hold and leaves over the back of it, then is gone', () => {
    const mid = flawlessPose(FLAWLESS.hold / 2)!;
    expect(mid.glow).toBeGreaterThan(flawlessPose(FLAWLESS.stamp)!.glow);
    const leaving = flawlessPose(FLAWLESS.hold * 0.95)!;
    expect(leaving.alpha).toBeLessThan(mid.alpha);
    expect(flawlessPose(FLAWLESS.hold)).toBeNull();
    expect(flawlessPose(-0.1)).toBeNull();
    expect(flawlessPose(Infinity)).toBeNull();
  });

  it('is the word alone under reduced motion, and still leaves', () => {
    const still = flawlessPose(0.1, true)!;
    expect(still).toMatchObject({ scale: 1, rise: 0, tilt: 0, glow: 0 });
    expect(still.alpha).toBe(1);
    expect(flawlessPose(FLAWLESS.hold * 0.95, true)!.alpha).toBeLessThan(1);
  });
});

describe('the light crossing the face', () => {
  it('enters off the left edge, leaves off the right, and is brightest in the middle', () => {
    expect(sweepBand(0).at).toBeLessThan(0);
    expect(sweepBand(FLAWLESS.sweep * 0.999).at).toBeGreaterThan(1);
    expect(sweepBand(FLAWLESS.sweep / 2).alpha).toBeGreaterThan(sweepBand(FLAWLESS.sweep * 0.1).alpha);
    expect(sweepBand(FLAWLESS.sweep).alpha).toBe(0);
    expect(sweepBand(-1).alpha).toBe(0);
  });

  it('glints the sockets in order, each one after the last, and never before the band', () => {
    const count = 5;
    for (let i = 0; i < count; i++) expect(socketGlint(0, i, count)).toBe(-1);
    // Once the sweep is done every socket has at least begun.
    for (let i = 0; i < count; i++) expect(socketGlint(FLAWLESS.sweep, i, count)).toBeGreaterThanOrEqual(0);
    // Earlier sockets are further along at any instant.
    const t = FLAWLESS.sweep * 0.5;
    for (let i = 1; i < count; i++) expect(socketGlint(t, i, count)).toBeLessThanOrEqual(socketGlint(t, i - 1, count));
    // And each one is over.
    expect(socketGlint(FLAWLESS.sweep + FLAWLESS.glint + 1, count - 1, count)).toBe(1);
  });

  it('shows nothing for a flourish that has not happened', () => {
    expect(socketGlint(-Infinity, 0, 3)).toBe(-1);
    expect(socketGlint(Infinity, 0, 3)).toBe(1);
  });
});
