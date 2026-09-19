import { describe, expect, it, vi } from 'vitest';
import {
  advanceBite, acceptDemoBeat, BLADE, bladeBackLine, bladeOutline, bladeSpan, bladeVisibleDepth, drawBack, dustFall, dustPile,
  kerfDepth, REFERENCE_BEAT, SAW_MOTION, sawDirection, sawRock, sawTiming, strokeTravel,
} from '../src/vignettes/sawMotion';
import { synthesizeSaw } from '../src/audio/sawSounds';
import { levelSpec } from '../src/game/levels';
import { VIGNETTES } from '../src/vignettes/registry';

// Phaser reads `window` at module init; the registry pulls it in for real. Same stub as
// tests/levels.test.ts, which imports the registry through the level generator.
vi.mock('phaser', () => ({ default: {} }));

describe('saw presentation curves', () => {
  it('alternates push and pull from the action count alone', () => {
    expect([0, 1, 2, 3, 4, 5].map(sawDirection)).toEqual([1, -1, 1, -1, 1, -1]);
    // The count is read before the first stroke and after many, so it must be total.
    expect(sawDirection(-1)).toBe(-1);
    expect(sawDirection(-2)).toBe(1);
    expect(sawDirection(1000)).toBe(1);
    expect(sawDirection(1001)).toBe(-1);
  });
  it('puts maximum engagement on the beat and chains one stroke into the next', () => {
    const t = sawTiming();
    // The stroke was tuned at 120 BPM; the reference timing must still be those seconds.
    expect(REFERENCE_BEAT).toBe(0.5);
    expect(t).toEqual({ drawBackSec: 0.15, biteHoldSec: 0.028, followThroughSec: 0.19, dustSec: 0.42 });
    expect(strokeTravel(0)).toBe(0);
    expect(strokeTravel(t.biteHoldSec)).toBe(0);
    expect(strokeTravel(t.followThroughSec)).toBeCloseTo(1);
    expect(strokeTravel(100)).toBe(1);
    expect(strokeTravel(-1)).toBe(0);
    // A stroke resting at the end of its travel is the next stroke's fully drawn back.
    expect(drawBack(t.drawBackSec)).toBe(-1);
    expect(drawBack(0)).toBeCloseTo(0);
    expect(drawBack(t.drawBackSec * 0.5)).toBeGreaterThan(-1);
    // A quick pair reverses from wherever the previous follow-through had reached.
    expect(drawBack(t.drawBackSec, -0.3)).toBeCloseTo(-0.3);
    expect(drawBack(0, -0.3)).toBeCloseTo(0);
  });
  it('tightens with the tempo so a stroke never outlives a half beat', () => {
    // The tightest authored interval is a half beat at every tempo, so the follow-through
    // must be shorter than that as a fraction of the beat, not merely at 120 BPM.
    expect(SAW_MOTION.followThroughBeats).toBeLessThan(0.5);
    for (const bpm of [120, 132, 150]) {
      const beat = 60 / bpm;
      const t = sawTiming(beat);
      expect(t.followThroughSec).toBeLessThan(beat / 2);
      expect(strokeTravel(t.followThroughSec, beat)).toBeCloseTo(1);
      expect(strokeTravel(t.biteHoldSec, beat)).toBe(0);
      expect(drawBack(t.drawBackSec, -1, beat)).toBe(-1);
      expect(dustFall(100, beat)).toBe(dustFall(t.dustSec, beat));
    }
    // At the plateau ceiling the margin is no longer 10 ms.
    expect(sawTiming(60 / 150).followThroughSec).toBeCloseTo(0.152);
  });
  it('never shows the blade below the depth it has actually sawn', () => {
    expect(kerfDepth(0, 3)).toBe(0);
    expect(kerfDepth(3, 3)).toBeCloseTo(SAW_MOTION.kerfAtFullResponse);
    expect(kerfDepth(2, 3)).toBeLessThan(kerfDepth(3, 3));
    // A flawless response stops short of severing; the unscored coda finishes it.
    expect(kerfDepth(3, 3)).toBeLessThan(1);
    expect(kerfDepth(9, 3)).toBe(kerfDepth(3, 3));
    expect(kerfDepth(-1, 3)).toBe(0);
    expect(kerfDepth(1, 0)).toBe(SAW_MOTION.kerfAtFullResponse);
    expect(bladeVisibleDepth(0)).toBe(0);
    expect(bladeVisibleDepth(1)).toBe(SAW_MOTION.boardThickness);
    expect(bladeVisibleDepth(3)).toBe(bladeVisibleDepth(1));
    expect(bladeVisibleDepth(-1)).toBe(0);
    expect(bladeVisibleDepth(kerfDepth(3, 3))).toBeLessThan(SAW_MOTION.boardThickness);
  });
  it('only cuts on an accurate stroke and never invents one', () => {
    expect(advanceBite(2, 'hit')).toBe(3);
    // An extra tap skids and a missed target judders; neither deepens the kerf.
    expect(advanceBite(2, 'extra')).toBe(2);
    expect(advanceBite(2, 'omission')).toBe(2);
  });
  it('draws a demonstration beat once however often it is delivered', () => {
    const first = acceptDemoBeat(-Infinity, 4);
    expect(first).toBe(4);
    // Rendering re-scans the plan's cues every frame and the host forwards the cue too.
    expect(acceptDemoBeat(first!, 4)).toBeNull();
    expect(acceptDemoBeat(first!, 3.5)).toBeNull();
    expect(acceptDemoBeat(first!, 4.5)).toBe(4.5);
  });
  it('rocks about the bite with the stroke and heaps dust only as the kerf deepens', () => {
    expect(sawRock(0)).toBe(0);
    expect(Math.abs(sawRock(SAW_MOTION.travel))).toBeCloseTo(SAW_MOTION.rockRad);
    expect(sawRock(SAW_MOTION.travel)).toBeCloseTo(-sawRock(-SAW_MOTION.travel));
    // Overshoot never rocks further than a full stroke.
    expect(Math.abs(sawRock(SAW_MOTION.travel * 5))).toBeCloseTo(SAW_MOTION.rockRad);
    expect(SAW_MOTION.rockRad).toBeLessThan(0.1);
    expect(dustPile(0)).toEqual({ width: 0, height: 0 });
    expect(dustPile(-1)).toEqual({ width: 0, height: 0 });
    expect(dustPile(1)).toEqual({ width: SAW_MOTION.pileWidth, height: SAW_MOTION.pileHeight });
    expect(dustPile(2)).toEqual(dustPile(1));
    expect(dustPile(0.5).width).toBeGreaterThan(dustPile(0.25).width);
  });
  it('keeps the dust plume bounded and grounded', () => {
    expect(dustFall(-1)).toBe(0);
    expect(dustFall(0)).toBe(0);
    expect(dustFall(sawTiming().dustSec / 2)).toBeLessThan(dustFall(sawTiming().dustSec));
    expect(dustFall(100)).toBe(dustFall(sawTiming().dustSec));
  });
  it('cycles by registry order alone', () => {
    // levelSpec picks VIGNETTES[(level - 1) % VIGNETTES.length], so registry order is the
    // rotation. Reordering or inserting an entry silently reassigns every level's vignette;
    // cucumber, banana and paper were each appended so the earlier levels kept theirs.
    expect(VIGNETTES.map(v => v.id)).toEqual([
      'hammer', 'window', 'bug', 'saw', 'tomato', 'curl', 'cucumber', 'banana', 'paper',
      'egg', 'bubble', 'light', 'doorbell', 'roller', 'bell', 'balloon', 'stapler',
    ]);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 1 + VIGNETTES.length, 9 + VIGNETTES.length].map(level => levelSpec(level).vignette))
      .toEqual(['hammer', 'window', 'bug', 'saw', 'tomato', 'curl', 'cucumber', 'banana', 'paper', 'hammer', 'paper']);
  });
  it.each(['action', 'success', 'rough', 'scrape', 'judder'] as const)('synthesizes a bounded deterministic %s buffer', kind => {
    const samples = synthesizeSaw(48000, kind);
    expect(samples.length).toBeGreaterThan(8000);
    expect(samples[0]).toBe(0);
    expect(Array.from(samples.subarray(1, 96)).some(value => Math.abs(value) > 0.01)).toBe(true);
    expect(samples.every(value => Number.isFinite(value) && Math.abs(value) <= 1)).toBe(true);
    expect(samples.some(value => Math.abs(value) > 0.1)).toBe(true);
    expect(synthesizeSaw(48000, kind)).toEqual(samples);
  });
});

