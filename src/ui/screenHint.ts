import Phaser from 'phaser';
import { LAYOUT } from '../config/design';
import { STYLE } from '../config/style';
import { PALETTE, SHELL } from '../config/theme';
import type { Viewport } from '../core/Viewport';
import { vibrate } from '../core/haptics';
import { markScreenHintSeen, seenScreenHint } from '../game/progress';
import { SCREEN_HINTS, type HintClose, type ScreenHintCopy, type ScreenHintId } from '../game/screenHints';
import { HINT, planHint } from './hintLayout';
import { drawPanel, Rect } from './panel';
import { arrive } from './spring';
import { balanceWrap, body, display, label, resize } from './type';

/**
 * A screen's first-visit hint (`game/screenHints.ts`): a cream card over a dimmed screen,
 * its name, a title, a few numbered lines and one button, shown once on this device and
 * marked seen when it is closed.
 *
 * **It is drawn by a camera of its own**, added after every camera the scene already has.
 * Settings and the Scrapbook scroll their content under a second camera whose viewport is
 * the clip (Phaser 4 has no WebGL geometry masks), and that camera renders after the main
 * one, so a card on the main camera would sit *under* the sections it is meant to cover.
 * The hint's camera renders only the hint, every other camera ignores it, and it is
 * visible only while the card is open.
 *
 * The scene routes taps to it while it is open, and every tap is the card's: nothing under
 * it fires, scrolls or starts. It does not read pointers itself, because each scene already
 * has its own idea of a tap: Settings and the Scrapbook fire on the release, Endless on the
 * press.
 */
export class ScreenHint {
  private readonly copy: ScreenHintCopy;
  private readonly layer: Phaser.GameObjects.Container;
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly scrim: Phaser.GameObjects.Graphics;
  private readonly plate: Phaser.GameObjects.Graphics;
  private readonly eyebrow: Phaser.GameObjects.Text;
  private readonly title: Phaser.GameObjects.Text;
  private readonly rows: readonly { readonly bead: Phaser.GameObjects.Text; readonly line: Phaser.GameObjects.Text }[];
  private readonly actionLabel: Phaser.GameObjects.Text;
  /** The quieter second answer, on a card that asks a question; null on a plain hint. */
  private readonly secondaryLabel: Phaser.GameObjects.Text | null;
  private readonly cardRect = new Rect();
  private readonly actionRect = new Rect();
  private readonly secondaryRect = new Rect();
  /** Each line's first row of text, for the bead to sit on. Measured at layout. */
  private firstLine: number[] = [];
  private shown = false;
  private openedAt = -Infinity;
  private settled = false;
  /** The display list's length when the cameras were last told what to ignore. */
  private isolated = -1;
  private frame = { x: 0, y: 0, width: 1, height: 1, centerX: 0, top: 0, bottom: 1, safeWidth: 1, s: 1 };

