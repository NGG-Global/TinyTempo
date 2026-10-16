import Phaser from 'phaser';
import { STYLE } from '../config/style';
import { PALETTE, SHELL } from '../config/theme';
import { routeNoticeCopy, type AudioRoute } from '../game/routeCalibration';
import { drawPanel, Rect } from './panel';
import { body, label, resize } from './type';

/** Design-unit metrics, scaled by the scene's `s`. */
const NOTICE = Object.freeze({
  width: 644,
  height: 112,
  /** Kept clear above whatever the card sits on. */
  gap: 14,
  pad: 24,
  titleSize: 25,
  noteSize: 20,
  tuneWidth: 132,
  closeWidth: 72,
});

/** What a tap on the card asked for, or null when it missed it. */
export type RouteNoticeTap = 'tune' | 'close' | null;

/**
 * The small, non-blocking note that the audio route has changed to one never calibrated:
 * "Bluetooth audio detected / Calibrate timing for the best accuracy.", a Tune chip that
 * opens the existing calibration screen, and a close mark. The same card says when the last
 * few levels on the route all leaned one way the way a device does ("Tapping about 70 ms
 * late"), since Tune is the fix for that too. A card in screen space on a
 * shell screen, never over a level: a round in progress is never interrupted, and the
 * next run is where the advice is useful. Whether it shows is `routeNoticeWanted` in
 * `audio/audioRoute.ts`; this file only draws it and says what a tap meant.
 */
export class RouteNotice {
  private readonly plate: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly note: Phaser.GameObjects.Text;
  private readonly tuneLabel: Phaser.GameObjects.Text;
  private readonly card = new Phaser.Geom.Rectangle();
  private readonly tune = new Phaser.Geom.Rectangle();
  private readonly close = new Phaser.Geom.Rectangle();
  private s = 1;
  private room = Infinity;
  private shownRoute: AudioRoute | null = null;
  private shownLean: number | null = null;

  public constructor(scene: Phaser.Scene, depth: number) {
    this.plate = scene.add.graphics().setScrollFactor(0).setDepth(depth).setVisible(false);
    this.title = body(scene, '', { size: NOTICE.titleSize, colour: PALETTE.ink }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(depth + 1).setVisible(false);
    this.note = body(scene, 'Calibrate timing for the best accuracy.', { size: NOTICE.noteSize, colour: PALETTE.muted })
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(depth + 1).setVisible(false);
    this.tuneLabel = label(scene, 'Tune', { size: 24, colour: SHELL.cream, align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(depth + 1).setVisible(false);
  }

  public get visible(): boolean { return this.shownRoute !== null; }

  /**
   * Where the card sits: centred on `centerX`, its bottom `gap` above `bottom` — the top of
   * whatever the thumb rests on. `control` is the scene's touch-target size, so Tune and
   * the close mark are never smaller than a thumb.
   */
  public layout(centerX: number, bottom: number, maxWidth: number, s: number, control: number): void {
    this.s = s;
    const width = Math.min(NOTICE.width * s, maxWidth);
    const height = Math.max(NOTICE.height * s, control + 16 * s);
    this.card.setTo(centerX - width / 2, bottom - NOTICE.gap * s - height, width, height);
    const closeW = Math.max(NOTICE.closeWidth * s, control);
    this.close.setTo(this.card.right - closeW, this.card.y, closeW, height);
    const tuneW = Math.max(NOTICE.tuneWidth * s, control);
    const tuneH = Math.max(64 * s, Math.min(control, height - 16 * s));
    this.tune.setTo(this.close.x - tuneW, this.card.centerY - tuneH / 2, tuneW, tuneH);
    resize(this.title, NOTICE.titleSize * s, PALETTE.ink, STYLE.current, false);
    resize(this.note, NOTICE.noteSize * s, PALETTE.muted, STYLE.current, false);
    resize(this.tuneLabel, 24 * s, SHELL.cream, STYLE.current, false);
    // The words shrink rather than run under Tune on a narrow handset.
    this.room = this.tune.x - 12 * s - (this.card.x + NOTICE.pad * s);
    this.fit();
    this.draw();
  }

  /**
   * Show the card for `route`, or hide it with null. With a `leanMs` it names the lean the
   * last levels on the route shared; without, that the route was never calibrated.
   */
  public show(route: AudioRoute | null, leanMs: number | null = null): void {
    if (route === this.shownRoute && leanMs === this.shownLean) return;
    this.shownRoute = route;
    this.shownLean = leanMs;
    if (route !== null) {
      const copy = routeNoticeCopy(route, leanMs);
      this.title.setText(copy.title);
      this.note.setText(copy.note);
      this.fit();
    }
    this.draw();
  }

  private fit(): void {
    for (const text of [this.title, this.note]) {
      text.setScale(1);
      text.setScale(text.width > this.room ? this.room / text.width : 1);
    }
  }

  /** What a tap meant. Anywhere on the card but the close mark is Tune: the card is the offer. */
  public tap(x: number, y: number): RouteNoticeTap {
    if (this.shownRoute === null || !this.card.contains(x, y)) return null;
    return this.close.contains(x, y) ? 'close' : 'tune';
  }

  private draw(): void {
    const shown = this.shownRoute !== null;
    for (const part of [this.plate, this.title, this.note, this.tuneLabel]) part.setVisible(shown);
    const g = this.plate.clear();
    if (!shown) return;
    const s = this.s, r = this.card;
    drawPanel(g, new Rect(r.x, r.y, r.width, r.height), s, { fill: SHELL.cream, depth: 8, radius: 22 });
    const textX = r.x + NOTICE.pad * s;
    this.title.setPosition(textX, r.centerY - 15 * s);
    this.note.setPosition(textX, r.centerY + 19 * s);
    const t = this.tune;
    drawPanel(g, new Rect(t.x, t.y, t.width, t.height), s, { fill: PALETTE.coral, depth: 6, radius: Math.min(t.height / 2, 24 * s) });
    this.tuneLabel.setPosition(t.centerX, t.centerY);
    // A drawn ×, no symbol font.
    const cx = this.close.centerX, cy = r.centerY, arm = 9 * s;
    g.lineStyle(3.5 * s, PALETTE.muted, 1)
      .lineBetween(cx - arm, cy - arm, cx + arm, cy + arm)
      .lineBetween(cx - arm, cy + arm, cx + arm, cy - arm);
  }
}
