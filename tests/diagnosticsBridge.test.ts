import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));
vi.mock('@/config/diagnostics', () => ({ DIAGNOSTICS: { dsn: '', release: 'test' } }));

import { installDiagnostics } from '../src/diagnostics/boot';
import { errorTrail, resetErrorState } from '../src/core/errors';
import { installAnalytics, track } from '../src/monetization/analytics';

describe('the crash-breadcrumb bridge', () => {
  it('keeps commerce and level events on the trail, and per-task events off it', () => {
    // The trail is a ring of 24. A level fires up to eight task events, which would push
    // the purchase that caused a crash off the report it was meant to explain.
    vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const seen: string[] = [];
    installAnalytics(event => { seen.push(event); });
    installDiagnostics();
    resetErrorState();
    track('purchase_started', { product: 'premium' });
    track('task_completed', {
      level: 3, area: 1, mode: 'frontier', task_index: 1, task_count: 3, bpm: 120, pattern_tier: 0,
      grid: 'eighth', accuracy: 90, perfect: 3, good: 1, miss: 0, extra: 0, flawless: 0,
    });
    track('level_failed', {
      level: 3, area: 1, task_count: 3, bpm: 120, pattern_tier: 0, grid: 'eighth', clear_accuracy: 43,
      mode: 'frontier', previous_stars: 0, retry_count: 0, heart_cost: 0, accuracy: 20, duration_ms: 30_000,
      restarts: 0, weakest_task: 2, weakest_accuracy: 5,
    });
    expect(errorTrail().map(crumb => crumb.message)).toEqual(['purchase_started', 'level_failed']);
    // The trail is filtered; the events themselves still reach whatever sink comes next.
    expect(seen).toEqual(['purchase_started', 'task_completed', 'level_failed']);
    vi.unstubAllGlobals();
  });
});
