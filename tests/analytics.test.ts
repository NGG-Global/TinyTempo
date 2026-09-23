import { describe, expect, it, vi } from 'vitest';
import {
  FIREBASE_LIMITS, RESERVED_EVENT_NAMES, RESERVED_PREFIXES, shapeParams, validEventName, validName,
} from '../src/analytics/eventShape';
import { ANALYTICS_EVENTS, installAnalytics, track, type AnalyticsEvent } from '../src/monetization/analytics';

vi.mock('phaser', () => ({ default: {} }));

/**
 * The payload keys each event actually sends, mirrored from `AnalyticsPayloads`. Kept
 * here as data so the check below can run over them; a new key that Firebase would
 * discard fails this file rather than going quiet in the dashboard.
 */
const LEVEL = [
  'level', 'area', 'role', 'task_count', 'bpm', 'pattern_tier', 'grid', 'clear_accuracy', 'mode', 'previous_stars',
  'retry_count', 'heart_cost',
] as const;
const LEVEL_RESULT = [...LEVEL, 'accuracy', 'duration_ms', 'restarts', 'weakest_task', 'weakest_accuracy'] as const;

const PAYLOAD_KEYS: Record<AnalyticsEvent, readonly string[]> = {
  health_empty: ['level'],
  rewarded_offer_shown: ['placement'],
  rewarded_started: [],
  rewarded_completed: [],
  rewarded_failed: ['reason'],
  purchase_offer_shown: ['product'],
  purchase_started: ['product'],
  purchase_completed: ['product'],
  purchase_cancelled: ['product'],
  purchase_failed: ['product', 'reason'],
  tutorial_started: ['source', 'repeat'],
  tutorial_completed: ['tries', 'passed', 'duration_ms', 'repeat'],
  tutorial_skipped: ['step', 'tries', 'duration_ms', 'repeat'],
  level_started: LEVEL,
  level_retried: LEVEL,
  level_replayed: LEVEL,
  level_completed: [...LEVEL_RESULT, 'stars'],
  level_failed: LEVEL_RESULT,
  level_abandoned: [...LEVEL, 'task_index', 'duration_ms', 'restarts'],
  task_completed: [
    'level', 'area', 'mode', 'task_index', 'task_count', 'bpm', 'pattern_tier', 'grid', 'accuracy',
    'perfect', 'good', 'miss', 'extra', 'flawless', 'error_ms',
  ],
  star_improved: ['level', 'area', 'stars', 'previous_stars', 'accuracy', 'gate_have'],
  star_gate_reached: ['area', 'level', 'gate_required', 'gate_have', 'gate_short'],
  star_gate_opened: ['area', 'level', 'gate_required', 'gate_have'],
  subdivision_intro_shown: ['grid', 'level', 'mode'],
  subdivision_intro_completed: ['grid', 'level', 'tries', 'accuracy', 'passed'],
  scrapbook_opened: ['source', 'owned', 'total'],
  collectible_unlocked: ['vignette', 'collectible', 'level', 'first', 'owned'],
  area_finale_started: ['level', 'area', 'treatment', 'mode', 'retry_count', 'heart_cost'],
  area_finale_completed: ['level', 'area', 'treatment', 'mode', 'stars', 'accuracy'],
  area_finale_failed: ['level', 'area', 'treatment', 'mode', 'accuracy'],
  practice_started: ['level'],
  practice_completed: ['level', 'accuracy', 'duration_ms'],
};

describe('every event the game already fires', () => {
  it('has a name Firebase will keep', () => {
    // The whole point: Firebase drops a bad name silently, so this is the only place
    // the mistake can still be cheap.
    for (const event of ANALYTICS_EVENTS) {
      expect(validEventName(event), `event name: ${event}`).toBe(true);
    }
  });

  it('has parameter names Firebase will keep', () => {
    for (const [event, keys] of Object.entries(PAYLOAD_KEYS)) {
      for (const key of keys) {
        expect(validName(key, FIREBASE_LIMITS.paramName), `${event}.${key}`).toBe(true);
      }
    }
  });

  it('is covered by this file — a new event cannot be added without one', () => {
    expect(Object.keys(PAYLOAD_KEYS).sort()).toEqual([...ANALYTICS_EVENTS].sort());
  });

  it('fits in one Firebase event, with room to spare', () => {
    for (const [event, keys] of Object.entries(PAYLOAD_KEYS)) {
      expect(keys.length, event).toBeLessThanOrEqual(FIREBASE_LIMITS.params);
      expect(new Set(keys).size, `${event} repeats a key`).toBe(keys.length);
    }
  });

  it('never names anything that could identify the player', () => {
    // The schema is numbers and closed sets. A key that reads like any of these is a
    // design change to argue about in review, not something to slip in beside a level.
    const personal = /(^|_)(id|uid|user|name|email|device|ip|timestamp|time|tap|taps|ad_id|player)($|_)/;
    for (const [event, keys] of Object.entries(PAYLOAD_KEYS)) {
      for (const key of keys) expect(personal.test(key), `${event}.${key}`).toBe(false);
    }
  });
});

