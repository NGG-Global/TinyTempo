import { describe, expect, it } from 'vitest';
import { silenceInBackground, type SuspendableContext, type VisibilitySource } from '../src/audio/backgroundSilence';

function fakeContext(state: AudioContextState = 'running', refuseResume = false) {
  const calls: string[] = [];
  const context: SuspendableContext & { state: AudioContextState; calls: string[] } = {
    state, calls,
    async suspend() { calls.push('suspend'); this.state = 'suspended'; },
    async resume() {
      calls.push('resume');
      if (refuseResume) { refuseResume = false; return; }
      this.state = 'running';
    },
  };
  return context;
}

function fakePage() {
  const listeners = new Map<string, Set<() => void>>();
  const page: VisibilitySource & { hidden: boolean; fire(type: string): void; count(type: string): number } = {
    hidden: false,
    addEventListener(type, listener, options) {
      const set = listeners.get(type) ?? new Set();
      const run = options?.once ? () => { set.delete(run); listener(); } : listener;
      set.add(run);
      listeners.set(type, set);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    // A copy: a once-listener removes itself while the set is being walked.
    fire(type) { for (const listener of Array.from(listeners.get(type) ?? [])) listener(); },
    count(type) { return listeners.get(type)?.size ?? 0; },
  };
  return page;
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('sound while the game is off screen', () => {
  it('suspends a running context when the page is hidden, and resumes it when it comes back', async () => {
    const context = fakeContext();
    const page = fakePage();
    silenceInBackground(context, page);
    page.hidden = true;
    page.fire('visibilitychange');
    await settle();
    expect(context.state).toBe('suspended');
    page.hidden = false;
    page.fire('visibilitychange');
    await settle();
    expect(context.calls).toEqual(['suspend', 'resume']);
    expect(context.state).toBe('running');
  });

  it('leaves alone a context it did not suspend', async () => {
    const context = fakeContext('suspended');
    const page = fakePage();
    silenceInBackground(context, page);
    page.hidden = true;
    page.fire('visibilitychange');
    page.hidden = false;
    page.fire('visibilitychange');
    await settle();
    expect(context.calls).toEqual([]);
  });

  it('tries again on the next touch when the platform refuses the resume', async () => {
    const context = fakeContext('running', true);
    const page = fakePage();
    silenceInBackground(context, page);
    page.hidden = true;
    page.fire('visibilitychange');
    await settle();
    page.hidden = false;
    page.fire('visibilitychange');
    await settle();
    expect(context.state).toBe('suspended');
    expect(page.count('pointerdown')).toBe(1);
    page.fire('pointerdown');
    await settle();
    expect(context.state).toBe('running');
    expect(page.count('pointerdown')).toBe(0);
  });

  it('stops following the page when released, and does nothing without one', async () => {
    const context = fakeContext();
    const page = fakePage();
    const release = silenceInBackground(context, page);
    release();
    page.hidden = true;
    page.fire('visibilitychange');
    await settle();
    expect(context.calls).toEqual([]);
    expect(() => silenceInBackground(context, undefined)()).not.toThrow();
  });
});
