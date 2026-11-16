import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MENU_ROW, menuRow, rowBlocks } from '../src/ui/menuRow';

describe('the title screen’s row over Play', () => {
  it('seats Daily first, then Endless or How to play, and never three', () => {
    expect(rowBlocks({ daily: false, endless: false, lesson: false })).toEqual([]);
    expect(rowBlocks({ daily: false, endless: false, lesson: true })).toEqual(['lesson']);
    expect(rowBlocks({ daily: false, endless: true, lesson: false })).toEqual(['endless']);
    // Endless open and the lesson still wanted: the two side by side, as before.
    expect(rowBlocks({ daily: false, endless: true, lesson: true })).toEqual(['endless', 'lesson']);
    expect(rowBlocks({ daily: true, endless: false, lesson: false })).toEqual(['daily']);
    expect(rowBlocks({ daily: true, endless: false, lesson: true })).toEqual(['daily', 'lesson']);
    expect(rowBlocks({ daily: true, endless: true, lesson: false })).toEqual(['daily', 'endless']);
    // All three wanted: How to play leaves the row for Settings → Help.
    expect(rowBlocks({ daily: true, endless: true, lesson: true })).toEqual(['daily', 'endless']);
  });

  it('fills the span with one block, or splits it with a gap, with the smaller label', () => {
    const span = { left: 160, right: 640 };
    const one = menuRow({ daily: true, endless: false, lesson: false }, span, 1000, 96, 1);
    expect(one.daily).toEqual({ x: 160, y: 1000, width: 480, height: 96 });
    expect(one.endless).toBeNull();
    expect(one.lesson).toBeNull();
    expect(one.labelSize).toBe(MENU_ROW.label);
    const two = menuRow({ daily: true, endless: true, lesson: true }, span, 1000, 96, 1);
    const half = (480 - MENU_ROW.gap) / 2;
    expect(two.daily).toEqual({ x: 160, y: 1000, width: half, height: 96 });
    expect(two.endless).toEqual({ x: 160 + half + MENU_ROW.gap, y: 1000, width: half, height: 96 });
    expect(two.lesson).toBeNull();
    expect(two.labelSize).toBe(MENU_ROW.splitLabel);
    // The gap scales with the scene; the span is already in the scene's units.
    const scaled = menuRow({ daily: true, endless: false, lesson: true }, { left: 100, right: 700 }, 800, 120, 1.5);
    const scaledHalf = (600 - MENU_ROW.gap * 1.5) / 2;
    expect(scaled.daily).toEqual({ x: 100, y: 800, width: scaledHalf, height: 120 });
    expect(scaled.lesson).toEqual({ x: 100 + scaledHalf + MENU_ROW.gap * 1.5, y: 800, width: scaledHalf, height: 120 });
    // The two blocks together span exactly the row: the right one's edge is the span's.
    expect(scaled.lesson!.x + scaled.lesson!.width).toBeCloseTo(700);
    // An empty row has no frames, and a span narrower than its gap never goes negative.
    const none = menuRow({ daily: false, endless: false, lesson: false }, span, 1000, 96, 1);
    expect(none.blocks).toEqual([]);
    expect([none.daily, none.endless, none.lesson]).toEqual([null, null, null]);
    const cramped = menuRow({ daily: true, endless: true, lesson: false }, { left: 0, right: 10 }, 0, 96, 1);
    expect(cramped.daily!.width).toBe(0);
  });

  it('is what the title screen lays out from, and its Daily block keeps the theme on the way out', () => {
    const menu = readFileSync('src/scenes/MenuScene.ts', 'utf8');
    expect(menu).toContain('menuRow({ daily: this.dailyOpen, endless: this.endlessOpen, lesson: this.lessonOnMenu }, span');
    // The row runs from the objectives puck to the Play block's right edge, and the puck's
    // left edge sits on Play's, so the bench's controls square up as one object.
    expect(menu).toContain('this.objectivesAt = { x: this.buttonRect.x + CHROME.puckRadius * s, y: rowY + this.controlSize / 2 };');
    expect(menu).toContain('right: this.buttonRect.right }');
    expect(menu).toContain('this.dailyOpen = DAILY_TEMPO_AVAILABLE;');
    // The card's Play is the audio gesture, so the title screen unlocks nothing here and
    // carries its theme on, as it does into Settings and the Scrapbook.
    const open = menu.slice(menu.indexOf('  private openDaily(): void {'), menu.indexOf('  private async startEndless('));
    expect(open).toContain('this.keepTheme = true;');
    expect(open).toContain('this.scene.start(SceneKey.Daily, { from: SceneKey.Menu })');
    expect(open).not.toMatch(/unlock\(|closeTheme/);
    // Today's stars on the block, and a coral dot until the day has had a run.
    expect(menu).toContain("this.dailyStars = today?.bestStars ?? 0;");
    expect(menu).toContain("this.dailyDot = this.dailyOpen && (today?.runs ?? 0) === 0;");
    // The Settings Help row always carries the lesson, so a full row loses nothing.
    const settings = readFileSync('src/scenes/SettingsScene.ts', 'utf8');
    expect(settings).toContain("lesson: rowTitle('How to play')");
    expect(settings).toContain("this.hits.push({ name: 'lesson', rect: lessonRect, pinned: false });");
  });
});
