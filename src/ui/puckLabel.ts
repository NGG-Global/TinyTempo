import Phaser from 'phaser';
import { STYLE } from '../config/style';
import { PALETTE, SHELL } from '../config/theme';
import { label, resize } from './type';

/** Design-unit metrics, scaled by the scene's `s`. */
const TAG = Object.freeze({
  size: 20,
  height: 44,
  pad: 18,
  /** The point toward the puck, and the air between it and the puck's rim. */
  point: 9,
  gap: 8,
});

/**
 * A short label beside an icon-only puck — "Scrapbook", "Objectives", "Opens after level
 * 100" — for a player who has not yet opened it: an ink tag pointing at the puck, the one
 * thing an icon cannot say for itself. Whether it shows is the scene's (`seenPuck`,
 * `seenScreenHint`); this only draws it. It draws nothing interactive and takes no tap: a
 * tap on it is the scene's, and the scene's own hit test is on the puck.
 */
export class PuckLabel {
  private readonly tag: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private shown = false;

  public constructor(scene: Phaser.Scene, words: string, depth: number) {
    this.tag = scene.add.graphics().setDepth(depth).setVisible(false);
    this.text = label(scene, words, { size: TAG.size, colour: SHELL.cream }).setOrigin(0, 0.5).setDepth(depth + 1).setVisible(false);
  }

  public get visible(): boolean { return this.shown; }

  /**
   * New words, for a tag whose meaning follows the puck's state ("Opens after level 100",
   * then "Endless"). Guarded, since the scene places the tag on every redraw and a `setText`
   * re-rasterises; the next `place` measures the new width.
   */
  public setWords(words: string): void {
    if (words === this.text.text) return;
    this.text.setText(words);
  }

  /** Where the puck is, its radius, and which side of it the tag hangs: right of it, under it or over it. */
  public place(x: number, y: number, radius: number, side: 'right' | 'below' | 'above', s: number, show: boolean): void {
    this.shown = show;
    const g = this.tag.clear().setVisible(show);
    this.text.setVisible(show);
    if (!show) return;
    resize(this.text, TAG.size * s, SHELL.cream, STYLE.current, false);
    const h = TAG.height * s, w = this.text.width + TAG.pad * 2 * s, point = TAG.point * s, gap = TAG.gap * s;
    const left = side === 'right' ? x + radius + gap + point : x - radius * 0.6;
    const top = side === 'right' ? y - h / 2 : side === 'below' ? y + radius + gap + point : y - radius - gap - point - h;
    g.fillStyle(PALETTE.ink, 1).fillRoundedRect(left, top, w, h, h / 2);
    if (side === 'right') g.fillTriangle(left - point, y, left + 2 * s, y - point, left + 2 * s, y + point);
    else if (side === 'below') g.fillTriangle(x, top - point, x - point, top + 2 * s, x + point, top + 2 * s);
    else g.fillTriangle(x, top + h + point, x - point, top + h - 2 * s, x + point, top + h - 2 * s);
    this.text.setPosition(left + TAG.pad * s, top + h / 2);
  }

  /** Scroll-free, for a scene whose camera moves (the map). */
  public fixed(): this {
    this.tag.setScrollFactor(0);
    this.text.setScrollFactor(0);
    return this;
  }
}