describe('a name Firebase would discard', () => {
  it('refuses the reserved prefixes, whatever their case', () => {
    for (const prefix of RESERVED_PREFIXES) {
      expect(validEventName(`${prefix}thing`)).toBe(false);
      expect(validEventName(`${prefix.toUpperCase()}thing`)).toBe(false);
    }
  });

  it('refuses a name the SDK keeps for itself', () => {
    for (const name of ['error', 'session_start', 'app_update', 'first_open', 'Screen_View']) {
      expect(validEventName(name), name).toBe(false);
    }
    for (const event of ANALYTICS_EVENTS) expect(RESERVED_EVENT_NAMES.has(event), event).toBe(false);
  });

  it('refuses what the character rules exclude', () => {
    for (const name of ['', '1_leading_digit', '_leading_underscore', 'has space', 'has-dash', 'has.dot', 'héllo']) {
      expect(validEventName(name), name).toBe(false);
    }
  });

  it('refuses a name past the length limit and keeps one at it', () => {
    expect(validEventName('a'.repeat(FIREBASE_LIMITS.eventName))).toBe(true);
    expect(validEventName('a'.repeat(FIREBASE_LIMITS.eventName + 1))).toBe(false);
  });
});

describe('shaping a payload', () => {
  it('passes the shapes the game actually sends through unchanged', () => {
    expect(shapeParams({ level: 6 })).toEqual({ level: 6 });
    expect(shapeParams({ product: 'premium', reason: 'cancelled' }))
      .toEqual({ product: 'premium', reason: 'cancelled' });
    expect(shapeParams({})).toEqual({});
  });

  it('truncates a long string rather than losing it', () => {
    // A truncated product id still names the funnel step; a missing one does not.
    const long = 'p'.repeat(FIREBASE_LIMITS.stringValue + 40);
    const shaped = shapeParams({ product: long });
    expect(shaped.product).toHaveLength(FIREBASE_LIMITS.stringValue);
    expect(shaped.product).toBe(long.slice(0, FIREBASE_LIMITS.stringValue));
  });

  it('drops what Firebase has no representation for', () => {
    expect(shapeParams({
      ok: 'yes', nested: { a: 1 }, list: [1, 2], nothing: null, missing: undefined,
      nan: Number.NaN, infinite: Number.POSITIVE_INFINITY, blank: '',
    })).toEqual({ ok: 'yes' });
  });

  it('turns a boolean into a number, which is what a funnel can count', () => {
    expect(shapeParams({ first: true, repeat: false })).toEqual({ first: 1, repeat: 0 });
  });

  it('drops a parameter whose own name Firebase would refuse', () => {
    expect(shapeParams({ good: 1, 'bad name': 2, ga_reserved: 3, ['x'.repeat(41)]: 4 }))
      .toEqual({ good: 1 });
  });

  it('stops at the parameter ceiling instead of sending an event that is thrown away', () => {
    const many: Record<string, number> = {};
    for (let i = 0; i < FIREBASE_LIMITS.params + 10; i++) many[`p${i}`] = i;
    expect(Object.keys(shapeParams(many))).toHaveLength(FIREBASE_LIMITS.params);
  });
});

describe('the event bus a provider attaches to', () => {
  it('lets a provider wrap the installed sink instead of replacing it', () => {
    // This is what keeps the crash-breadcrumb bridge alive once Firebase attaches.
    const seen: string[] = [];
    const restore = installAnalytics(() => { seen.push('bridge'); });
    const previous = installAnalytics((event, payload) => {
      previous(event, payload);
      seen.push(`provider:${event}`);
    });
    track('purchase_completed', { product: 'premium' });
    expect(seen).toEqual(['bridge', 'provider:purchase_completed']);
    installAnalytics(restore);
  });

  it('survives a sink that throws, because a dropped event is not worth the game', () => {
    const restore = installAnalytics(() => { throw new Error('bridge down'); });
    expect(() => track('health_empty', { level: 3 })).not.toThrow();
    installAnalytics(restore);
  });
});
