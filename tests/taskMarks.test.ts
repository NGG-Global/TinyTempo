import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { TRACK } from '../src/ui/trackMetrics';

/** The task marks' metrics as PlayScene declares them, read from the source so they are pinned, not duplicated. */
function taskMark(): { radius: number; current: number; gap: number } {
  const src = readFileSync('src/scenes/PlayScene.ts', 'utf8');
  const block = src.slice(src.indexOf('const TASK_MARK = {'), src.indexOf('} as const;', src.indexOf('const TASK_MARK = {')));
  const read = (key: string): number => Number(new RegExp(`${key}: ([0-9.]+)`).exec(block)?.[1]);
  return { radius: read('radius'), current: read('current'), gap: read('gap') };
}

describe('the task marks', () => {
  it('are beads: a little under a count-in pip, the current one a little over, and never touching', () => {
    const m = taskMark();
    expect(m.radius).toBeLessThan(TRACK.pipRadius);
    expect(m.current).toBeGreaterThan(TRACK.pipRadius);
    // At least a full current bead of clear sheet between neighbours.
    expect(m.gap - m.current * 2).toBeGreaterThanOrEqual(m.current);
  });

  it('keep an eight-task row with its breather tick inside the top row\u2019s clear middle', () => {
    const m = taskMark();
    // Eight beads, plus the breather's half-gap either side of its tick, across a 720 frame
    // whose pucks (radius 34, inset 28) leave a clear middle of about 440 design units.
    const row = 7 * m.gap + m.gap * 0.6 + m.current * 2;
    expect(row).toBeLessThan(440);
  });
});
