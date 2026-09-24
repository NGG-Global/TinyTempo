import { describe, expect, it } from 'vitest';
import {
  chipSeat, keepsakeCardHeight, KEEPSAKE_CARD, medalSeat, planResult, PLATE, RESULT_ROWS, trayRect, type ResultNeeds,
} from '../src/ui/resultLayout';

/** A star's extent round its centre: the top point, the two lower points, the widest arms. */
const starBox = (x: number, y: number, r: number) => ({ left: x - r * 0.951, right: x + r * 0.951, top: y - r, bottom: y + r * 0.809 });

describe('the plaque’s geometry', () => {
  it('seats every medal inside the tray, the middle one larger and raised', () => {
    const tray = trayRect();
    for (const k of [0, 1, 2] as const) {
      const seat = medalSeat(k), box = starBox(seat.x, seat.y, seat.radius);
      expect(box.left, `medal ${k}`).toBeGreaterThanOrEqual(tray.x);
      expect(box.right, `medal ${k}`).toBeLessThanOrEqual(tray.x + tray.width);
      expect(box.top, `medal ${k}`).toBeGreaterThanOrEqual(tray.y);
      const chip = chipSeat(k);
      expect(chip.x).toBe(seat.x);
      // The chip sits under its seat, clear of the star, and inside the tray.
      expect(chip.y - chip.height / 2).toBeGreaterThan(box.bottom);
      expect(chip.y + chip.height / 2).toBeLessThanOrEqual(tray.y + tray.height);
      expect(Math.abs(chip.x) + chip.width / 2).toBeLessThanOrEqual(tray.x + tray.width);
    }
    expect(medalSeat(1).radius).toBeGreaterThan(medalSeat(0).radius);
    expect(medalSeat(1).y).toBeLessThan(medalSeat(0).y);
    expect(medalSeat(0).radius).toBe(medalSeat(2).radius);
    expect(medalSeat(0).x).toBe(-medalSeat(2).x);
    // Neighbouring medals do not touch.
    const outer = starBox(medalSeat(0).x, medalSeat(0).y, medalSeat(0).radius);
    const middle = starBox(medalSeat(1).x, medalSeat(1).y, medalSeat(1).radius);
    expect(outer.right).toBeLessThan(middle.left);
  });

  it('keeps the tray inside the plaque, and the ropes on its outer thirds, clear of the tray', () => {
    const tray = trayRect();
    expect(tray.x).toBe(-PLATE.width / 2 + PLATE.tray.inset);
    expect(tray.x + tray.width).toBe(PLATE.width / 2 - PLATE.tray.inset);
    expect(tray.y + tray.height).toBeLessThan(PLATE.scoreY - PLATE.scoreSize / 2);
    expect(PLATE.ropeX).toBeGreaterThan(PLATE.width / 6);
    expect(PLATE.ropeX).toBeLessThan(PLATE.width / 2 - 40);
    // A rope ends in its eye on the plaque's top edge; the tray starts well below it.
    expect(tray.y).toBeGreaterThan(PLATE.ropeEye * 2);
  });
});

const FRAMES = [
  { name: '360 × 640', s: 1, width: 720, height: 1280 },
  { name: '393 × 851', s: 1, width: 720, height: 1559 },
  { name: '430 × 932', s: 1, width: 720, height: 1560 },
  { name: 'tablet', s: 1.113, width: 960, height: 1280 },
] as const;

/** The frame PlayScene hands the planner, from its own layout rules. */
function frameFor(f: typeof FRAMES[number]) {
  const blockH = Math.max(96 * f.s, 88 * f.s);
  const blockTop = f.height - 72 * f.s - blockH;
  return { s: f.s, width: f.width - 40 * f.s, top: 190 * f.s, preferredTop: 300 * f.s, blockTop, replayHeight: Math.max(88 * f.s, 88) };
}

/**
 * Every combination a result can show. A heart is refunded only on three stars
 * (`finishAttempt`), and the next-star strip and the replay block only appear short of
 * three, so the refund plate never shares the screen with either; a keepsake needs three
 * stars too. The first keepsake's longer note is measured at three lines at the card's width.
 */
