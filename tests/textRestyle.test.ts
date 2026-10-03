import { describe, expect, it, vi } from 'vitest';
import { restyle, type RestyleTarget, type TextLook } from '../src/ui/type';

vi.mock('phaser', () => ({ default: {} }));

/**
 * `resize` runs on the frame of every judged tap and every count-in strike. Phaser's
 * per-field setters redraw the text's canvas and re-upload its texture on every call, so
 * `restyle` says what has to be redrawn, at most once, and nothing when nothing changed.
 */

const look = (size: number, colour = '#cf5134'): TextLook => ({
  fontSize: `${size}px`, color: colour, stroke: '#2e2a26', strokeThickness: size / 20,
  shadow: [0, size * 0.07, '#1d1a17', 0, true, true], padding: { left: 1, right: 1, top: 6, bottom: 6 },
});

function blank(): { style: RestyleTarget; padding: Partial<TextLook['padding']> } {
  return {
    style: { fontSize: '10px', color: '#000', stroke: '#fff', strokeThickness: 0, shadowOffsetX: 0, shadowOffsetY: 0, shadowColor: '#000', shadowBlur: 0, shadowStroke: false, shadowFill: true },
    padding: { left: 0, right: 0, top: 0, bottom: 0 },
  };
}

describe('restyling a text', () => {
  it('asks for nothing when the text already looks that way', () => {
    const { style, padding } = blank();
    expect(restyle(look(56), style, padding)).toBe('metrics');
    expect(restyle(look(56), style, padding)).toBe('none');
  });

  it('re-measures when the size or the outline moves, since the line height moves with them', () => {
    const { style, padding } = blank();
    restyle(look(56), style, padding);
    expect(restyle(look(60), style, padding)).toBe('metrics');
    expect(restyle({ ...look(60), strokeThickness: 9 }, style, padding)).toBe('metrics');
  });

  it('only repaints for a new colour, shadow or padding', () => {
    const { style, padding } = blank();
    restyle(look(56), style, padding);
    expect(restyle(look(56, '#2e2a26'), style, padding)).toBe('texture');
    expect(restyle({ ...look(56, '#2e2a26'), shadow: [0, 5, '#000', 0, true, true] }, style, padding)).toBe('texture');
    expect(restyle({ ...look(56, '#2e2a26'), shadow: [0, 5, '#000', 0, true, true], padding: { left: 1, right: 1, top: 9, bottom: 9 } }, style, padding)).toBe('texture');
  });

  it('writes every field it was given', () => {
    const { style, padding } = blank();
    restyle(look(48), style, padding);
    expect(style).toMatchObject({ fontSize: '48px', color: '#cf5134', stroke: '#2e2a26', strokeThickness: 2.4, shadowOffsetY: 48 * 0.07, shadowColor: '#1d1a17', shadowStroke: true, shadowFill: true });
    expect(padding).toEqual({ left: 1, right: 1, top: 6, bottom: 6 });
  });
});
