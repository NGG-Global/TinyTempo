import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  breadcrumb, breadcrumbEpochMs, captureGlobalErrors, ERRORS, errorTrail, installErrorSink,
  redact, reportError, resetErrorState, setErrorContext, type ErrorReport,
} from '../src/core/errors';

let sent: ErrorReport[] = [];
let restore: ReturnType<typeof installErrorSink>;

beforeEach(() => {
  sent = [];
  resetErrorState();
  restore = installErrorSink(report => { sent.push(report); });
});

afterEach(() => { installErrorSink(restore); });

describe('error capture', () => {
  it('reports a caught error with its stack and kind', () => {
    reportError(new Error('boom'), { kind: 'handled', context: { level: 4 } });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.message).toBe('boom');
    expect(sent[0]!.kind).toBe('handled');
    expect(sent[0]!.fatal).toBe(false);
    expect(sent[0]!.context.level).toBe(4);
    expect(sent[0]!.stack).toContain('boom');
  });

  it('keeps the thrown error\'s own type, which is half of how an issue is grouped', () => {
    // Flattening every fault to one name made a missing function and a null dereference
    // at the same line look like the same bug. Found with Sentry's own test snippet.
    reportError(new ReferenceError('myUndefinedFunction is not defined'), { kind: 'error' });
    reportError(new TypeError('x is not a function'));
    reportError(new RangeError('out of range'));
    expect(sent.map(r => r.name)).toEqual(['ReferenceError', 'TypeError', 'RangeError']);
    // The capture path it arrived by stays separate, as the kind.
    expect(sent[0]!.kind).toBe('error');
  });

  it('falls back to Error for a thrown value with no usable name', () => {
    reportError('a string was thrown');
    const nameless = new Error('odd');
    Object.defineProperty(nameless, 'name', { value: '' });
    reportError(nameless);
    expect(sent.map(r => r.name)).toEqual(['Error', 'Error']);
  });

  it('accepts a thrown value that is not an Error', () => {
    reportError('a string was thrown');
    reportError({ weird: true });
    expect(sent.map(r => r.message)).toEqual(['a string was thrown', '[object Object]']);
  });

  it('carries the standing context on every report', () => {
    setErrorContext('act', 'hammer');
    reportError(new Error('one'));
    reportError(new Error('two'));
    expect(sent.every(r => r.context.act === 'hammer')).toBe(true);
    // A per-report value wins over the standing one, rather than being dropped.
    reportError(new Error('three'), { context: { act: 'bug' } });
    expect(sent[2]!.context.act).toBe('bug');
  });
});

describe('the flood guard', () => {
  it('collapses the same failure, then reports it on a power-of-two repeat', () => {
    // A throw inside a Phaser update() fires sixty times a second; this is the rule
    // that keeps a single stuck frame from spending the whole quota.
    const throwSame = (): void => {
      const error = new Error('every frame');
      error.stack = 'Error: every frame\n    at update (game.js:1:1)';
      reportError(error);
    };
    for (let i = 0; i < 64; i++) throwSame();
    expect(sent.map(r => r.seen)).toEqual([1, 2, 4, 8, 16, 32, 64]);
  });

  it('counts distinct failures separately', () => {
    const at = (message: string, frame: string): void => {
      const error = new Error(message);
      error.stack = `Error: ${message}\n    at ${frame}`;
      reportError(error);
    };
    at('a', 'one.js:1:1');
    at('a', 'two.js:2:2');
    at('a', 'one.js:1:1');
    // The same message from a different top frame is a different failure, so each
    // starts its own count: the third call is the first one's second sighting, not
    // the second one's. Two bugs at one line would otherwise hide behind each other.
    expect(sent.map(r => r.seen)).toEqual([1, 1, 2]);
  });

  it('stops at the session ceiling however many distinct failures arrive', () => {
    for (let i = 0; i < ERRORS.perSession * 3; i++) reportError(new Error(`distinct ${i}`));
    expect(sent).toHaveLength(ERRORS.perSession);
  });

  it('truncates an enormous message rather than forwarding it', () => {
    reportError(new Error('x'.repeat(ERRORS.maxChars * 3)));
    expect(sent[0]!.message.length).toBe(ERRORS.maxChars);
  });
});

