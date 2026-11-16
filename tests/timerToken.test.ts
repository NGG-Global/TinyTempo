import { describe, expect, it, vi } from 'vitest';
import { PALETTE, SHELL } from '../src/config/theme';
import { BRASS } from '../src/ui/panel';
import { tokenLook, type TimerTokenState } from '../src/ui/timerToken';

vi.mock('phaser', () => ({ default: { Geom: { Rectangle: class {} } } }));

describe('the replay timer token', () => {
  it('wears a ring only where something is running out: a won timer and a running one', () => {
    expect(tokenLook('won', 0.6)).toMatchObject({ ring: 0.6, ringColour: PALETTE.ink, badge: 'sun', rim: null, dashed: false, alpha: 1 });
    expect(tokenLook('running', 0.25)).toMatchObject({ ring: 0.25, ringColour: BRASS, badge: null, rim: null, face: SHELL.sun });
    // A bought timer keeps, so it has no ring; its rim is brass and its badge the price tag.
    expect(tokenLook('bought', 0.3)).toMatchObject({ ring: null, ringColour: null, rim: BRASS, badge: 'tag', dashed: false });
    // An expired one is greyed and dashed, on its way off the shelf, and carries nothing else.
    expect(tokenLook('expired', 1)).toMatchObject({ ring: null, rim: null, badge: null, dashed: true });
    expect(tokenLook('expired', 1).alpha).toBeLessThan(1);
  });

  it('is four distinct looks', () => {
    const states: TimerTokenState[] = ['won', 'bought', 'running', 'expired'];
    const looks = states.map(state => JSON.stringify(tokenLook(state, 0.5)));
    expect(new Set(looks).size).toBe(4);
  });

  it('clamps the ring to its range and treats a bad value as empty', () => {
    expect(tokenLook('won', 1.7).ring).toBe(1);
    expect(tokenLook('won', -0.2).ring).toBe(0);
    expect(tokenLook('running', NaN).ring).toBe(0);
    expect(tokenLook('running', Infinity).ring).toBe(0);
  });
});
