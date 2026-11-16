import { describe, expect, it } from 'vitest';
import { starMeterPose } from '../src/ui/starMeter';

const T = [60, 72, 84] as const;

describe('the star meter', () => {
  it('shows no number before the first task, and the bar empty', () => {
    const pose = starMeterPose(null, T);
    expect(pose).toMatchObject({ fill: 0, lit: 0, next: 60, label: '—', nextLabel: 'NEXT 60%' });
    expect(pose.notches).toEqual([0.6, 0.72, 0.84]);
  });

  it('fills to the accuracy, lights the stars it has passed and names the next', () => {
    expect(starMeterPose(76.4, T)).toMatchObject({ fill: 0.764, lit: 2, next: 84, label: '76%', nextLabel: 'NEXT 84%' });
    expect(starMeterPose(60, T)).toMatchObject({ lit: 1, next: 72 });
    expect(starMeterPose(59.9, T)).toMatchObject({ lit: 0, next: 60, label: '59%' });
    expect(starMeterPose(84, T)).toMatchObject({ lit: 3, next: null, nextLabel: 'ALL THREE' });
    expect(starMeterPose(100, T)).toMatchObject({ fill: 1, lit: 3, label: '100%' });
  });

  it('clamps a value off the scale and treats a bad one as nothing yet', () => {
    expect(starMeterPose(130, T).fill).toBe(1);
    expect(starMeterPose(-5, T)).toMatchObject({ fill: 0, lit: 0, label: '0%' });
    expect(starMeterPose(NaN, T)).toMatchObject({ fill: 0, label: '—' });
  });
});
