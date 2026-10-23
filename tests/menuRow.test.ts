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

  it('gives one block the single width and two the split row, with the smaller label', () => {
    const one = menuRow({ daily: true, endless: false, lesson: false }, 360, 1000, 96, 1);
    expect(one.daily).toEqual({ x: 360 - MENU_ROW.single / 2, y: 1000, width: MENU_ROW.single, height: 96 });
    expect(one.endless).toBeNull();
    expect(one.lesson).toBeNull();
    expect(one.labelSize).toBe(MENU_ROW.label);
    const two = menuRow({ daily: true, endless: true, lesson: true }, 360, 1000, 96, 1);
    const half = (MENU_ROW.split - MENU_ROW.gap) / 2;
    expect(two.daily).toEqual({ x: 360 - MENU_ROW.split / 2, y: 1000, width: half, height: 96 });
    expect(two.endless).toEqual({ x: 360 + MENU_ROW.gap / 2, y: 1000, width: half, height: 96 });
    expect(two.lesson).toBeNull();
    expect(two.labelSize).toBe(MENU_ROW.splitLabel);
    // The row scales with the scene, and an empty row has no frames.
    const scaled = menuRow({ daily: false, endless: false, lesson: true }, 480, 800, 120, 1.5);
    expect(scaled.lesson).toEqual({ x: 480 - MENU_ROW.single / 2 * 1.5, y: 800, width: MENU_ROW.single * 1.5, height: 120 });
    const none = menuRow({ daily: false, endless: false, lesson: false }, 360, 1000, 96, 1);
    expect(none.blocks).toEqual([]);
    expect([none.daily, none.endless, none.lesson]).toEqual([null, null, null]);
  });

  it('is what the title screen lays out from, and its Daily block keeps the theme on the way out', () => {
    const menu = readFileSync('src/scenes/MenuScene.ts', 'utf8');
    expect(menu).toContain('menuRow({ daily: this.dailyOpen, endless: this.endlessOpen, lesson: this.lessonOnMenu }');
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
