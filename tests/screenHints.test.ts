import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ENDLESS } from '../src/config/endless';
import { markPuckSeen, markScrapbookSeen, markScreenHintSeen, readTeachFlags, seenPuck, seenScrapbook, seenScreenHint, TEACH_FLAGS } from '../src/game/progress';
import { SCREEN_HINTS, type ScreenHintId } from '../src/game/screenHints';
import { CLOUD_TEACH } from '../src/playgames/cloudSave';
import { HINT, planHint } from '../src/ui/hintLayout';

vi.mock('phaser', () => ({ default: {} }));

function memory(initial: Record<string, string> = {}): Storage {
  const data: Record<string, string> = { ...initial };
  return {
    get length() { return Object.keys(data).length; },
    clear: () => { for (const key of Object.keys(data)) delete data[key]; },
    getItem: key => data[key] ?? null,
    key: i => Object.keys(data)[i] ?? null,
    removeItem: key => { delete data[key]; },
    setItem: (key, value) => { data[key] = String(value); },
  };
}

const IDS: readonly ScreenHintId[] = ['scrapbook', 'settings', 'endless'];
const src = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('first-visit hints', () => {
  it('are shown once each, kept apart from each other and from every other teach flag', () => {
    const storage = memory({ 'small-acts.teach.v1': JSON.stringify({ seen: true, triplet: true }) });
    for (const id of IDS) expect(seenScreenHint(id, storage)).toBe(false);
    expect(markScreenHintSeen('settings', storage)).toBe(true);
    expect(seenScreenHint('settings', storage)).toBe(true);
    expect(seenScreenHint('scrapbook', storage)).toBe(false);
    expect(seenScreenHint('endless', storage)).toBe(false);
    expect(readTeachFlags(storage)).toMatchObject({ seen: true, triplet: true, hintSettings: true });
    // Being told what a keepsake is on a result is not having been shown the book.
    markScrapbookSeen(storage);
    expect(seenScrapbook(storage)).toBe(true);
    expect(seenScreenHint('scrapbook', storage)).toBe(false);
    markScreenHintSeen('scrapbook', storage);
    markScreenHintSeen('endless', storage);
    for (const id of IDS) expect(seenScreenHint(id, storage)).toBe(true);
    expect(readTeachFlags(storage)).toMatchObject({ seen: true, triplet: true, scrapbook: true });
  });

  it('live on the device: in the teach object, never in the cloud save', () => {
    for (const flag of ['hintScrapbook', 'hintSettings', 'hintEndless'] as const) {
      expect(TEACH_FLAGS).toContain(flag);
      expect(CLOUD_TEACH as readonly string[]).not.toContain(flag);
    }
    // No storage at all is a hint that shows rather than a throw.
    expect(seenScreenHint('endless', null)).toBe(false);
    expect(markScreenHintSeen('endless', null)).toBe(false);
  });

  it('say what each screen is for in a few short lines, and Endless reads its numbers from its rules', () => {
    for (const id of IDS) {
      const copy = SCREEN_HINTS[id];
      expect(copy.lines.length).toBeGreaterThanOrEqual(2);
      expect(copy.lines.length).toBeLessThanOrEqual(4);
      for (const line of copy.lines) expect(line.length).toBeLessThanOrEqual(110);
      expect(copy.title.length).toBeLessThanOrEqual(28);
    }
    const endless = SCREEN_HINTS.endless.lines.join(' ');
    for (const n of [ENDLESS.tempo.startBpm, ENDLESS.tempo.capBpm, ENDLESS.threshold.start, ENDLESS.threshold.peak, ENDLESS.lives.excellentAccuracy]) {
      expect(endless).toContain(String(n));
    }
    expect(endless).toContain('Three Groove Lives');
    // Closing the Endless card starts the run, so a stray tap outside it must not.
    expect(SCREEN_HINTS.endless.outsideCloses).toBe(false);
    expect(SCREEN_HINTS.settings.outsideCloses).toBe(true);
    expect(SCREEN_HINTS.scrapbook.outsideCloses).toBe(true);
  });

  it('stack the card from its rows and keep it inside the frame', () => {
    const s = 0.54, top = 40, bottom = 40 + 1150 * s;
    const plan = planHint(top, bottom, s, 30, [40, 60, 40, 60]);
    expect(plan.y).toBeGreaterThanOrEqual(top + HINT.margin * s);
    expect(plan.y + plan.height).toBeLessThanOrEqual(bottom);
    expect(plan.titleY).toBeGreaterThan(plan.y);
    expect(plan.rows[0]).toBeGreaterThanOrEqual(plan.titleY + 30);
    for (let i = 1; i < plan.rows.length; i++) expect(plan.rows[i]! - plan.rows[i - 1]!).toBeGreaterThanOrEqual(40);
    expect(plan.buttonY).toBeGreaterThan(plan.rows.at(-1)! + 60);
    expect(plan.buttonY + (HINT.buttonHeight + HINT.foot) * s).toBeCloseTo(plan.y + plan.height, 6);
    // Centred when it fits; on a frame too short for it, it hangs from the top rather than off it.
    expect(plan.y + plan.height / 2).toBeCloseTo((top + bottom) / 2, 6);
    const tall = planHint(top, top + 300, s, 30, [200, 200, 200]);
    expect(tall.y).toBe(top + HINT.margin * s);
    // A row is never shorter than its bead.
    const short = planHint(top, bottom, s, 30, [1, 1]);
    expect(short.rows[1]! - short.rows[0]!).toBeCloseTo((HINT.bead * 2 + HINT.rowGap) * s, 6);
  });

  it('are opened by each of their screens once the curtain is up, and take the back button and every tap first', () => {
    for (const [id, scene] of [['scrapbook', 'ScrapbookScene'], ['settings', 'SettingsScene'], ['endless', 'EndlessScene']] as const) {
      const code = src(`src/scenes/${scene}.ts`);
      expect(code).toContain(`new ScreenHint(this, '${id}'`);
      expect(code).toContain('this.hint.showIfNew(');
      expect(code).toContain('this.hint.layout(this.viewport, s)');
      expect(code).toContain('this.hint.update(');
      expect(code).toMatch(/handleBack\(\): boolean \{[^}]*?if \(this\.hint\.back\(\)\) return true;/s);
      expect(code).toContain('this.hint.tap(');
    }
    // The run starts when the card closes, never under it.
    const endless = src('src/scenes/EndlessScene.ts');
    expect(endless).toContain("if (!this.hint.showIfNew(performance.now() / 1000)) void this.start();");
    expect(endless).toContain("how === 'back') this.leaveRun(); else void this.start();");
  });

  it('label the icon-only pucks until each has been opened, on the device only', () => {
    const storage = memory({ 'small-acts.teach.v1': JSON.stringify({ seen: true }) });
    expect(seenPuck('objectives', storage)).toBe(false);
    expect(seenPuck('endless', storage)).toBe(false);
    markPuckSeen('objectives', storage);
    expect(seenPuck('objectives', storage)).toBe(true);
    expect(seenPuck('endless', storage)).toBe(false);
    expect(seenPuck('store', storage)).toBe(false);
    expect(readTeachFlags(storage)).toMatchObject({ seen: true, puckObjectives: true });
    for (const flag of ['puckObjectives', 'puckEndless', 'puckStore'] as const) expect(CLOUD_TEACH as readonly string[]).not.toContain(flag);
    // Each label goes when its puck opens, on whichever screen it was opened from.
    const menu = src('src/scenes/MenuScene.ts'), map = src('src/scenes/MapScene.ts');
    expect(menu).toContain("new PuckLabel(this, 'Scrapbook'");
    expect(menu).toContain("!seenScreenHint('scrapbook')");
    expect(menu).toContain("markPuckSeen('objectives')");
    expect(map).toContain("markPuckSeen('objectives')");
    expect(map).toContain("markPuckSeen('endless')");
    expect(map).toContain("markPuckSeen('store')");
    expect(map).toContain("new PuckLabel(this, 'Store'");
    expect(map).toContain('Opens after level ${ENDLESS.unlockLevel}');
  });
});
