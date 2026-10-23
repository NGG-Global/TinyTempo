import { describe, expect, it, vi } from 'vitest';
import { DAILY_REWARDS } from '../src/config/dailyTempo';
import { ladderHeading, ladderRows } from '../src/ui/rewardLadder';

vi.mock('phaser', () => ({ default: { Geom: { Rectangle: class {} } } }));

const T = [60, 72, 84] as const;

describe('the reward ladder', () => {
  it('names each tier, its glyphs and the accuracy that earns it', () => {
    const rows = ladderRows(T, 0, 0, null);
    expect(rows.map(row => row.stars)).toEqual([1, 2, 3]);
    expect(rows.map(row => row.threshold)).toEqual([60, 72, 84]);
    expect(rows.map(row => row.label)).toEqual(['+1 heart', '+1 restart', '+1 heart']);
    expect(rows[0]!.glyphs).toEqual(['heart', 'timer']);
    expect(rows[1]!.glyphs).toEqual(['restart', 'timer']);
    expect(rows[2]!.glyphs).toEqual(['heart', 'timer']);
    expect(DAILY_REWARDS.heartTiers).toEqual([1, 3]);
    expect(DAILY_REWARDS.restartTier).toBe(2);
  });

  it('on the card: pending rows with their thresholds, earlier ones ticked', () => {
    expect(ladderRows(T, 0, 0, null).map(row => [row.state, row.chip])).toEqual([['pending', '60%'], ['pending', '72%'], ['pending', '84%']]);
    expect(ladderRows(T, 2, 2, null).map(row => [row.state, row.chip])).toEqual([['earlier', 'EARLIER'], ['earlier', 'EARLIER'], ['pending', '84%']]);
    expect(ladderHeading(0, false)).toEqual({ title: 'Stars pay out today', aside: null });
    expect(ladderHeading(3, false)).toEqual({ title: 'Earned today', aside: null });
  });

  it('on the plaque: this run’s tiers paid, earlier ones earlier, the rest short with their thresholds', () => {
    // A first run of two stars.
    expect(ladderRows(T, 0, 2, 2).map(row => row.state)).toEqual(['paid', 'paid', 'short']);
    expect(ladderRows(T, 0, 2, 2)[2]!.chip).toBe('84%');
    // A later run of three stars, after two were paid.
    expect(ladderRows(T, 2, 3, 3).map(row => [row.state, row.chip])).toEqual([['earlier', 'EARLIER'], ['earlier', 'EARLIER'], ['paid', 'PAID']]);
    // A worse run pays nothing new: everything paid is earlier, the rest short.
    expect(ladderRows(T, 2, 2, 1).map(row => row.state)).toEqual(['earlier', 'earlier', 'short']);
    // A run of none.
    expect(ladderRows(T, 0, 0, 0).map(row => row.state)).toEqual(['short', 'short', 'short']);
    expect(ladderHeading(2, true)).toEqual({ title: 'Today’s rewards', aside: '2 of 3 paid' });
  });
});