  /**
   * Built at the end of a scene's `build()`, after any camera it adds. `onClose` hears how
   * the card was closed once it has been marked seen.
   */
  public constructor(private readonly scene: Phaser.Scene, private readonly id: ScreenHintId, private readonly onClose: (how: HintClose) => void = () => {}) {
    this.copy = SCREEN_HINTS[id];
    this.scrim = scene.add.graphics();
    this.plate = scene.add.graphics();
    this.eyebrow = label(scene, this.copy.eyebrow, { size: 20, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5);
    this.title = display(scene, this.copy.title, { size: 42, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5, 0);
    this.rows = this.copy.lines.map((text, i) => ({
      bead: label(scene, String(i + 1), { size: 20, colour: SHELL.cream, align: 'center' }).setOrigin(0.5),
      line: body(scene, text, { size: 25, colour: PALETTE.ink }).setOrigin(0, 0),
    }));
    this.actionLabel = display(scene, this.copy.action, { size: 32, colour: SHELL.cream, align: 'center' }).setOrigin(0.5);
    this.secondaryLabel = this.copy.secondary === undefined ? null
      : display(scene, this.copy.secondary, { size: 30, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5);
    this.layer = scene.add.container(0, 0, [
      this.scrim, this.plate, this.eyebrow, this.title, ...this.rows.flatMap(r => [r.bead, r.line]), this.actionLabel,
      ...(this.secondaryLabel === null ? [] : [this.secondaryLabel]),
    ]).setDepth(1000).setVisible(false);
    this.camera = scene.cameras.add(0, 0, 1, 1, false, 'hint').setVisible(false);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  /** Whether this screen's hint still has to be shown on this device. */
  public get wanted(): boolean { return !seenScreenHint(this.id); }

  public get open(): boolean { return this.shown; }

  /** Open the card if the player has never closed it. `at` is the scene's seconds. True when it opened. */
  public showIfNew(at: number): boolean {
    if (this.shown || !this.wanted) return false;
    this.shown = true;
    this.openedAt = at;
    this.settled = false;
    this.isolate();
    this.layer.setVisible(true);
    this.camera.setVisible(true);
    this.draw(0, 1);
    return true;
  }

  /** From the scene's `layout()`. */
  public layout(viewport: Viewport, s: number): void {
    const { full, safe } = viewport;
    this.frame = { x: full.x, y: full.y, width: full.width, height: full.height, centerX: safe.centerX, top: safe.y, bottom: safe.y + safe.height, safeWidth: safe.width, s };
    this.camera.setViewport(full.x, full.y, full.width, full.height);
    resize(this.eyebrow, 20 * s, PALETTE.muted, STYLE.current, false);
    resize(this.title, 42 * s, PALETTE.ink);
    for (const row of this.rows) {
      resize(row.bead, 20 * s, SHELL.cream, STYLE.current, false);
      resize(row.line, 25 * s, PALETTE.ink, STYLE.current, false);
    }
    resize(this.actionLabel, 32 * s, SHELL.cream);
    if (this.secondaryLabel !== null) resize(this.secondaryLabel, 30 * s, PALETTE.ink, STYLE.current, false);
    const width = this.cardWidth();
    balanceWrap(this.title, width - 2 * HINT.pad * s);
    // Balanced, so no line ends on one word alone ("…came / from.").
    for (const row of this.rows) balanceWrap(row.line, this.lineWidth(width));
    this.firstLine = this.rows.map(row => row.line.height / Math.max(1, row.line.getWrappedText().length));
    this.settled = false;
    if (this.shown) this.draw(0, 1);
  }

  /** Every frame from the scene's `update`: the entry, and anything added to the scene since it opened. */
  public update(at: number, still: boolean): void {
    if (!this.shown) return;
    if (this.scene.children.list.length !== this.isolated) this.isolate();
    if (this.settled) return;
    const age = at - this.openedAt;
    const pose = still ? { rise: 0, alpha: 1 } : arrive(age, HINT.enterSec);
    this.draw(pose.rise * 40 * this.frame.s, pose.alpha);
    this.settled = still || age > HINT.enterSec + 0.1;
  }

  /**
   * A tap while the card is open. Always the card's: true means the scene must do nothing
   * else with it. The button closes it; outside the card closes it where the copy allows;
   * nothing closes it in its first `HINT.armSec`.
   */
  public tap(x: number, y: number, at: number): boolean {
    if (!this.shown) return false;
    if (at - this.openedAt < HINT.armSec) return true;
    if (this.actionRect.contains(x, y)) { vibrate('tap'); this.close('action'); }
    else if (this.secondaryLabel !== null && this.secondaryRect.contains(x, y)) { vibrate('tap'); this.close('secondary'); }
    else if (!this.cardRect.contains(x, y) && this.copy.outsideCloses) this.close('outside');
    return true;
  }

  /** Android's back while the card is open closes it. True when it took the press. */
  public back(): boolean {
    if (!this.shown) return false;
    this.close('back');
    return true;
  }

  private close(how: HintClose): void {
    this.shown = false;
    this.layer.setVisible(false);
    this.camera.setVisible(false);
    markScreenHintSeen(this.id);
    this.onClose(how);
  }

  /** The hint's camera draws the hint and nothing else; every other camera draws everything but. */
  private isolate(): void {
    const list = this.scene.children.list;
    this.camera.ignore(list.filter(child => child !== this.layer));
    for (const camera of this.scene.cameras.cameras) if (camera !== this.camera) camera.ignore(this.layer);
    this.isolated = list.length;
  }

  private cardWidth(): number {
    const s = this.frame.s;
    return Math.min(HINT.width * s, this.frame.safeWidth - 2 * HINT.margin * s);
  }

  private lineWidth(cardWidth: number): number {
    const s = this.frame.s;
    return cardWidth - 2 * HINT.pad * s - (HINT.bead * 2 + HINT.beadGap) * s;
  }

  private draw(rise: number, alpha: number): void {
    const f = this.frame, s = f.s;
    const width = this.cardWidth();
    const r = HINT.bead * s;
    // A line hangs so its first row of text is centred on its bead, not a wrapped pair.
    const drop = this.rows.map((_, i) => Math.max(0, r - (this.firstLine[i] ?? 0) / 2));
    const stack = planHint(f.top, f.bottom, s, this.title.height, this.rows.map((row, i) => drop[i]! + row.line.height));
    const x = f.centerX - width / 2, y = stack.y + rise;
    this.cardRect.setTo(x, stack.y, width, stack.height);
    this.scrim.clear().setAlpha(alpha).fillStyle(0x1a201c, 0.5).fillRect(f.x, f.y, f.width, f.height);
    const g = this.plate.clear().setAlpha(alpha);
    drawPanel(g, new Rect(x, y, width, stack.height), s, { fill: SHELL.cream, depth: 12, radius: 32, hero: true });
    const place = (text: Phaser.GameObjects.Text, tx: number, ty: number): void => { text.setPosition(tx, ty).setAlpha(alpha); };
    place(this.eyebrow, f.centerX, y + HINT.eyebrowY * s);
    place(this.title, f.centerX, stack.titleY + rise);
    const left = x + HINT.pad * s;
    this.rows.forEach((row, i) => {
      const top = stack.rows[i]! + rise;
      const beadY = top + Math.max(r, (this.firstLine[i] ?? 0) / 2);
      g.fillStyle(PALETTE.coral, 1).fillCircle(left + r, beadY, r);
      place(row.bead, left + r, beadY);
      place(row.line, left + 2 * r + HINT.beadGap * s, top + drop[i]!);
    });
    const bh = HINT.buttonHeight * s;
    const by = stack.buttonY + rise;
    // The target is the touch floor at least, centred on the drawn block.
    const hit = Math.max(bh, LAYOUT.minTouchTarget * s);
    const inner = width - 2 * HINT.pad * s;
    if (this.secondaryLabel === null) {
      const bw = Math.min(HINT.buttonWidth * s, inner);
      drawPanel(g, new Rect(f.centerX - bw / 2, by, bw, bh), s, { fill: PALETTE.coral, depth: 8 });
      place(this.actionLabel, f.centerX, by + bh / 2);
      this.actionRect.setTo(f.centerX - bw / 2, stack.buttonY + bh / 2 - hit / 2, bw, hit);
      return;
    }
    // A question: the quieter answer in bench wood on the left, the coral one on the right,
    // side by side and the same size, so neither is the only way out.
    const gap = HINT.buttonGap * s / 2;
    const bw = Math.min(HINT.buttonWidth * s, (inner - gap) / 2);
    const quiet = f.centerX - gap / 2 - bw, right = f.centerX + gap / 2;
    drawPanel(g, new Rect(quiet, by, bw, bh), s, { fill: SHELL.bench, depth: 8 });
    drawPanel(g, new Rect(right, by, bw, bh), s, { fill: PALETTE.coral, depth: 8 });
    place(this.secondaryLabel, quiet + bw / 2, by + bh / 2);
    place(this.actionLabel, right + bw / 2, by + bh / 2);
    for (const [text, room] of [[this.secondaryLabel, bw - 24 * s], [this.actionLabel, bw - 24 * s]] as const) {
      text.setScale(text.width > room ? room / text.width : 1);
    }
    this.secondaryRect.setTo(quiet, stack.buttonY + bh / 2 - hit / 2, bw, hit);
    this.actionRect.setTo(right, stack.buttonY + bh / 2 - hit / 2, bw, hit);
  }

  private destroy(): void {
    this.scene.cameras.remove(this.camera);
  }
}
