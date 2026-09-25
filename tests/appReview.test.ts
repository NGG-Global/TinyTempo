import { describe, expect, it } from 'vitest';

import {
  createAppReview, createContinuation, REVIEW_MILESTONES, reviewMilestoneFor, stubAppReview,
  type AppReviewClient, type LevelClearance, type ReviewMilestone,
} from '../src/review/appReview';
import {
  EMPTY_REVIEW_RECORD, hasAttempted, loadReviewRecord, recordAttempt, saveReviewRecord, type ReviewRecord,
} from '../src/review/reviewRecord';

const FIRST_FINALE: ReviewMilestone = { id: 'first-finale', level: 10 };

function clear(overrides: Partial<LevelClearance> = {}): LevelClearance {
  return { level: 10, cleared: true, finale: true, saved: true, ...overrides };
}

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  public get length(): number { return this.map.size; }
  public clear(): void { this.map.clear(); }
  public getItem(key: string): string | null { return this.map.get(key) ?? null; }
  public key(index: number): string | null { return [...this.map.keys()][index] ?? null; }
  public removeItem(key: string): void { this.map.delete(key); }
  public setItem(key: string, value: string): void { this.map.set(key, value); }
}

/** A launch of the flow that has not been asked to settle yet, and a fresh promise. */
function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

interface FakeOptions {
  readonly prepare?: 'ok' | 'fail' | 'hang';
  readonly launch?: 'ok' | 'fail' | 'hang';
}

interface Fake extends AppReviewClient {
  readonly prepares: number;
  readonly launches: number;
}

function fakeClient(options: FakeOptions = {}): Fake {
  let prepares = 0;
  let launches = 0;
  return {
    get prepares() { return prepares; },
    get launches() { return launches; },
    async prepare() {
      prepares += 1;
      if (options.prepare === 'fail') throw new Error('PLAY_STORE_NOT_FOUND');
      if (options.prepare === 'hang') await new Promise<never>(() => { /* never */ });
    },
    async launch() {
      launches += 1;
      if (options.launch === 'fail') throw new Error('review-launch-failed');
      if (options.launch === 'hang') await new Promise<never>(() => { /* never */ });
    },
  };
}

function harness(client: AppReviewClient, storage: Storage | null = new MemoryStorage(), waits = { prepareWaitMs: 30, launchWaitMs: 30 }) {
  const review = createAppReview(client, {
    load: () => loadReviewRecord(storage),
    save: record => saveReviewRecord(record, storage),
    appVersion: '0.1.10',
    now: () => 1_700_000_000_000,
    ...waits,
  });
  return { review, record: () => loadReviewRecord(storage) };
}

describe('the review milestone', () => {
  it('is the first area finale, and only that', () => {
    expect(REVIEW_MILESTONES).toEqual([FIRST_FINALE]);
  });

  it('is not opened by a level short of it', () => {
    expect(reviewMilestoneFor(clear({ level: 9 }), EMPTY_REVIEW_RECORD)).toBeNull();
  });

  it('is not opened by a failed level 10', () => {
    expect(reviewMilestoneFor(clear({ cleared: false }), EMPTY_REVIEW_RECORD)).toBeNull();
  });

  it('is opened by a cleared, saved level 10 finale', () => {
    expect(reviewMilestoneFor(clear(), EMPTY_REVIEW_RECORD)).toEqual(FIRST_FINALE);
  });

  it('is not opened when the clear did not save', () => {
    expect(reviewMilestoneFor(clear({ saved: false }), EMPTY_REVIEW_RECORD)).toBeNull();
  });

  it('is not opened by a level 10 result that is not a finale clear', () => {
    expect(reviewMilestoneFor(clear({ finale: false }), EMPTY_REVIEW_RECORD)).toBeNull();
  });

  it('asks nothing about stars: a one-star clear is the milestone too', () => {
    // The clearance carries no stars or accuracy at all, which is the point.
    expect(Object.keys(clear()).sort()).toEqual(['cleared', 'finale', 'level', 'saved']);
  });

  it('is closed once it has been attempted on this device', () => {
    const attempted = recordAttempt(EMPTY_REVIEW_RECORD, { milestone: 'first-finale', level: 10, at: 1, appVersion: '0.1.10' });
    expect(reviewMilestoneFor(clear(), attempted)).toBeNull();
  });

  it('is not opened by level 20, which is no milestone', () => {
    const attempted = recordAttempt(EMPTY_REVIEW_RECORD, { milestone: 'first-finale', level: 10, at: 1, appVersion: '0.1.10' });
    expect(reviewMilestoneFor(clear({ level: 20 }), attempted)).toBeNull();
    expect(reviewMilestoneFor(clear({ level: 20 }), EMPTY_REVIEW_RECORD)).toBeNull();
  });

  it('takes a later milestone as one more entry', () => {
    const later: readonly ReviewMilestone[] = [FIRST_FINALE, { id: 'fifth-finale', level: 50 }];
    const attempted = recordAttempt(EMPTY_REVIEW_RECORD, { milestone: 'first-finale', level: 10, at: 1, appVersion: '0.1.10' });
    expect(reviewMilestoneFor(clear({ level: 50 }), attempted, later)).toEqual(later[1]);
    expect(reviewMilestoneFor(clear({ level: 10 }), attempted, later)).toBeNull();
  });
});