describe('redaction', () => {
  it('strips a query string, which is where the debug flags live', () => {
    expect(redact('failed at https://host/game?debug&level=9')).toBe('failed at https://host/game');
  });

  it('shortens a device file path to its last segment', () => {
    expect(redact('file:///data/user/0/com.tinytempo.app/public/index.html'))
      .toBe('file://…/index.html');
  });

  it('leaves an ordinary stack frame alone', () => {
    const frame = '    at PlayScene.update (assets/index-abc123.js:9:42)';
    expect(redact(frame)).toBe(frame);
  });
});

describe('breadcrumbs', () => {
  it('keeps a bounded ring of the most recent steps', () => {
    for (let i = 0; i < ERRORS.trail + 10; i++) breadcrumb(`step ${i}`);
    const trail = errorTrail();
    expect(trail).toHaveLength(ERRORS.trail);
    expect(trail[0]!.message).toBe('step 10');
    expect(trail.at(-1)!.message).toBe(`step ${ERRORS.trail + 9}`);
  });

  it('dates a crumb in wall-clock time, not in milliseconds since the page opened', () => {
    // Sending the relative value straight to a reporter dated every crumb to 1970 and
    // silently dropped the lot — found by reading the envelopes Sentry actually posts.
    const before = Date.now();
    breadcrumb('step');
    const at = errorTrail()[0]!.at;
    const epoch = breadcrumbEpochMs(at);
    expect(epoch).toBeGreaterThanOrEqual(before - 1);
    expect(epoch).toBeLessThanOrEqual(Date.now() + 1);
    // The year has to be plausible, which is the property that actually failed.
    expect(new Date(epoch).getUTCFullYear()).toBeGreaterThan(2020);
  });

  it('hands the trail to a report as a copy, not as the live ring', () => {
    breadcrumb('before', { level: 3 });
    reportError(new Error('boom'));
    breadcrumb('after');
    expect(sent[0]!.breadcrumbs).toHaveLength(1);
    expect(sent[0]!.breadcrumbs[0]!.message).toBe('before');
    expect(sent[0]!.breadcrumbs[0]!.data).toEqual({ level: 3 });
  });
});

describe('the global hooks', () => {
  const listeners = new Map<string, (event: Event) => void>();
  const target = {
    addEventListener: (type: string, fn: EventListenerOrEventListenerObject) => {
      listeners.set(type, fn as (event: Event) => void);
    },
    removeEventListener: (type: string) => { listeners.delete(type); },
  } as unknown as Window;

  it('treats a window error as fatal and a rejection as not', () => {
    const dispose = captureGlobalErrors(target);
    listeners.get('error')!({ error: new Error('render died') } as unknown as Event);
    listeners.get('unhandledrejection')!({ reason: new Error('fetch lost') } as unknown as Event);
    expect(sent.map(r => [r.kind, r.fatal])).toEqual([['error', true], ['rejection', false]]);
    dispose();
    expect(listeners.size).toBe(0);
  });

  it('falls back to the message when an ErrorEvent carries no error', () => {
    captureGlobalErrors(target);
    listeners.get('error')!({ message: 'Script error.' } as unknown as Event);
    expect(sent[0]!.message).toBe('Script error.');
  });
});

describe('a reporter that misbehaves', () => {
  it('never takes the game down', () => {
    installErrorSink(() => { throw new Error('the reporter itself is broken'); });
    expect(() => reportError(new Error('boom'))).not.toThrow();
  });

  it('survives an error whose own stack getter throws', () => {
    const hostile = new Error('hostile');
    Object.defineProperty(hostile, 'stack', { get: () => { throw new Error('nope'); } });
    const sink = vi.fn();
    installErrorSink(sink);
    expect(() => reportError(hostile)).not.toThrow();
    expect(sink).not.toHaveBeenCalled();
  });
});
