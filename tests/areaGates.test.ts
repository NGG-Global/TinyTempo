import { describe, expect, it, vi } from 'vitest';
import {
  areaOpened, badgeAreas, badgeName, baselineRecord, GATE_RECORD_KEY, gateState, loadGateRecord, loadGates, lowestUnopened,
  openArea, ownsAreaBadge, recordGateBaseline, withOpened,
} from '../src/game/areaGates';
import { AREAS } from '../src/game/levels';
import type { Progress } from '../src/game/progress';
import { starsRequired } from '../src/game/stars';

vi.mock('phaser', () => ({ default: {} }));

function memory(initial: Record<string, string> = {}): Storage & { readonly data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    get length() { return Object.keys(data).length; },
    clear: () => { for (const key of Object.keys(data)) delete data[key]; },
    getItem: key => data[key] ?? null,
    key: i => Object.keys(data)[i] ?? null,
    removeItem: key => { delete data[key]; },
    setItem: (key, value) => { data[key] = String(value); },
  };
}

/** Levels 1..n cleared at an accuracy, the frontier on n + 1. */
function cleared(n: number, accuracy = 95): Progress {
  const best: Record<number, number> = {};
  for (let level = 1; level <= n; level++) best[level] = accuracy;
  return { unlocked: n + 1, best };
}

describe('tap-to-open gates', () => {
  it('holds a met gate as ready until it is tapped, and only then opens it', () => {
    const progress = cleared(10);
    const fresh = { opened: 0 };
    // Ten three-star levels meet the first gate's 12, but nobody has tapped it.
    expect(gateState(1, 30, progress, fresh)).toBe('ready');
    expect(gateState(1, starsRequired(1) - 1, progress, fresh)).toBe('closed');
    expect(lowestUnopened(progress, fresh)).toBe(1);
    const opened = withOpened(fresh, 1);
    expect(gateState(1, 30, progress, opened)).toBe('open');
    expect(lowestUnopened(progress, opened)).toBe(2);
    // The first area has no gate.
    expect(gateState(0, 0, cleared(0), fresh)).toBe('open');
  });

  it('never leaves a gate standing behind a player who has already gone past it', () => {
    // A save code carrying the frontier to level 25 opens areas 1 and 2 whatever the record says.
    const restored = cleared(24);
    const none = { opened: 0 };
    expect(areaOpened(1, restored, none)).toBe(true);
    expect(areaOpened(2, restored, none)).toBe(true);
    expect(gateState(2, 0, restored, none)).toBe('open');
    // Standing on an area's first level is not having gone past it: that gate is still the player's to open.
    expect(areaOpened(3, cleared(30), none)).toBe(false);
  });

  it('starts a device at every gate its stars already meet, and writes that once', () => {
    const storage = memory();
    const progress = cleared(30);
    const baseline = baselineRecord(progress);
    expect(baseline.opened).toBeGreaterThanOrEqual(3);
    expect(recordGateBaseline(progress, storage)).toEqual(baseline);
    expect(JSON.parse(storage.data[GATE_RECORD_KEY]!)).toMatchObject({ opened: baseline.opened });
    // A later launch with more stars keeps the stored record: the new gates are the player's to tap.
    expect(recordGateBaseline(cleared(60), storage)).toEqual(baseline);
    // A brand-new player starts with nothing but the first area.
    expect(recordGateBaseline(cleared(0), memory())).toEqual({ opened: 0 });
  });

  it('only ever raises the record, and reads damage as no record', () => {
    const storage = memory({ [GATE_RECORD_KEY]: JSON.stringify({ version: 1, opened: 0 }) });
    const progress = cleared(10);
    expect(openArea(1, progress, storage)).toEqual({ record: { opened: 1 }, saved: true });
    expect(openArea(0, progress, storage).record).toEqual({ opened: 1 });
    expect(loadGates(progress, storage)).toEqual({ opened: 1 });
    for (const bad of ['{"opened":-1}', '{"opened":1.5}', 'not json', '{"opened":"3"}', '[]']) {
      expect(loadGateRecord(memory({ [GATE_RECORD_KEY]: bad }))).toBeNull();
    }
    expect(loadGateRecord(null)).toBeNull();
    expect(openArea(2, progress, null).saved).toBe(false);
  });

  it('gives each area a badge once it is opened, and the first area on the first cleared level', () => {
    const none = { opened: 0 };
    expect(ownsAreaBadge(0, cleared(0), none)).toBe(false);
    expect(ownsAreaBadge(0, cleared(1), none)).toBe(true);
    expect(ownsAreaBadge(1, cleared(10), none)).toBe(false);
    expect(ownsAreaBadge(1, cleared(10), { opened: 1 })).toBe(true);
    // The page shows the whole first lap, and past it as far as the next gate.
    expect(badgeAreas(cleared(3), none, AREAS.length)).toHaveLength(AREAS.length);
    expect(badgeAreas(cleared(160), none, AREAS.length).at(-1)).toBe(16);
    expect(badgeName(0)).toBe('Grass');
    expect(badgeName(AREAS.length)).toBe('Grass II');
  });
});