describe('the review record', () => {
  it('starts empty where storage is missing or refused', () => {
    expect(loadReviewRecord(null)).toEqual(EMPTY_REVIEW_RECORD);
    expect(saveReviewRecord(EMPTY_REVIEW_RECORD, null)).toBe(false);
    const broken = new MemoryStorage();
    broken.getItem = () => { throw new Error('blocked'); };
    expect(loadReviewRecord(broken)).toEqual(EMPTY_REVIEW_RECORD);
  });

  it('round-trips an attempt', () => {
    const storage = new MemoryStorage();
    const attempt = { milestone: 'first-finale', level: 10, at: 1_700_000_000_000, appVersion: '0.1.10' };
    expect(saveReviewRecord(recordAttempt(EMPTY_REVIEW_RECORD, attempt), storage)).toBe(true);
    const loaded = loadReviewRecord(storage);
    expect(loaded.attempts).toEqual([attempt]);
    expect(hasAttempted(loaded, 'first-finale')).toBe(true);
    expect(hasAttempted(loaded, 'fifth-finale')).toBe(false);
  });

  it('validates every field and drops what it cannot read', () => {
    const storage = new MemoryStorage();
    storage.setItem('tiny-tempo.review.v1', JSON.stringify({
      version: 1,
      attempts: [
        { milestone: 'first-finale', level: 'ten', at: 'yesterday', appVersion: 7 },
        { milestone: '' },
        { milestone: 'first-finale', level: 10, at: 2, appVersion: 'dup' },
        null,
        'first-finale',
      ],
    }));
    expect(loadReviewRecord(storage).attempts).toEqual([
      { milestone: 'first-finale', level: 0, at: 0, appVersion: '' },
    ]);
    storage.setItem('tiny-tempo.review.v1', '{"attempts": "first-finale"}');
    expect(loadReviewRecord(storage)).toEqual(EMPTY_REVIEW_RECORD);
    storage.setItem('tiny-tempo.review.v1', 'not json');
    expect(loadReviewRecord(storage)).toEqual(EMPTY_REVIEW_RECORD);
  });

  it('records a milestone once', () => {
    const attempt = { milestone: 'first-finale', level: 10, at: 1, appVersion: '0.1.10' };
    const once = recordAttempt(EMPTY_REVIEW_RECORD, attempt);
    expect(recordAttempt(once, { ...attempt, at: 2 })).toBe(once);
  });
});