describe('the blade is one rigid piece of steel', () => {
  // The same mapping the vignette draws with: axis runs along the teeth, off rises
  // perpendicular to them, and the board's top face is y = 0.
  const at = (axis: number, off: number): { x: number; y: number } => {
    const c = Math.cos(-SAW_MOTION.bladeTiltRad), s = Math.sin(-SAW_MOTION.bladeTiltRad);
    return { x: axis * c + off * s, y: axis * s - off * c };
  };
  const strokes = [-SAW_MOTION.travel, -100, -37, 0, 37, 100, SAW_MOTION.travel];

  it('moves both ends by the whole stroke, so the steel never changes length', () => {
    // The defect this replaces: the toe was pinned at the kerf and only the heel
    // travelled, which stretched the drawn blade from 278 to 582 units across one stroke.
    const rest = bladeSpan(0);
    for (const slide of strokes) {
      const span = bladeSpan(slide);
      expect(span.toe).toBeCloseTo(rest.toe + slide);
      expect(span.heel).toBeCloseTo(rest.heel + slide);
      expect(span.heel - span.toe).toBeCloseTo(BLADE.heel - BLADE.toe);
      expect(span.mid).toBeCloseTo(rest.mid + slide);
    }
  });

  it('phases the teeth to the blade, so they travel with it instead of standing still', () => {
    for (const slide of strokes) {
      const span = bladeSpan(slide);
      // Every tooth sits a whole number of steps from the toe: they are cut into the
      // steel, not into the wood.
      const steps = (span.firstTooth - span.toe - BLADE.toothInset) / BLADE.toothStep;
      expect(steps).toBeCloseTo(Math.round(steps));
      expect(steps).toBeGreaterThanOrEqual(0);
      // The first one still above the wood, and no earlier.
      expect(span.firstTooth).toBeGreaterThanOrEqual(span.toothCut);
      expect(span.firstTooth - BLADE.toothStep).toBeLessThan(span.toothCut);
    }
    // A stroke of one whole tooth pitch brings the comb back into phase; anything else
    // moves it. Pinned to the kerf it never moved at all.
    expect(bladeSpan(BLADE.toothStep).firstTooth).toBeCloseTo(bladeSpan(0).firstTooth);
    expect(bladeSpan(BLADE.toothStep / 2).firstTooth).not.toBeCloseTo(bladeSpan(0).firstTooth);
  });

  it('cuts the drawn blade off along the board’s top face, never below it', () => {
    for (const slide of strokes) {
      const outline = bladeOutline(bladeSpan(slide));
      expect(outline.length).toBeGreaterThanOrEqual(4);
      // No corner is below the face, so no uncut wood is ever covered by steel.
      for (const [axis, off] of outline) expect(at(axis, off).y).toBeLessThanOrEqual(0.001);
      // The cut end lies *on* the face rather than above it, which is what makes it
      // horizontal: the blade goes into the wood instead of stopping over it.
      const onFace = outline.filter(([axis, off]) => Math.abs(at(axis, off).y) < 0.001);
      expect(onFace.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('takes a fifth corner only when the toe itself has risen clear of the wood', () => {
    // Most of the stroke the toe end is entirely buried and the outline is a quad; at the
    // end of a push the toe's own edge shows above the board and the shape gains a corner.
    expect(bladeOutline(bladeSpan(0))).toHaveLength(4);
    expect(bladeOutline(bladeSpan(-SAW_MOTION.travel))).toHaveLength(4);
    expect(bladeOutline(bladeSpan(SAW_MOTION.travel)).length).toBeGreaterThanOrEqual(4);
    // Held clear of the board altogether, the whole rigid quad shows and nothing is cut.
    const clear = bladeSpan(-BLADE.toe + 400);
    expect(bladeOutline(clear)).toHaveLength(4);
    expect(bladeOutline(clear).map(([axis]) => axis)).toEqual([clear.toe, clear.heel, clear.heel, clear.toe]);
  });

  it('clips the lit line to the same face, and drops it once it is buried', () => {
    for (const slide of strokes) {
      const lit = bladeBackLine(bladeSpan(slide), 8);
      expect(lit).not.toBeNull();
      for (const [axis, off] of lit!) expect(at(axis, off).y).toBeLessThanOrEqual(0.001);
      // It ends at the heel, where the blade is deepest, and starts no earlier than the toe.
      expect(lit![1][0]).toBeCloseTo(bladeSpan(slide).heel);
      expect(lit![0][0]).toBeGreaterThanOrEqual(bladeSpan(slide).toe - 0.001);
    }
  });
});
