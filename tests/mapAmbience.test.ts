import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));
const { AMBIENCE, AMBIENCE_BY_AREA, lampBreath, motePose, moteSeed, seamFade } = await import('../src/ui/mapAmbience');
const { AREAS } = await import('../src/game/levels');

const view = { left: 0, top: 4000, width: 720, height: 1559 };

describe('the map\'s ambience', () => {
  it('has one kind per area, in the order the props use', () => {
    expect(AMBIENCE_BY_AREA).toHaveLength(AREAS.length);
    expect(AMBIENCE_BY_AREA).toEqual(['pollen', 'lamps', 'dust', 'snow', 'fireflies', 'petals', 'mist', 'leaves', 'embers']);
  });

  it('keeps every mote within the view and its margin, however long the map is open', () => {
    const m = AMBIENCE.margin;
    for (const kind of AMBIENCE_BY_AREA) {
      for (let i = 0; i < AMBIENCE.motes; i++) {
        for (const t of [0, 1.3, 60, 3600, 86400]) {
          const pose = motePose(kind, i, t, view, 1);
          if (!pose) continue;
          expect(pose.x).toBeGreaterThanOrEqual(view.left - m);
          expect(pose.x).toBeLessThan(view.left + view.width + m);
          expect(pose.y).toBeGreaterThanOrEqual(view.top - m);
          expect(pose.y).toBeLessThan(view.top + view.height + m);
          expect(pose.alpha).toBeGreaterThanOrEqual(0);
          expect(pose.alpha).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('dresses the four later areas each its own way', () => {
    const poses = (kind: 'petals' | 'mist' | 'leaves' | 'embers', t: number) =>
      Array.from({ length: AMBIENCE.motes }, (_, i) => motePose(kind, i, t, view, 1)!);
    // Mist is a bank, not a mote: large and faint.
    for (const pose of poses('mist', 7)) {
      expect(pose.scale).toBeGreaterThanOrEqual(1);
      expect(pose.alpha).toBeLessThanOrEqual(0.2);
    }
    // Leaves are the irregular flake, and they turn as they fall.
    const leaves = poses('leaves', 4), later = poses('leaves', 4.5);
    expect(leaves.every(pose => pose.flake)).toBe(true);
    expect(leaves.some((pose, i) => pose.angle !== later[i]!.angle)).toBe(true);
    // Embers glow, and drift up, never down (until they wrap, off screen).
    expect(poses('embers', 2).every(pose => pose.glow)).toBe(true);
    const rising = poses('embers', 2).filter((pose, i) => {
      const next = motePose('embers', i, 2 + 1 / 60, view, 1)!;
      return next.y < pose.y;
    });
    expect(rising.length).toBeGreaterThan(AMBIENCE.motes * 0.9);
    // Petals are not pollen in another colour: they are pinker and larger.
    const petal = poses('petals', 3)[0]!, pollen = motePose('pollen', 0, 3, view, 1)!;
    expect(petal.scale).toBeGreaterThan(pollen.scale);
    // Nothing but leaves turns or swaps texture.
    for (const kind of ['pollen', 'dust', 'snow', 'fireflies', 'petals', 'mist', 'embers'] as const) {
      expect(motePose(kind, 1, 3, view, 1)).toMatchObject({ flake: false, angle: 0 });
    }
  });

  it('stays at most forty on screen, and the lamps carry glows rather than motes', () => {
    expect(AMBIENCE.motes + AMBIENCE.lamps).toBeLessThanOrEqual(40);
    expect(motePose('lamps', 0, 1, view, 1)).toBeNull();
  });

  it('moves smoothly: a frame later, a mote has drifted a little, not jumped', () => {
    for (const kind of ['pollen', 'dust', 'snow', 'fireflies', 'petals', 'mist', 'leaves', 'embers'] as const) {
      for (let i = 0; i < AMBIENCE.motes; i++) {
        const a = motePose(kind, i, 10, view, 1)!, b = motePose(kind, i, 10 + 1 / 60, view, 1)!;
        // A wrap happens only off screen, so on screen the step is tiny.
        const onScreen = a.y > view.top && a.y < view.top + view.height && a.x > view.left && a.x < view.left + view.width;
        if (onScreen) expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(2);
      }
    }
  });

  it('is world-anchored: scrolling the view does not carry a mote with it', () => {
    const a = motePose('fireflies', 3, 5, view, 1)!;
    const b = motePose('fireflies', 3, 5, { ...view, top: view.top + 40 }, 1)!;
    // Either the same spot on the ground, or wrapped round off the other edge.
    expect(b.y === a.y || Math.abs(b.y - a.y) > view.height).toBe(true);
  });

  it('fades to nothing at an area\'s seams, so a kind never changes in view', () => {
    expect(seamFade(100, 100, 900, 1)).toBe(0);
    expect(seamFade(900, 100, 900, 1)).toBe(0);
    expect(seamFade(500, 100, 900, 1)).toBe(1);
    expect(seamFade(100 + AMBIENCE.seamFade / 2, 100, 900, 1)).toBeCloseTo(0.5, 9);
  });

  it('gives each mote and lamp its own stable phase', () => {
    expect(moteSeed(4)).toEqual(moteSeed(4));
    expect(moteSeed(4)).not.toEqual(moteSeed(5));
    for (const v of moteSeed(11)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
    const breaths = Array.from({ length: 200 }, (_, k) => lampBreath(k / 10, 2));
    expect(Math.min(...breaths)).toBeGreaterThan(0);
    expect(Math.max(...breaths)).toBeLessThan(0.4);
  });
});