describe('the review adapter', () => {
  it('prepares in the background on the first eligible level 10 clear and launches once from Continue', async () => {
    const client = fakeClient();
    const { review, record } = harness(client);
    expect(review.offer(clear())).toEqual(FIRST_FINALE);
    expect(client.prepares).toBe(1);
    expect(client.launches).toBe(0);
    expect(record().attempts).toEqual([]);
    await expect(review.launch()).resolves.toBe('completed');
    expect(client.launches).toBe(1);
    expect(record().attempts).toEqual([{ milestone: 'first-finale', level: 10, at: 1_700_000_000_000, appVersion: '0.1.10' }]);
  });

  it('offers nothing on a replay of level 10 after the attempt', async () => {
    const storage = new MemoryStorage();
    const client = fakeClient();
    const { review } = harness(client, storage);
    review.offer(clear());
    await review.launch();
    expect(review.offer(clear())).toBeNull();
    await expect(review.launch()).resolves.toBe('skipped');
    // A fresh session on the same device reads the record, not memory.
    const later = harness(fakeClient(), storage);
    expect(later.review.offer(clear())).toBeNull();
    expect(client.prepares).toBe(1);
  });

  it('offers nothing on level 20 after the level 10 attempt, or before it', async () => {
    const storage = new MemoryStorage();
    const { review } = harness(fakeClient(), storage);
    expect(review.offer(clear({ level: 20 }))).toBeNull();
    review.offer(clear());
    await review.launch();
    expect(review.offer(clear({ level: 20 }))).toBeNull();
    expect(harness(fakeClient(), storage).review.offer(clear({ level: 20 }))).toBeNull();
  });

  it('offers nothing on a level 9 clear, a failed level 10, an unsaved one or a non-finale', () => {
    const client = fakeClient();
    const { review } = harness(client);
    expect(review.offer(clear({ level: 9 }))).toBeNull();
    expect(review.offer(clear({ cleared: false }))).toBeNull();
    expect(review.offer(clear({ saved: false }))).toBeNull();
    expect(review.offer(clear({ finale: false }))).toBeNull();
    expect(client.prepares).toBe(0);
  });

  it('skips the launch, and keeps the opportunity, when Play refused to prepare', async () => {
    const client = fakeClient({ prepare: 'fail' });
    const { review, record } = harness(client);
    expect(review.offer(clear())).toEqual(FIRST_FINALE);
    await expect(review.launch()).resolves.toBe('skipped');
    expect(client.launches).toBe(0);
    expect(record().attempts).toEqual([]);
    // The next clear of the milestone asks Play again.
    expect(review.offer(clear())).toEqual(FIRST_FINALE);
    expect(client.prepares).toBe(2);
  });

  it('skips a preparation that is still pending past the wait, without spending the opportunity', async () => {
    const client = fakeClient({ prepare: 'hang' });
    const { review, record } = harness(client);
    review.offer(clear());
    await expect(review.launch()).resolves.toBe('skipped');
    expect(client.launches).toBe(0);
    expect(record().attempts).toEqual([]);
  });

  it('waits for a preparation that finishes inside the wait', async () => {
    const gate = deferred();
    const client: AppReviewClient = { prepare: () => gate.promise, launch: async () => { /* shown */ } };
    const { review } = harness(client, new MemoryStorage(), { prepareWaitMs: 200, launchWaitMs: 200 });
    review.offer(clear());
    const launched = review.launch();
    gate.resolve();
    await expect(launched).resolves.toBe('completed');
  });

  it('counts a launch Play then failed as the attempt', async () => {
    const client = fakeClient({ launch: 'fail' });
    const { review, record } = harness(client);
    review.offer(clear());
    await expect(review.launch()).resolves.toBe('failed');
    expect(record().attempts).toHaveLength(1);
    expect(review.offer(clear())).toBeNull();
  });

  it('gives up on a launch that never hands control back, still counting it', async () => {
    const client = fakeClient({ launch: 'hang' });
    const { review, record } = harness(client);
    review.offer(clear());
    await expect(review.launch()).resolves.toBe('failed');
    expect(record().attempts).toHaveLength(1);
  });

  it('launches at most once in a session even when the record cannot be written', async () => {
    const client = fakeClient();
    const { review } = harness(client, null);
    review.offer(clear());
    await expect(review.launch()).resolves.toBe('completed');
    expect(review.offer(clear())).toBeNull();
    await expect(review.launch()).resolves.toBe('skipped');
    expect(client.launches).toBe(1);
  });

  it('launches once however many times Continue is pressed', async () => {
    const gate = deferred();
    let launches = 0;
    const client: AppReviewClient = {
      prepare: async () => { /* ready */ },
      launch: () => { launches += 1; return gate.promise; },
    };
    const { review } = harness(client, new MemoryStorage(), { prepareWaitMs: 200, launchWaitMs: 200 });
    review.offer(clear());
    const first = review.launch();
    const second = review.launch();
    const third = review.launch();
    await expect(second).resolves.toBe('skipped');
    await expect(third).resolves.toBe('skipped');
    gate.resolve();
    await expect(first).resolves.toBe('completed');
    expect(launches).toBe(1);
  });

  it('does not ask Play twice when the same summary opens twice before Continue', () => {
    const client = fakeClient();
    const { review } = harness(client);
    review.offer(clear());
    review.offer(clear());
    expect(client.prepares).toBe(1);
  });

  it('launches nothing when nothing was offered', async () => {
    const client = fakeClient();
    const { review } = harness(client);
    await expect(review.launch()).resolves.toBe('skipped');
    expect(client.launches).toBe(0);
  });
});

