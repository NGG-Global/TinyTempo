import { describe, expect, it } from 'vitest';
import { silenceInBackground, type SuspendableContext, type VisibilitySource } from '../src/audio/backgroundSilence';

function fakeContext(state: AudioContextState = 'running', refuseResume = false) {
  const calls: string[] = [];
  const stateListeners = new Set<() => void>();
  const context: SuspendableContext & { state: AudioContextState; calls: string[]; set(state: AudioContextState): void } = {
    state, calls,
    // Like the real one, the state changes and `statechange` fires after the call returns.
    set(next) { this.state = next; for (const listener of Array.from(stateListeners)) listener(); },
    async suspend() { calls.push('suspend'); this.set('suspended'); },
    async resume() {
      calls.push('resume');
      if (refuseResume) { refuseResume = false; return; }
      this.set('running');
    },
    addEventListener(_type, listener) { stateListeners.add(listener); },
    removeEventListener(_type, listener) { stateListeners.delete(listener); },
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
    const silence = silenceInBackground(context, page);
    expect(silence.hidden).toBe(false);
    page.hidden = true;
    page.fire('visibilitychange');
    await settle();
    expect(context.state).toBe('suspended');
    expect(silence.hidden).toBe(true);
    page.hidden = false;
    page.fire('visibilitychange');
    await settle();
    expect(context.calls).toEqual(['suspend', 'resume']);
    expect(context.state).toBe('running');
    expect(silence.hidden).toBe(false);
  });

  it('suspends on the activity\'s pause while the page still says it is visible, and resumes on its resume', async () => {
    // Capacitor never pauses the WebView with its activity: behind Home and behind a
    // rewarded ad `document.hidden` stays false, and the activity's own word is all there is.
    const context = fakeContext();
    const page = fakePage();
    const silence = silenceInBackground(context, page);
    silence.setAppActive(false);
    await settle();
    expect(page.hidden).toBe(false);
    expect(silence.hidden).toBe(true);
    expect(context.state).toBe('suspended');
    // The same word twice (pause, then appStateChange from onStop) changes nothing.
    silence.setAppActive(false);
    await settle();
    expect(context.calls).toEqual(['suspend']);
    silence.setAppActive(true);
    await settle();
    expect(context.calls).toEqual(['suspend', 'resume']);
    expect(context.state).toBe('running');
    expect(silence.hidden).toBe(false);
  });

  it('stays silent until both the page and the activity say the game is back', async () => {
    const context = fakeContext();
    const page = fakePage();
    const silence = silenceInBackground(context, page);
    page.hidden = true;
    page.fire('visibilitychange');
    silence.setAppActive(false);
    await settle();
    expect(context.calls).toEqual(['suspend']);
    silence.setAppActive(true);
    await settle();
    expect(context.state).toBe('suspended');
    expect(silence.hidden).toBe(true);
    page.hidden = false;
    page.fire('visibilitychange');
    await settle();
    expect(context.state).toBe('running');
  });

  it('puts back a context that something else resumed while the game is off screen', async () => {
    // The level answers every `statechange` with `recover()`, which resumed the context on
    // the very event the suspend had fired, and the music played on behind the ad.
    const context = fakeContext();
    const page = fakePage();
    silenceInBackground(context, page);
    page.hidden = true;
    page.fire('visibilitychange');
    await settle();
    expect(context.state).toBe('suspended');
    await context.resume();
    await settle();
    expect(context.state).toBe('suspended');
    expect(context.calls).toEqual(['suspend', 'resume', 'suspend']);
    page.hidden = false;
    page.fire('visibilitychange');
    await settle();
    expect(context.state).toBe('running');
  });

  it('leaves alone a context it did not suspend', async () => {
    const context = fakeContext('suspended');
    const page = fakePage();
    const silence = silenceInBackground(context, page);
    page.hidden = true;
    page.fire('visibilitychange');
    page.hidden = false;
    page.fire('visibilitychange');
    silence.setAppActive(false);
    silence.setAppActive(true);
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

  it('does not let the touch retry resume a context while the game is off screen again', async () => {
    const context = fakeContext('running', true);
    const page = fakePage();
    const silence = silenceInBackground(context, page);
    page.hidden = true;
    page.fire('visibilitychange');
    await settle();
    page.hidden = false;
    page.fire('visibilitychange');
    await settle();
    expect(page.count('pointerdown')).toBe(1);
    silence.setAppActive(false);
    page.fire('pointerdown');
    await settle();
    expect(context.state).toBe('suspended');
  });

  it('stops following the page, the activity and the context when released, and works without a page', async () => {
    const context = fakeContext();
    const page = fakePage();
    const silence = silenceInBackground(context, page);
    silence.release();
    page.hidden = true;
    page.fire('visibilitychange');
    silence.setAppActive(false);
    await settle();
    expect(context.calls).toEqual([]);
    const pageless = fakeContext();
    const alone = silenceInBackground(pageless, undefined);
    alone.setAppActive(false);
    await settle();
    expect(pageless.state).toBe('suspended');
    alone.setAppActive(true);
    await settle();
    expect(pageless.state).toBe('running');
    expect(() => alone.release()).not.toThrow();
  });
});