function allNeeds(s: number): ResultNeeds[] {
  const out: ResultNeeds[] = [];
  const firstNote = keepsakeCardHeight(KEEPSAKE_CARD.noteTop * s + 3 * 28 * s, s);
  for (const finale of [false, true]) {
    out.push({ refund: false, finale, strip: true, keepsake: 0, replay: true });
    out.push({ refund: false, finale, strip: true, keepsake: 0, replay: false });
    for (const refund of [false, true]) {
      out.push({ refund, finale, strip: false, keepsake: firstNote, replay: false });
      out.push({ refund, finale, strip: false, keepsake: 0, replay: false });
    }
  }
  return out;
}

describe('the result stack', () => {
  it('fits the plaque, its rows and the replay block above Continue on every frame', () => {
    for (const f of FRAMES) for (const needs of allNeeds(f.s)) {
      const frame = frameFor(f), plan = planResult(frame, needs);
      const label = `${f.name} ${JSON.stringify(needs)}`;
      expect(plan.anchorY, label).toBeGreaterThanOrEqual(frame.top);
      expect(plan.rope, label).toBeGreaterThanOrEqual(PLATE.minRope * f.s);
      expect(plan.k, label).toBeGreaterThanOrEqual(PLATE.minScale);
      expect(plan.k, label).toBeLessThanOrEqual(1);
      expect(plan.plaqueBottom, label).toBeCloseTo(plan.anchorY + plan.rope + plan.plaqueHeight, 6);
      // Rows run down from the plaque in order, a gap apart, and never overlap.
      let cursor = plan.plaqueBottom;
      for (const row of plan.rows) {
        expect(row.y, label).toBeGreaterThanOrEqual(cursor + RESULT_ROWS.gap * f.s - 1e-6);
        cursor = row.y + row.height;
      }
      const floor = plan.replayY ?? frame.blockTop;
      expect(cursor, label).toBeLessThanOrEqual(floor);
      if (needs.replay) expect(plan.replayY! + frame.replayHeight, label).toBeLessThan(frame.blockTop);
      else expect(plan.replayY, label).toBeNull();
      expect(plan.rows.map(r => r.kind), label).toEqual([
        ...(needs.finale ? ['finale'] : []), ...(needs.strip ? ['strip'] : []), ...(needs.keepsake > 0 ? ['keepsake'] : []),
      ]);
    }
  });

  it('only shrinks the plaque when the frame is short, and hangs it the same way when it is not', () => {
    const tall = planResult(frameFor(FRAMES[1]), { refund: false, finale: false, strip: true, keepsake: 0, replay: true });
    expect(tall.k).toBe(1);
    expect(tall.rope).toBe(PLATE.ropeLength);
    // Finale, strip and replay on a 16:9 phone fit on a shorter rope alone.
    const roped = planResult(frameFor(FRAMES[0]), { refund: false, finale: true, strip: true, keepsake: 0, replay: true });
    expect(roped.k).toBe(1);
    expect(roped.rope).toBeLessThan(PLATE.ropeLength);
    // A refunded heart, a finale and the first keepsake's card do not: rope goes first, then plaque.
    const card = keepsakeCardHeight(KEEPSAKE_CARD.noteTop + 3 * 28, 1);
    const short = planResult(frameFor(FRAMES[0]), { refund: true, finale: true, strip: false, keepsake: card, replay: false });
    expect(short.rope).toBe(PLATE.minRope);
    expect(short.k).toBeLessThan(1);
    // A narrow frame scales the plaque to its width rather than running it off the sides.
    const narrow = planResult({ ...frameFor(FRAMES[1]), width: 480 }, { refund: false, finale: false, strip: false, keepsake: 0, replay: false });
    expect(PLATE.width * narrow.k).toBeLessThanOrEqual(480 + 1e-9);
  });
});

describe('the keepsake card', () => {
  it('is never shorter than its words, at the smallest frames', () => {
    for (const s of [0.7, 0.85, 1, 1.2]) {
      for (let lines = 1; lines <= 6; lines++) {
        const noteBottom = KEEPSAKE_CARD.noteTop * s + lines * 28 * s;
        const height = keepsakeCardHeight(noteBottom, s);
        expect(height).toBeGreaterThanOrEqual(noteBottom + KEEPSAKE_CARD.pad * s);
        expect(height).toBeGreaterThanOrEqual(KEEPSAKE_CARD.height * s);
      }
    }
  });
});