describe('the browser stub', () => {
  it('offers nothing and launches nothing', async () => {
    expect(stubAppReview.offer(clear())).toBeNull();
    await expect(stubAppReview.launch()).resolves.toBe('skipped');
  });
});

describe('Continue', () => {
  it('reaches the map after a completed review flow, in that order', async () => {
    const order: string[] = [];
    const gate = deferred();
    const go = createContinuation(
      () => { order.push('launch'); return gate.promise; },
      () => { order.push('map'); },
    );
    const run = go.run();
    expect(go.busy).toBe(true);
    expect(order).toEqual(['launch']);
    gate.resolve();
    await run;
    expect(order).toEqual(['launch', 'map']);
  });

  it('reaches the map when the review is unavailable, refused or skipped', async () => {
    for (const result of ['skipped', 'failed', 'completed'] as const) {
      let left = 0;
      const go = createContinuation(async () => result, () => { left += 1; });
      await go.run();
      expect(left).toBe(1);
    }
  });

  it('reaches the map when the bridge itself throws', async () => {
    let left = 0;
    const go = createContinuation(async () => { throw new Error('bridge'); }, () => { left += 1; });
    await go.run();
    expect(left).toBe(1);
  });

  it('leaves once however many times it is pressed', async () => {
    const gate = deferred();
    let launches = 0;
    let left = 0;
    const go = createContinuation(() => { launches += 1; return gate.promise; }, () => { left += 1; });
    const first = go.run();
    await go.run();
    await go.run();
    gate.resolve();
    await first;
    expect(launches).toBe(1);
    expect(left).toBe(1);
  });
});

describe('the whole path, with the scene\'s inputs', () => {
  it('level 10 clear → Continue → one flow → map; then level 10 again and level 20 → map alone', async () => {
    const storage = new MemoryStorage();
    const client = fakeClient();
    const { review } = harness(client, storage);
    const trips: string[] = [];
    const leave = () => { trips.push('map'); };
    const play = async (level: number, cleared = true) => {
      review.offer({ level, cleared, finale: level % 10 === 0 && cleared, saved: cleared });
      if (cleared) await createContinuation(() => review.launch(), leave).run();
      else trips.push('retry');
    };
    await play(9);
    await play(10, false);
    await play(10);
    await play(10);
    await play(20);
    expect(trips).toEqual(['map', 'retry', 'map', 'map', 'map']);
    expect(client.prepares).toBe(1);
    expect(client.launches).toBe(1);
    const record: ReviewRecord = loadReviewRecord(storage);
    expect(record.attempts.map(a => a.milestone)).toEqual(['first-finale']);
  });
});
