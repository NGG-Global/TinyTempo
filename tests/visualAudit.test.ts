import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { balanceWrap, dressPad } from '../src/ui/type';

vi.mock('phaser', () => ({ default: {} }));

/**
 * The defects a visual audit found, pinned so they stay found. Each one was seen in a
 * screenshot first; the comment says which.
 */

/** A text that wraps by a fixed character width, so the line count is a pure function of the wrap. */
function fakeText(content: string, charWidth = 10) {
  const style = { wordWrapWidth: 0 as number | null, wordWrapUseAdvanced: false };
  const wrap = (width: number): string[] => {
    const lines: string[] = [];
    for (const hard of content.split('\n')) {
      let line = '';
      for (const word of hard.split(' ')) {
        const next = line === '' ? word : `${line} ${word}`;
        if (line !== '' && next.length * charWidth > width) { lines.push(line); line = word; } else line = next;
      }
      lines.push(line);
    }
    return lines;
  };
  const text = {
    style,
    getWrappedText: () => (style.wordWrapWidth ? wrap(style.wordWrapWidth) : content.split('\n')),
    setWordWrapWidth: (width: number) => { style.wordWrapWidth = width; return text; },
  };
  return text;
}

describe('dressed type', () => {
  it('puts no blank space beside a letter, so a left-aligned headline lines up with the body under it', () => {
    // Settings' "Premium" sat five units right of its terms, the map's "Watch" right of
    // "30 seconds": the padding was a stroke and a pixel on each side, on top of the room
    // Phaser already leaves for the stroke inside the line.
    for (const [size, stroke] of [[56, 3.4], [36, 2], [22, 1.5]] as const) {
      const pad = dressPad(size, stroke);
      expect(pad.left).toBe(1);
      expect(pad.right).toBe(1);
      // The drop shadow still has its room below, and the box stays centred on the letter.
      expect(pad.bottom).toBeGreaterThan(stroke);
      expect(pad.top).toBe(pad.bottom);
    }
  });
});

describe('balanced wrapping', () => {
  it('leaves no word alone on the last line of a centred caption', () => {
    // Calibrate: "Tap anywhere on every beat. Eight / taps and the workshop knows your / device."
    const copy = 'Tap anywhere on every beat. Eight taps and the workshop knows your device.';
    const text = fakeText(copy);
    balanceWrap(text as never, 360);
    const lines = text.getWrappedText();
    expect(lines.length).toBe(fakeText(copy).setWordWrapWidth(360).getWrappedText().length);
    const lengths = lines.map(line => line.length);
    expect(Math.min(...lengths) / Math.max(...lengths)).toBeGreaterThan(0.6);
    expect(text.style.wordWrapWidth).toBeLessThanOrEqual(360);
  });

  it('never adds a line, never widens, and keeps hand-made breaks', () => {
    const one = fakeText('Short line');
    balanceWrap(one as never, 400);
    expect(one.getWrappedText()).toEqual(['Short line']);
    expect(one.style.wordWrapWidth).toBe(400);
    const authored = fakeText('Make it\nstick.');
    balanceWrap(authored as never, 400);
    expect(authored.getWrappedText()).toEqual(['Make it', 'stick.']);
  });
});

const source = (file: string) => readFileSync(file, 'utf8');
const between = (text: string, from: string, to: string) => text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)));

describe('the play scene starts every visit clean', () => {
  it('resets the last visit\'s result in build(), not only in startRound()', () => {
    // A start the hearts refused never reached startRound's reset, so the empty-hearts
    // screen drew the previous level's plaque — blank medals, "On the beat", "Heart kept".
    const build = between(source('src/scenes/PlayScene.ts'), 'protected override build(): void {', 'const data = this.sys.settings.data');
    for (const reset of [
      'this.summaryShown = false', 'this.heartRefunded = false', 'this.summaryStars = 0', 'this.results = []',
      'this.replayOffered = false', 'this.finaleCleared = false', "this.actionCaption = ''", 'this.timingOpen = false',
      'this.resultPlan = null', 'this.teach = null',
    ]) expect(build, reset).toContain(reset);
  });
});

describe('the map', () => {
  it('lays an open gate\'s posts with the road, under the stops and their star plates', () => {
    // The left post of an open gate cut through the middle star of the area's first level.
    const map = source('src/scenes/MapScene.ts');
    const bake = between(map, 'this.drawRoad(g, s, strip);', 'this.drawCrest(s);');
    expect(bake.indexOf('this.drawOpenGates(g, s, strip)')).toBeGreaterThan(-1);
    expect(bake.indexOf('this.drawOpenGates(g, s, strip)')).toBeLessThan(bake.indexOf('this.drawNodes(g, s, strip)'));
    const gates = between(map, 'private drawStarGates(s: number): void {', 'private placeGateSign(');
    const open = between(gates, 'if (!closed) {', 'continue;');
    expect(open).not.toContain('drawBarrier');
  });

  it('fades the frame under the header, so a stop or a board never reads as part of it', () => {
    const map = source('src/scenes/MapScene.ts');
    expect(map).toContain('private drawHaze(): void {');
    expect(between(map, 'private clampScroll(): void {', 'private drawHaze')).toContain('this.drawHaze();');
  });
});

describe('the hammer on a short-for-its-width frame', () => {
  it('stands under the title sign and under the lesson\'s caption, scaling down where it must', () => {
    // On a 4:3 tablet the raised head touched the title sign and lay across the caption.
    const act = source('src/vignettes/HammerNailVignette.ts');
    const layout = between(act, 'public layout(viewport: Viewport, benchY?: number, headroom?: number): void {', 'this.stage.setPosition');
    expect(layout).toContain('(this.baseY - headroom) / HAMMER_REACH');
    // Only ever smaller than the cover's own scale: a phone keeps the pose it had.
    expect(layout).toMatch(/Math\.min\(scale, \(this\.baseY - headroom\) \/ HAMMER_REACH\)/);
    expect(source('src/scenes/MenuScene.ts')).toContain('this.illustration.layout(this.viewport, undefined, safe.top + (MENU.sign.top + MENU.sign.height + 36) * s);');
    const tutorial = between(source('src/scenes/TutorialScene.ts'), 'protected override layout(): void {', 'this.stepLabel.setPosition');
    // The caption is placed before the act is laid out under it.
    expect(tutorial.indexOf('this.copy.setPosition')).toBeLessThan(tutorial.indexOf('this.illustration.layout('));
  });
});
